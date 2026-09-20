import React from "react";
import { render, screen, setupUser } from "@/test-utils";
import {
  TracesFilter,
  scoreConditionOptions,
  type TraceScoreFilterEvaluator,
  type TracesFilterValue,
} from "@/components/traces/TracesFilter";

const NONE: TracesFilterValue = { outputType: "all", labels: [], scores: {} };

/** One yes-or-no evaluator and one rating, so both kinds of picker show. */
const EVALUATORS = [
  { evaluator_uuid: "ev-1", name: "Tone", output_type: "binary" as const },
  {
    evaluator_uuid: "ev-2",
    name: "Accuracy",
    output_type: "rating" as const,
    scale_min: 1,
    scale_max: 5,
  },
];

/** A third one, so the order the reader adds them in can differ from this list. */
const THREE_EVALUATORS: TraceScoreFilterEvaluator[] = [
  ...EVALUATORS,
  { evaluator_uuid: "ev-3", name: "Safety", output_type: "binary" as const },
];

/** Each evaluator whose condition is on the panel, top to bottom. */
const evaluatorRowNames = () =>
  screen
    .getAllByRole("combobox")
    .map((el) =>
      el.getAttribute("aria-label")?.replace("Filter traces by ", ""),
    );

function setup(
  value: TracesFilterValue = NONE,
  labels: string[] = ["production", "staging"],
  scoreEvaluators: TraceScoreFilterEvaluator[] = [],
) {
  const onApply = jest.fn();
  const user = setupUser();
  render(
    <TracesFilter
      value={value}
      labels={labels}
      scoreEvaluators={scoreEvaluators}
      onApply={onApply}
    />,
  );
  return { user, onApply };
}

/** Apply carries the draft count, so it is matched on its leading word. */
const applyButton = () => screen.getByRole("button", { name: /^Apply/ });
const queryApplyButton = () => screen.queryByRole("button", { name: /^Apply/ });

const openPanel = (user: ReturnType<typeof setupUser>) =>
  user.click(screen.getByRole("button", { name: "Filter traces" }));

it("reports both choices together, and only once Apply is clicked", async () => {
  const { user, onApply } = setup();

  await openPanel(user);
  await user.click(screen.getByRole("button", { name: "Response" }));
  await user.click(screen.getByRole("checkbox", { name: "production" }));
  expect(onApply).not.toHaveBeenCalled();

  await user.click(applyButton());

  expect(onApply).toHaveBeenCalledWith({
    outputType: "response",
    labels: ["production"],
    scores: {},
  });
  expect(queryApplyButton()).not.toBeInTheDocument();
});

it("counts the picks on Apply, before they narrow anything", async () => {
  const { user, onApply } = setup();

  await openPanel(user);
  expect(applyButton()).toHaveTextContent("Apply");

  await user.click(screen.getByRole("checkbox", { name: "production" }));
  expect(applyButton()).toHaveTextContent("Apply (1)");

  await user.click(screen.getByRole("button", { name: "Response" }));
  expect(applyButton()).toHaveTextContent("Apply (2)");

  // The toolbar's own number cannot move until the list actually changes.
  expect(screen.queryByText("2")).not.toBeInTheDocument();
  expect(onApply).not.toHaveBeenCalled();
});

it("says on the button how many choices are on", () => {
  setup({
    outputType: "response",
    labels: ["production", "staging"],
    scores: {},
  });

  expect(screen.getByText("3")).toBeInTheDocument();
});

it("counts nothing when no choice is on", () => {
  setup();

  expect(screen.queryByText("0")).not.toBeInTheDocument();
});

it("drops a tick that was never applied", async () => {
  const { user, onApply } = setup();

  await openPanel(user);
  await user.click(screen.getByRole("checkbox", { name: "production" }));
  // Closing is the reader changing their mind, so the tick goes with it.
  await user.keyboard("{Escape}");
  await openPanel(user);
  await user.click(applyButton());

  expect(onApply).toHaveBeenCalledWith({
    outputType: "all",
    labels: [],
    scores: {},
  });
});

it("closes again when the button is clicked a second time", async () => {
  const { user, onApply } = setup();

  await openPanel(user);
  await openPanel(user);

  expect(queryApplyButton()).not.toBeInTheDocument();
  expect(onApply).not.toHaveBeenCalled();
});

it("closes without applying when the reader clicks away", async () => {
  const { user, onApply } = setup();

  await openPanel(user);
  await user.click(document.body);

  expect(queryApplyButton()).not.toBeInTheDocument();
  expect(onApply).not.toHaveBeenCalled();
});

it("clears every choice at once", async () => {
  const { user, onApply } = setup(
    {
      outputType: "tool_call",
      labels: ["staging"],
      scores: { "ev-1": "failed" },
    },
    ["production", "staging"],
    EVALUATORS,
  );

  await openPanel(user);
  await user.click(screen.getByRole("button", { name: "Clear all filters" }));
  await user.click(applyButton());

  expect(onApply).toHaveBeenCalledWith({
    outputType: "all",
    labels: [],
    scores: {},
  });
});

