/**
 * Unit tests for the flagship tour's evaluator-picking logic.
 *
 * The picker renders each row as a checkbox whose aria-label is
 * `Select <name>` (the row body opens a preview instead of ticking), so the
 * tour finds the box to tick by that aria-label, matched exactly.
 */

const mockFetchAgentEvaluators = jest.fn();

jest.mock("../../../evaluatorApi", () => ({
  ...jest.requireActual("../../../evaluatorApi"),
  fetchAgentEvaluators: (...args: unknown[]) =>
    mockFetchAgentEvaluators(...args),
}));

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

    // With no second evaluator available, the tour shows the agent's own
    // evaluators tab and adds nothing.
    const one = titles(ONE);
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

  // The card that points at what the agent already has resolves itself when the
  // step is reached: only then does the agent exist. `stepAtIndex` finds it by
  // position, since its title changes with what it finds.
  describe("the card for what the agent already has", () => {
    const evaluatorStepIndex = (tour: ReturnType<typeof build>) =>
      tour.steps.findIndex((s) => s.title === "Meet the evaluators") + 1;

    beforeEach(() => {
      mockFetchAgentEvaluators.mockReset();
      window.history.replaceState({}, "", "/acme/agents/agent-1");
      localStorage.setItem("access_token", "tok");
    });

    it("names the attached evaluator and anchors its card (rename-safe)", async () => {
      mockFetchAgentEvaluators.mockResolvedValue([
        { uuid: "e1", name: "Answer Accuracy" },
      ]);
      const tour = build({
        correctnessName: "Answer Accuracy",
        secondEvaluatorName: null,
      });
      const step = tour.steps[evaluatorStepIndex(tour)];
      await step.prepare?.();
      expect(mockFetchAgentEvaluators).toHaveBeenCalledWith("agent-1", "token");
      expect(step.title).toBe("Already added for you");
      expect(step.description).toContain("Answer Accuracy");
      expect(step.anchor).toBe('[data-evaluator-name="Answer Accuracy"]');
    });

    it("points at what the agent really has, not the name from the library", async () => {
      mockFetchAgentEvaluators.mockResolvedValue([
        { uuid: "e2", name: "Politeness" },
      ]);
      const tour = build(ONE);
      const step = tour.steps[evaluatorStepIndex(tour)];
      await step.prepare?.();
      expect(step.description).toContain("Politeness");
      expect(step.anchor).toBe('[data-evaluator-name="Politeness"]');
    });

    // The bug this guards: the card used to say "Correctness is already here"
    // over an empty tab, anchored to a card that never appears.
    it("says the tab is empty when the agent has no evaluators", async () => {
      mockFetchAgentEvaluators.mockResolvedValue([]);
      const tour = build(ONE);
      const step = tour.steps[evaluatorStepIndex(tour)];
      await step.prepare?.();
      expect(step.anchor).toBeUndefined();
      expect(step.description).not.toContain("already here");
      expect(step.description).toContain("empty");
      expect(step.title).not.toMatch(/already added/i);
    });

    it("says the tab is empty when the lookup fails", async () => {
      mockFetchAgentEvaluators.mockRejectedValue(new Error("network"));
      const tour = build(ONE);
      const step = tour.steps[evaluatorStepIndex(tour)];
      await step.prepare?.();
      expect(step.anchor).toBeUndefined();
      expect(step.description).toContain("empty");
    });

    it("stops calling the next card 'another check' when nothing is attached", async () => {
      mockFetchAgentEvaluators.mockResolvedValue([]);
      const tour = build(TWO);
      const i = evaluatorStepIndex(tour);
      await tour.steps[i].prepare?.();
      expect(tour.steps[i].description).toContain("Reply Conciseness");
      expect(tour.steps[i + 1].title).toBe("Add your first check");
      expect(tour.steps[i + 1].description).not.toContain("second");
    });
  });
});
