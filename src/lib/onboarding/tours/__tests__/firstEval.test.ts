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
  chooseCorrectnessRow,
  chooseSecondEvaluatorRow,
  isLlmReplyRow,
  buildFirstEvalTour,
  FIRST_EVAL_TOUR_ID,
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

describe("chooseCorrectnessRow", () => {
  it("prefers the Correctness LLM-reply row", () => {
    const rows = [
      makeRow({ name: "Tone", type: "llm" }),
      makeRow({ name: "Correctness", type: "llm" }),
    ];
    expect(chooseCorrectnessRow(rows)).toBe(rows[1]);
  });

  it("falls back to the first LLM-reply row, never a conversation row", () => {
    const rows = [
      makeRow({ name: "Full-conversation coherence", type: "conversation" }),
      makeRow({ name: "Helpfulness", type: "llm" }),
    ];
    // No "correct"-named row: fallback must skip the conversation row.
    expect(chooseCorrectnessRow(rows)).toBe(rows[1]);
  });

  it("returns undefined when there is no LLM-reply row", () => {
    const rows = [makeRow({ name: "Coherence", type: "conversation" })];
    expect(chooseCorrectnessRow(rows)).toBeUndefined();
  });
});

describe("chooseSecondEvaluatorRow", () => {
  it("ticks a complementary LLM-reply row, not the conversation one", () => {
    const rows = [
      makeRow({ name: "Correctness", type: "llm", checked: true }),
      makeRow({ name: "Conversation quality", type: "conversation" }),
      makeRow({ name: "Politeness", type: "llm" }),
    ];
    const picked = chooseSecondEvaluatorRow(rows);
    expect(picked).toBe(rows[2]);
    expect(isLlmReplyRow(picked!)).toBe(true);
  });

  it("never picks an already-checked row", () => {
    const rows = [
      makeRow({ name: "Correctness", type: "llm", checked: true }),
      makeRow({ name: "Helpfulness", type: "llm", checked: true }),
      makeRow({ name: "Clarity", type: "llm" }),
    ];
    expect(chooseSecondEvaluatorRow(rows)).toBe(rows[2]);
  });

  it("falls back to any unchecked LLM-reply row when none match the hints", () => {
    const rows = [
      makeRow({ name: "Correctness", type: "llm", checked: true }),
      makeRow({ name: "Full conversation coherence", type: "conversation" }),
      makeRow({ name: "Some other reply check", type: "llm" }),
    ];
    // The only eligible (unchecked + LLM-reply) row wins even without a hint.
    expect(chooseSecondEvaluatorRow(rows)).toBe(rows[2]);
  });

  it("returns undefined when the only unchecked rows are conversation-type", () => {
    const rows = [
      makeRow({ name: "Correctness", type: "llm", checked: true }),
      makeRow({ name: "Conversation coherence", type: "conversation" }),
    ];
    expect(chooseSecondEvaluatorRow(rows)).toBeUndefined();
  });

  it("does not mutate the rows it inspects", () => {
    const rows = [
      makeRow({ name: "Correctness", type: "llm", checked: true }),
      makeRow({ name: "Politeness", type: "llm" }),
    ];
    chooseSecondEvaluatorRow(rows);
    // Choosing is pure: the caller ticks, not the chooser.
    expect(rowChecked(rows[1])).toBe(false);
  });
});

describe("buildFirstEvalTour", () => {
  it("builds the first-eval tour with ordered steps", () => {
    const tour = buildFirstEvalTour({ getAccessToken: () => "token" });
    expect(tour.id).toBe(FIRST_EVAL_TOUR_ID);
    expect(tour.steps.length).toBeGreaterThan(0);
    expect(tour.steps[0].title).toMatch(/welcome/i);
    // Every step has a title and description users read.
    for (const step of tour.steps) {
      expect(step.title.length).toBeGreaterThan(0);
      expect(step.description.length).toBeGreaterThan(0);
    }
    expect(tour.steps[0].description).toContain("performs as intended");
    expect(tour.steps[0].description).toContain("catch issues before deploy");
  });
});