it("has nothing to clear when nothing is picked", async () => {
  const { user } = setup();

  await openPanel(user);

  expect(
    screen.getByRole("button", { name: "Clear all filters" }),
  ).toBeDisabled();
});

it("unticks a label that was already on", async () => {
  const { user, onApply } = setup({
    outputType: "all",
    labels: ["staging"],
    scores: {},
  });

  await openPanel(user);
  await user.click(screen.getByRole("checkbox", { name: "staging" }));
  await user.click(applyButton());

  expect(onApply).toHaveBeenCalledWith({
    outputType: "all",
    labels: [],
    scores: {},
  });
});

it("leaves the labels out when the traces carry none", async () => {
  const { user } = setup(NONE, []);

  await openPanel(user);

  expect(screen.queryByText("Filter by trace labels")).not.toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Response" })).toBeInTheDocument();
});

it("searches the labels once there are enough of them to scroll", async () => {
  const many = Array.from({ length: 9 }, (_, i) => `label-${i}`);
  const { user } = setup(NONE, many);

  await openPanel(user);
  await user.type(screen.getByLabelText("Search labels"), "label-3");

  expect(screen.getByRole("checkbox", { name: "label-3" })).toBeInTheDocument();
  expect(
    screen.queryByRole("checkbox", { name: "label-4" }),
  ).not.toBeInTheDocument();
});

it("says so when no label matches the search", async () => {
  const many = Array.from({ length: 9 }, (_, i) => `label-${i}`);
  const { user } = setup(NONE, many);

  await openPanel(user);
  await user.type(screen.getByLabelText("Search labels"), "polio");

  expect(screen.getByText("No labels match your search")).toBeInTheDocument();
});

it("offers no search box for a handful of labels", async () => {
  const { user } = setup();

  await openPanel(user);

  expect(screen.queryByLabelText("Search labels")).not.toBeInTheDocument();
});

describe("scoreConditionOptions", () => {
  it("offers the two verdicts for a yes-or-no evaluator", () => {
    expect(scoreConditionOptions(EVALUATORS[0])).toEqual([
      { value: "passed", label: "Correct", tone: "pass" },
      { value: "failed", label: "Wrong", tone: "fail" },
    ]);
  });

  it("offers the two verdicts when an evaluator's scale is not known yet", () => {
    expect(
      scoreConditionOptions({ evaluator_uuid: "ev-3", name: "New" }).map(
        (option) => option.value,
      ),
    ).toEqual(["passed", "failed"]);
    expect(
      scoreConditionOptions({
        evaluator_uuid: "ev-3",
        name: "New",
        output_type: "rating",
        scale_min: null,
        scale_max: null,
      }).map((option) => option.value),
    ).toEqual(["passed", "failed"]);
  });

  it("offers every score on a rating's scale, and the middle ones with everything below them", () => {
    expect(scoreConditionOptions(EVALUATORS[1])).toEqual([
      { value: "=1", label: "1", tone: "neutral" },
      { value: "=2", label: "2", tone: "neutral" },
      { value: "=3", label: "3", tone: "neutral" },
      { value: "=4", label: "4", tone: "neutral" },
      { value: "=5", label: "5", tone: "neutral" },
      // No "1 or below": on the lowest score it would mean the same as "1".
      // No "5 or below" either: that is the whole scale.
      { value: "<=2", label: "2 or below", tone: "neutral" },
      { value: "<=3", label: "3 or below", tone: "neutral" },
      { value: "<=4", label: "4 or below", tone: "neutral" },
    ]);
  });

  it("offers the two verdicts when a rating's scale has only one value", () => {
    expect(
      scoreConditionOptions({
        evaluator_uuid: "ev-4",
        name: "Flat",
        output_type: "rating",
        scale_min: 3,
        scale_max: 3,
      }).map((option) => option.value),
    ).toEqual(["passed", "failed"]);
  });

  it("reads a yes-or-no evaluator's verdicts as a pass and a fail", () => {
    expect(scoreConditionOptions(EVALUATORS[0]).map((o) => o.tone)).toEqual([
      "pass",
      "fail",
    ]);
  });

  it("gives a rating's scores no pass or fail colour of their own", () => {
    const tones = scoreConditionOptions(EVALUATORS[1]).map((o) => o.tone);
    expect(tones).toHaveLength(8);
    expect(new Set(tones)).toEqual(new Set(["neutral"]));
  });
});

