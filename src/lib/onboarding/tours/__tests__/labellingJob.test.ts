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
        kind: "llm",
        hasItemDetails: false,
        questions: [],
        commentsEnabled: false,
      }).id;
    expect(id("a")).toBe("labelling-job:a");
    expect(id("a")).not.toBe(id("b"));
  });

  it("has only the steps this job needs", () => {
    expect(titles(build())).toEqual([
      "Read the conversation",
      "Answer each question",
      "Check your progress",
      "Save your answers",
    ]);
  });

  it("adds Item details and comments only when they are there", () => {
    const steps = titles(build({ hasItemDetails: true, commentsEnabled: true }));
    expect(steps).toContain("Open Item details for more");
    expect(steps).toContain("Leave a comment");
  });

  it("shows choices and scores separately when a job has both, on the first of each", () => {
    const steps = build({ questions: [binary, rating] });
    expect(titles(steps)).toContain("Some questions have choices");
    expect(titles(steps)).toContain("Some questions ask for a score");
    expect(steps.find((s) => s.title.includes("choices"))?.anchor).toBe("#question-b");
    expect(steps.find((s) => s.title.includes("score"))?.anchor).toBe("#question-r");
  });

  it("explains a score alone when a job has only scores", () => {
    const steps = build({ questions: [rating] });
    expect(titles(steps)).toContain("Answer each question");
    expect(steps[1].description).toContain("score");
  });

  it.each([
    ["optional", "optional", "A reason is optional"],
    ["required", "required", "You need to write a reason"],
  ] as const)("words the reason step for %s", (_n, reasoningMode, words) => {
    const step = build({ questions: [{ ...binary, reasoningMode }] }).find(
      (s) => s.title === "Add a reason",
    );
    expect(step?.description).toContain(words);
  });

  it("says some need a reason when a job mixes them, and points at one that has a box", () => {
    const step = build({
      questions: [
        binary,
        { ...rating, reasoningMode: "required" },
        { uuid: "o", outputType: "binary", reasoningMode: "optional" },
      ],
    }).find((s) => s.title === "Add a reason");
    expect(step?.description).toContain("Some questions need a reason");
    expect(step?.anchor).toBe("#question-r");
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

  it("does not offer progress on an item with no questions, and ends on saving", () => {
    const steps = build({ questions: [] });
    expect(titles(steps)).not.toContain("Check your progress");
    expect(steps[steps.length - 1].actionLabel).toBe("Start labelling");
  });
});
