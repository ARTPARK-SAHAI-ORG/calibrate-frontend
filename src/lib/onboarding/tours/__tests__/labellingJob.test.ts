import { EVAL_TARGET_CHIP_CLASS } from "@/components/test-results/evalTargetChip";
import {
  buildLabellingJobTour,
  type LabellingTourQuestion,
} from "../labellingJob";

const binary: LabellingTourQuestion = {
  uuid: "b",
  outputType: "binary",
  reasoningMode: "hidden",
};
const rating: LabellingTourQuestion = {
  uuid: "r",
  outputType: "rating",
  reasoningMode: "hidden",
};
const build = (
  overrides: Partial<Parameters<typeof buildLabellingJobTour>[0]> = {},
) =>
  buildLabellingJobTour({
    jobUuid: "job-1",
    onPreviewAnswer: jest.fn(),
    kind: "llm",
    hasItemDetails: false,
    questions: [binary],
    commentsEnabled: false,
    ...overrides,
  }).steps;
const titles = (steps: ReturnType<typeof build>) => steps.map((s) => s.title);

describe("buildLabellingJobTour", () => {
  it("has its own seen flag for each job", () => {
    const id = (jobUuid: string) =>
      buildLabellingJobTour({
        jobUuid,
        onPreviewAnswer: jest.fn(),
        kind: "llm",
        hasItemDetails: false,
        questions: [],
        commentsEnabled: false,
      }).id;
    expect(id("a")).toBe("labelling-job:a");
    expect(id("a")).not.toBe(id("b"));
  });

  it("asks for each card to show its place and offer Back", () => {
    expect(
      buildLabellingJobTour({
        jobUuid: "a",
        onPreviewAnswer: jest.fn(),
        kind: "llm",
        hasItemDetails: false,
        questions: [],
        commentsEnabled: false,
      }),
    ).toMatchObject({ showStepCount: true, allowBack: true });
  });

  it("has only the steps this job needs", () => {
    expect(titles(build())).toEqual([
      "Read the conversation",
      "Binary questions",
      "Check your progress",
      "Submit your answers",
    ]);
  });

  it("adds Item details and comments only when they are there", () => {
    const steps = titles(
      build({ hasItemDetails: true, commentsEnabled: true }),
    );
    expect(steps).toContain("Item details");
    expect(steps).toContain("Leave a comment");
  });

  it("shows choices and scores separately when a job has both, on the first of each", () => {
    const steps = build({ questions: [binary, rating] });
    expect(titles(steps)).toContain("Binary questions");
    expect(titles(steps)).toContain("Rating questions");
    expect(steps.find((s) => s.title === "Binary questions")?.anchor).toBe(
      "#question-b",
    );
    expect(steps.find((s) => s.title === "Rating questions")?.anchor).toBe(
      "#question-r",
    );
  });

  it("explains ratings alone when a job has only ratings", () => {
    const steps = build({ questions: [rating] });
    expect(titles(steps)).toContain("Rating questions");
    expect(titles(steps)).not.toContain("Binary questions");
    expect(steps[1].description).toContain("rating");
  });

  it.each([
    ["optional", "After you answer, a box opens for your reason"],
    [
      "required",
      "After you answer, a box opens for your reason. You must write one before you can submit.",
    ],
  ] as const)("words the reason step for %s", (reasoningMode, words) => {
    const step = build({ questions: [{ ...binary, reasoningMode }] }).find(
      (s) => s.title === "Add a reason",
    );
    expect(step?.description).toBe(words);
  });

  it("says some need a reason when a job mixes them, and points at one that has a box", () => {
    const step = build({
      questions: [
        binary,
        { ...rating, reasoningMode: "required" },
        { uuid: "o", outputType: "binary", reasoningMode: "optional" },
      ],
    }).find((s) => s.title === "Add a reason");
    expect(step?.description).toContain("Some questions need one");
    expect(step?.anchor).toBe('#question-r [data-tutorial="reason-box"]');
  });

  it("shows the question answered for the reason step only, and undoes it", async () => {
    const onPreviewAnswer = jest.fn();
    const step = build({
      onPreviewAnswer,
      questions: [{ ...binary, reasoningMode: "optional" }],
    }).find((s) => s.title === "Add a reason");
    expect(step?.anchor).toBe('#question-b [data-tutorial="reason-box"]');
    await step?.prepare?.();
    expect(onPreviewAnswer).toHaveBeenLastCalledWith("b");
    step?.leave?.();
    expect(onPreviewAnswer).toHaveBeenLastCalledWith(null);
  });

  it("shows the first question answered for the progress step, so the bar has something in it", async () => {
    const onPreviewAnswer = jest.fn();
    const step = build({ onPreviewAnswer, questions: [binary, rating] }).find(
      (s) => s.title === "Check your progress",
    );
    expect(step?.description).not.toContain("green");
    await step?.prepare?.();
    expect(onPreviewAnswer).toHaveBeenLastCalledWith("b");
    step?.leave?.();
    expect(onPreviewAnswer).toHaveBeenLastCalledWith(null);
  });

  it("leaves reasons out when every question hides them", () => {
    expect(titles(build())).not.toContain("Add a reason");
  });

  it.each([
    ["conversation", "Read the conversation"],
    ["llm-general", "Read the input and output"],
    ["stt", "Compare the transcripts"],
    ["tts", "Listen to the audio"],
    ["tool-call", "Compare the two answers"],
  ] as const)("opens a %s job with its own reading step", (kind, title) => {
    expect(build({ kind })[0].title).toBe(title);
  });

  it("draws what a card names the way the page draws it", () => {
    expect(build()[0].description).toContain(EVAL_TARGET_CHIP_CLASS);
    expect(build()[0].description).toContain(">Evaluation target</span>");
    expect(build({ kind: "stt" })[0].description).toContain(
      "<strong>Reference transcript</strong>",
    );
    expect(build({ kind: "tool-call" })[0].description).toContain(
      "<strong>Expected answer</strong>",
    );
    expect(build().at(-1)?.description).toBe(
      "Press this to submit your answers and go to the next item",
    );
  });

  it("names a binary question's own two answers", () => {
    const text = build({
      questions: [{ ...binary, trueLabel: "Pass", falseLabel: "Fail" }],
    })[1].description;
    expect(text).toContain(">Pass</span>");
    expect(text).toContain(">Fail</span>");
  });

  it("says which end of a rating is which, when the scale is known", () => {
    const rated = (scale: Partial<LabellingTourQuestion>) =>
      build({ questions: [{ ...rating, ...scale }] })[1].description;
    expect(rated({ scaleMin: 1, scaleMax: 5 })).toContain(
      "1 is the lowest and 5 is the highest",
    );
    expect(rated({})).not.toContain("lowest");
  });

  it("does not offer progress on an item with no questions, and ends on saving", () => {
    const steps = build({ questions: [] });
    expect(titles(steps)).not.toContain("Check your progress");
    expect(steps[steps.length - 1].actionLabel).toBe("Start labelling");
  });
});
