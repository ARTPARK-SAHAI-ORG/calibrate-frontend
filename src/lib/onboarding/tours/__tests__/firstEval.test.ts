/**
 * Unit tests for the flagship tour's evaluator-picking logic.
 *
 * The picker rows the tour ticks MUST be LLM-reply evaluators: a next-reply test
 * only seeds `evaluator_type === "llm"` evaluators and silently drops
 * "Full conversation" / "LLM output" ones, so ticking a non-LLM-reply evaluator
 * would leave the tour's "both checks grade this test" claim false. These tests
 * lock that rule for both picks.
 */

import {
  buildCorrectnessPayload,
  chooseRowByName,
  isLlmReplyRow,
  planFromEvaluators,
  buildFirstEvalTour,
  FIRST_EVAL_TOUR_ID,
  type EvaluatorPlan,
} from "../firstEval";

// The pill label EvaluatorTypePill renders for each evaluator_type.
const TYPE_LABEL = {
  llm: "LLM reply",
  conversation: "Full conversation",
  "llm-general": "LLM output",
  stt: "Speech to Text",
  tts: "Text to Speech",
} as const;

type RowSpec = {
  name: string;
  type: keyof typeof TYPE_LABEL;
  checked?: boolean;
};

/** Build a picker <label> row like AddEvaluatorsDialog renders. */
function makeRow({ name, type, checked = false }: RowSpec): HTMLLabelElement {
  const label = document.createElement("label");
  const checkbox = document.createElement("input");
  checkbox.type = "checkbox";
  checkbox.checked = checked;
  const nameSpan = document.createElement("span");
  nameSpan.textContent = name;
  const pill = document.createElement("span");
  pill.textContent = TYPE_LABEL[type];
  label.append(checkbox, nameSpan, pill);
  return label;
}

const rowChecked = (row: HTMLLabelElement | undefined): boolean | undefined =>
  row?.querySelector<HTMLInputElement>('input[type="checkbox"]')?.checked;

describe("isLlmReplyRow", () => {
  it("matches an LLM-reply row and rejects other types", () => {
    expect(isLlmReplyRow(makeRow({ name: "Correctness", type: "llm" }))).toBe(
      true,
    );
    expect(
      isLlmReplyRow(makeRow({ name: "Coherence", type: "conversation" })),
    ).toBe(false);
    // "LLM output" (llm-general) must NOT count as an LLM-reply row.
    expect(
      isLlmReplyRow(makeRow({ name: "General judge", type: "llm-general" })),
    ).toBe(false);
  });
});

describe("chooseRowByName", () => {
  it("ticks the unchecked LLM-reply row whose name matches", () => {
    const rows = [
      makeRow({ name: "Correctness", type: "llm", checked: true }),
      makeRow({ name: "Reply Conciseness", type: "llm" }),
      makeRow({ name: "Coherence", type: "conversation" }),
    ];
    expect(chooseRowByName(rows, "Reply Conciseness")).toBe(rows[1]);
  });

  it("ignores a conversation-type row even when the name matches", () => {
    const rows = [makeRow({ name: "Conciseness", type: "conversation" })];
    expect(chooseRowByName(rows, "Conciseness")).toBeUndefined();
  });

  it("skips an already-checked row", () => {
    const rows = [makeRow({ name: "Conciseness", type: "llm", checked: true })];
    expect(chooseRowByName(rows, "Conciseness")).toBeUndefined();
  });

  it("returns undefined for an empty name", () => {
    const rows = [makeRow({ name: "Conciseness", type: "llm" })];
    expect(chooseRowByName(rows, "")).toBeUndefined();
  });

  it("matches the exact name, never a longer name that contains it", () => {
    const rows = [
      makeRow({ name: "Conciseness2", type: "llm" }),
      makeRow({ name: "Conciseness", type: "llm" }),
    ];
    // "Conciseness2" comes first, but only the exact "Conciseness" row wins.
    expect(chooseRowByName(rows, "Conciseness")).toBe(rows[1]);
  });

  it("does not mutate the rows it inspects", () => {
    const rows = [makeRow({ name: "Reply Conciseness", type: "llm" })];
    chooseRowByName(rows, "Reply Conciseness");
    expect(rowChecked(rows[0])).toBe(false);
  });
});

