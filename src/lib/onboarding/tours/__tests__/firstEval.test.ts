/**
 * Unit tests for the flagship tour's evaluator-picking logic.
 *
 * The picker renders each row as a checkbox whose aria-label is
 * `Select <name>` (the row body opens a preview instead of ticking), so the
 * tour finds the box to tick by that aria-label, matched exactly.
 */

import {
  buildCorrectnessPayload,
  chooseEvaluatorCheckbox,
  buildFirstEvalTour,
  FIRST_EVAL_TOUR_ID,
  type EvaluatorPlan,
} from "../firstEval";

type RowSpec = {
  name: string;
  checked?: boolean;
};

/** Build a picker dialog holding checkbox rows like EvaluatorPicker renders. */
function makeDialog(rows: RowSpec[]): HTMLElement {
  const dialog = document.createElement("div");
  rows.forEach(({ name, checked = false }) => {
    const row = document.createElement("div");
    const checkbox = document.createElement("input");
    checkbox.type = "checkbox";
    checkbox.checked = checked;
    checkbox.setAttribute("aria-label", `Select ${name}`);
    const nameSpan = document.createElement("span");
    nameSpan.textContent = name;
    row.append(checkbox, nameSpan);
    dialog.append(row);
  });
  return dialog;
}

describe("chooseEvaluatorCheckbox", () => {
  it("finds the unchecked checkbox whose aria-label matches the name", () => {
    const dialog = makeDialog([
      { name: "Correctness", checked: true },
      { name: "Reply Conciseness" },
    ]);
    const cb = chooseEvaluatorCheckbox(dialog, "Reply Conciseness");
    expect(cb?.getAttribute("aria-label")).toBe("Select Reply Conciseness");
  });

  it("skips an already-checked row", () => {
    const dialog = makeDialog([{ name: "Conciseness", checked: true }]);
    expect(chooseEvaluatorCheckbox(dialog, "Conciseness")).toBeUndefined();
  });

  it("returns undefined for an empty name", () => {
    const dialog = makeDialog([{ name: "Conciseness" }]);
    expect(chooseEvaluatorCheckbox(dialog, "")).toBeUndefined();
  });

  it("matches the exact name, never a longer name that contains it", () => {
    const dialog = makeDialog([
      { name: "Conciseness2" },
      { name: "Conciseness" },
    ]);
    const cb = chooseEvaluatorCheckbox(dialog, "Conciseness");
    expect(cb?.getAttribute("aria-label")).toBe("Select Conciseness");
  });

  it("does not tick anything while choosing", () => {
    const dialog = makeDialog([{ name: "Reply Conciseness" }]);
    chooseEvaluatorCheckbox(dialog, "Reply Conciseness");
    expect(
      dialog.querySelector<HTMLInputElement>('input[type="checkbox"]')?.checked,
    ).toBe(false);
  });
});

describe("buildCorrectnessPayload", () => {
  it("always uses the hard-coded canonical prompt, ignoring the backend prompt", () => {
    // Even if the backend hands back a different prompt, we create with the
    // canonical one so a created evaluator matches what the reuse check expects.
    const payload = buildCorrectnessPayload({
      system_prompt: "Some other backend prompt without a variable",
      judge_model: "openai/gpt-5.4-mini",
      output_type: "binary",
    });
    expect(payload.name).toBe("Correctness");
    expect(payload.evaluator_type).toBe("llm");
    expect(payload.data_type).toBe("text");
    expect(payload.version.judge_model).toBe("openai/gpt-5.4-mini");
    expect(payload.version.system_prompt).toContain("{{criteria}}");
    expect(payload.version.system_prompt).toContain("highly accurate evaluator");
    expect(payload.version.system_prompt).not.toContain("Some other backend");
    expect(payload.version.variables).toEqual([
      { name: "criteria", description: expect.any(String) },
    ]);
  });

  it("uses the canonical prompt and no judge model when none is given", () => {
    const payload = buildCorrectnessPayload(null);
    expect(payload.version.system_prompt).toContain("{{criteria}}");
    expect(payload.version.judge_model).toBeUndefined();
    expect(payload.output_type).toBe("binary");
  });

  it("creates under the given (free) name", () => {
    expect(buildCorrectnessPayload(null, "Correctness (2)").name).toBe(
      "Correctness (2)",
    );
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