describe("narrowing by what the evaluators scored", () => {
  it("reports a picked condition, keyed by its evaluator", async () => {
    const { user, onApply } = setup(NONE, [], EVALUATORS);

    await openPanel(user);
    await user.click(screen.getByRole("button", { name: "Accuracy" }));
    await user.selectOptions(
      screen.getByLabelText("Filter traces by Accuracy"),
      "<=2",
    );
    await user.click(applyButton());

    expect(onApply).toHaveBeenCalledWith({
      outputType: "all",
      labels: [],
      scores: { "ev-2": "<=2" },
    });
  });

  it("adds an evaluator with its first condition already set", async () => {
    const { user, onApply } = setup(NONE, [], EVALUATORS);

    await openPanel(user);
    await user.click(screen.getByRole("button", { name: "Tone" }));

    // The evaluator is now a row, so there is nothing left to add it with.
    expect(
      screen.queryByRole("button", { name: "Tone" }),
    ).not.toBeInTheDocument();
    expect(screen.getByLabelText("Filter traces by Tone")).toHaveValue(
      "passed",
    );

    await user.click(applyButton());

    expect(onApply).toHaveBeenCalledWith({
      outputType: "all",
      labels: [],
      scores: { "ev-1": "passed" },
    });
  });

  it("takes an evaluator out of the filters when it is removed", async () => {
    const { user, onApply } = setup(
      { outputType: "all", labels: [], scores: { "ev-1": "failed" } },
      [],
      EVALUATORS,
    );

    await openPanel(user);
    await user.click(
      screen.getByRole("button", { name: "Remove the Tone filter" }),
    );

    // Removing is the only way to clear one: there is no "any score" to
    // go back to, and a blank condition would narrow the list to nothing.
    expect(
      screen.queryByLabelText("Filter traces by Tone"),
    ).not.toBeInTheDocument();

    await user.click(applyButton());

    expect(onApply).toHaveBeenCalledWith({
      outputType: "all",
      labels: [],
      scores: {},
    });
  });

  it("keeps the rows in the order the reader added them", async () => {
    const { user } = setup(NONE, [], THREE_EVALUATORS);

    await openPanel(user);
    await user.click(screen.getByRole("button", { name: "Safety" }));
    await user.click(screen.getByRole("button", { name: "Tone" }));

    // Safety is last in the evaluator list and first on the panel.
    expect(evaluatorRowNames()).toEqual(["Safety", "Tone"]);
  });

  it("colours a picked verdict the way it reads in the table", async () => {
    const { user } = setup(NONE, [], EVALUATORS);

    await openPanel(user);
    await user.click(screen.getByRole("button", { name: "Tone" }));

    const dropdown = screen.getByLabelText("Filter traces by Tone");
    expect(dropdown).toHaveClass("bg-green-100");

    await user.selectOptions(dropdown, "failed");

    expect(dropdown).toHaveClass("bg-red-100");
    expect(dropdown).not.toHaveClass("bg-green-100");
  });

  it("counts each evaluator the reader has set a condition on", () => {
    setup(
      {
        outputType: "response",
        labels: ["staging"],
        scores: { "ev-1": "failed", "ev-2": "<=2" },
      },
      ["staging"],
      EVALUATORS,
    );

    expect(screen.getByText("4")).toBeInTheDocument();
  });

  it("leaves the scores out when no evaluator scores this agent's traces", async () => {
    const { user } = setup(NONE, ["staging"], []);

    await openPanel(user);

    expect(screen.queryByText("Filter by scores")).not.toBeInTheDocument();
  });

  it("shows a condition the evaluator no longer offers, rather than a blank box", async () => {
    // Conditions come back from the address bar, where one can name a score
    // this evaluator does not have any more.
    const { user } = setup(
      { outputType: "all", labels: [], scores: { "ev-1": "<=2" } },
      [],
      EVALUATORS,
    );

    await openPanel(user);

    expect(screen.getByLabelText("Filter traces by Tone")).toHaveValue("<=2");
    expect(screen.getByRole("option", { name: "<=2" })).toBeInTheDocument();
  });

  it("lets go of a condition whose evaluator this agent no longer has", async () => {
    // Nothing would be on screen to switch it off, so opening the panel drops
    // it and Apply clears it.
    const { user, onApply } = setup(
      { outputType: "all", labels: [], scores: { "gone-1": "failed" } },
      [],
      EVALUATORS,
    );

    await openPanel(user);
    // No score row at all: nothing on screen could switch it off.
    expect(screen.queryAllByRole("combobox")).toHaveLength(0);
    await user.click(applyButton());

    expect(onApply).toHaveBeenCalledWith({
      outputType: "all",
      labels: [],
      scores: {},
    });
  });

  it("offers the two verdicts when a rating's scale is not whole numbers", () => {
    expect(
      scoreConditionOptions({
        evaluator_uuid: "ev-5",
        name: "Fractional",
        output_type: "rating",
        scale_min: 1,
        scale_max: 4.5,
      }).map((option) => option.value),
    ).toEqual(["passed", "failed"]);
  });
});