describe("planFromEvaluators", () => {
  const correctness = {
    name: "Correctness",
    evaluator_type: "llm",
    slug: "default-llm-next-reply",
  };

  it("detects Correctness (by name) and a conciseness second check", () => {
    expect(
      planFromEvaluators([
        correctness,
        { name: "Reply Conciseness", evaluator_type: "llm", slug: "reply-conciseness" },
      ]),
    ).toEqual({
      correctnessName: "Correctness",
      secondEvaluatorName: "Reply Conciseness",
    });
  });

  it("finds the Correctness default by SLUG even when it was renamed", () => {
    // Identified by slug, so a renamed default is still returned by its new name.
    const renamed = {
      name: "Answer Accuracy",
      evaluator_type: "llm",
      slug: "default-llm-next-reply",
    };
    expect(planFromEvaluators([renamed]).correctnessName).toBe("Answer Accuracy");
  });

  it("ignores a name that only contains the letters (e.g. Conciseness2)", () => {
    // Whole-word "conciseness" only — a throwaway "Conciseness2" is not a match.
    const plan = planFromEvaluators([
      correctness,
      { name: "Conciseness2", evaluator_type: "llm", slug: "conciseness2" },
      { name: "Concise", evaluator_type: "llm", slug: "concise" },
    ]);
    expect(plan.secondEvaluatorName).toBeNull();
  });

  it("returns no second when only Correctness exists", () => {
    expect(planFromEvaluators([correctness])).toEqual({
      correctnessName: "Correctness",
      secondEvaluatorName: null,
    });
  });

  it("ignores a conversation-type conciseness evaluator (it cannot grade a next-reply test)", () => {
    expect(
      planFromEvaluators([
        correctness,
        { name: "Conversation Conciseness", evaluator_type: "conversation", slug: "x" },
      ]).secondEvaluatorName,
    ).toBeNull();
  });

  it("reports correctnessName null when the default was deleted", () => {
    const plan = planFromEvaluators([
      { name: "Reply Conciseness", evaluator_type: "llm", slug: "reply-conciseness" },
    ]);
    expect(plan.correctnessName).toBeNull();
  });
});

describe("buildCorrectnessPayload", () => {
  it("uses the backend default-prompt config when provided", () => {
    const payload = buildCorrectnessPayload({
      system_prompt: "Judge against {{criteria}}",
      judge_model: "openai/gpt-5.4-mini",
      output_type: "binary",
    });
    expect(payload.name).toBe("Correctness");
    expect(payload.evaluator_type).toBe("llm");
    expect(payload.data_type).toBe("text");
    expect(payload.version.judge_model).toBe("openai/gpt-5.4-mini");
    expect(payload.version.system_prompt).toBe("Judge against {{criteria}}");
    expect(payload.version.variables).toEqual([
      { name: "criteria", description: expect.any(String) },
    ]);
  });

  it("falls back to a criteria-driven prompt when none is given", () => {
    const payload = buildCorrectnessPayload(null);
    expect(payload.version.system_prompt).toContain("{{criteria}}");
    expect(payload.version.judge_model).toBeUndefined();
    expect(payload.output_type).toBe("binary");
  });
});

describe("buildFirstEvalTour", () => {
  const TWO: EvaluatorPlan = {
    correctnessName: "Correctness",
    secondEvaluatorName: "Reply Conciseness",
  };
  const ONE: EvaluatorPlan = {
    correctnessName: "Correctness",
    secondEvaluatorName: null,
  };
  const build = (plan: EvaluatorPlan) =>
    buildFirstEvalTour({ getAccessToken: () => "token", plan });
  const titles = (plan: EvaluatorPlan) => build(plan).steps.map((s) => s.title);

  it("builds the first-eval tour with ordered, described steps", () => {
    const tour = build(TWO);
    expect(tour.id).toBe(FIRST_EVAL_TOUR_ID);
    expect(tour.steps.length).toBeGreaterThan(0);
    expect(tour.steps[0].title).toMatch(/welcome/i);
    for (const step of tour.steps) {
      expect(step.title.length).toBeGreaterThan(0);
      expect(step.description.length).toBeGreaterThan(0);
    }
    expect(tour.steps[0].description).toContain("performs as intended");
    expect(tour.steps[0].description).toContain("catch issues before deploy");
  });

  it("includes the second-evaluator step (named) only when one is available", () => {
    const two = titles(TWO);
    expect(two).toContain("Add another check");
    expect(two).toContain("Add them to your agent");
    // The second evaluator is named in the step copy.
    const addAnother = build(TWO).steps.find(
      (s) => s.title === "Add another check",
    );
    expect(addAnother?.description).toContain("Reply Conciseness");

    const one = titles(ONE);
    expect(one).not.toContain("Add another check");
    expect(one).toContain("Add it to your agent");
  });

  it("never claims multiple dimensions in the grading step", () => {
    for (const plan of [TWO, ONE]) {
      const grading = build(plan).steps.find(
        (s) => s.title === "How your test is graded",
      );
      expect(grading).toBeDefined();
      expect(grading?.description).toContain("add more checks");
    }
  });

  it("names Correctness by its resolved name in the pick step (rename-safe)", () => {
    const renamed = build({
      correctnessName: "Answer Accuracy",
      secondEvaluatorName: null,
    });
    const pick = renamed.steps.find((s) => s.title === "Choose what to check");
    expect(pick?.description).toContain("Answer Accuracy");
  });

  it("still builds when Correctness was deleted (recreated silently)", () => {
    const deleted = build({ correctnessName: null, secondEvaluatorName: null });
    const titles = deleted.steps.map((s) => s.title);
    expect(titles).toContain("Choose what to check");
    // Falls back to the default Correctness name in the copy.
    const pick = deleted.steps.find((s) => s.title === "Choose what to check");
    expect(pick?.description).toContain("Correctness");
  });
});
