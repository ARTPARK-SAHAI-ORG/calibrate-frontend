/**
 * Unit tests for the flagship tour's evaluator-picking logic.
 *
 * The picker renders each row as a checkbox whose aria-label is
 * `Select <name>` (the row body opens a preview instead of ticking), so the
 * tour finds the box to tick by that aria-label, matched exactly.
 */

import {
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

  it("includes the add-a-second-evaluator steps (named) only when one is available", () => {
    const two = titles(TWO);
    expect(two).toContain("Add another check");
    expect(two).toContain("Pick it in the list");
    expect(two).toContain("Add it to your agent");
    // The second evaluator is named in the step copy.
    const addAnother = build(TWO).steps.find(
      (s) => s.title === "Add another check",
    );
    expect(addAnother?.description).toContain("Reply Conciseness");

    // With no second evaluator available, the tour shows the already-attached
    // Correctness and adds nothing.
    const one = titles(ONE);
    expect(one).toContain("Already added for you");
    expect(one).not.toContain("Add another check");
    expect(one).not.toContain("Pick it in the list");
    expect(one).not.toContain("Add it to your agent");
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

  it("names Correctness by its resolved name, and anchors its card (rename-safe)", () => {
    const renamed = build({
      correctnessName: "Answer Accuracy",
      secondEvaluatorName: null,
    });
    const shown = renamed.steps.find(
      (s) => s.title === "Already added for you",
    );
    expect(shown?.description).toContain("Answer Accuracy");
    // Points at that evaluator's own card in the tab.
    expect(shown?.anchor).toBe('[data-evaluator-name="Answer Accuracy"]');
  });

  it("falls back to the default Correctness name when none was resolved", () => {
    const none = build({ correctnessName: null, secondEvaluatorName: null });
    const shown = none.steps.find((s) => s.title === "Already added for you");
    expect(shown?.description).toContain("Correctness");
  });
});
