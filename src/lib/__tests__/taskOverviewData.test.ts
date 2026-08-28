import {
  hasTaskOverviewData,
  taskEvaluatorScoreCards,
} from "../taskOverviewData";

describe("hasTaskOverviewData", () => {
  it("is false with no agreement response", () => {
    expect(hasTaskOverviewData(null, [])).toBe(false);
  });

  it("is false when nothing has been labelled, scored, or run", () => {
    expect(
      hasTaskOverviewData(
        {
          human_human: { pair_count: 0 },
          evaluators: [
            { pair_count: 0, result: { count: 0 }, human_result: { count: 0 } },
          ],
        },
        [{ status: "queued" }, { status: "failed" }],
      ),
    ).toBe(false);
  });

  it("is true when annotators labelled but no evaluator has run", () => {
    expect(
      hasTaskOverviewData(
        {
          human_human: { pair_count: 0 },
          evaluators: [
            { pair_count: 0, result: null, human_result: { count: 7 } },
          ],
        },
        [],
      ),
    ).toBe(true);
  });

  it("is false when the human score covers no items", () => {
    expect(
      hasTaskOverviewData(
        {
          human_human: { pair_count: 0 },
          evaluators: [
            { pair_count: 0, result: null, human_result: { count: 0 } },
          ],
        },
        [],
      ),
    ).toBe(false);
  });

  it("is true when annotators agree with each other", () => {
    expect(hasTaskOverviewData({ human_human: { pair_count: 4 } }, [])).toBe(
      true,
    );
  });

  it("is true when an evaluator lines up with the annotators", () => {
    expect(
      hasTaskOverviewData(
        { human_human: { pair_count: 0 }, evaluators: [{ pair_count: 3 }] },
        [],
      ),
    ).toBe(true);
  });

  it("is true when an evaluator has scores but no human labels", () => {
    expect(
      hasTaskOverviewData(
        {
          human_human: { pair_count: 0 },
          evaluators: [{ pair_count: 0, result: { count: 12 } }],
        },
        [],
      ),
    ).toBe(true);
  });

  it("is false when a run finished but its evaluator is off the task", () => {
    expect(
      hasTaskOverviewData({ human_human: { pair_count: 0 }, evaluators: [] }, [
        { status: "completed" },
      ]),
    ).toBe(false);
  });

  it("is true when a run finished even though agreement is empty", () => {
    expect(
      hasTaskOverviewData(
        {
          human_human: { pair_count: 0 },
          evaluators: [{ pair_count: 0, result: null }],
        },
        [{ status: "completed" }],
      ),
    ).toBe(true);
  });
});

describe("hasTaskOverviewData with an evaluator score card", () => {
  const empty = { human_human: { pair_count: 0 }, evaluators: [] };

  it("is true when a card is on screen with nothing else to show", () => {
    expect(hasTaskOverviewData(empty, [], true)).toBe(true);
  });

  it("is still false without one", () => {
    expect(hasTaskOverviewData(empty, [], false)).toBe(false);
  });

  it("is false with no agreement response, card or not", () => {
    expect(hasTaskOverviewData(null, [], true)).toBe(false);
  });
});

describe("taskEvaluatorScoreCards", () => {
  const stat = { label: "Score", value: "89%", ratio: 0.89 };
  const evaluators = [
    { evaluator_id: "ev-1", name: "Correctness" },
    { evaluator_id: "ev-2", name: "Reply Conciseness" },
    { evaluator_id: "tc-1", name: "Tool call correctness" },
  ];

  it("leaves out an evaluator that has no score", () => {
    const cards = taskEvaluatorScoreCards(
      evaluators,
      { "ev-1": stat, "ev-2": null },
      new Set(),
    );
    expect(cards).toEqual([{ evaluatorId: "ev-1", name: "Correctness", stat }]);
  });

  it("keeps an empty card for tool call correctness", () => {
    const cards = taskEvaluatorScoreCards(
      evaluators,
      { "ev-1": stat },
      new Set(["tc-1"]),
    );
    expect(cards).toEqual([
      { evaluatorId: "ev-1", name: "Correctness", stat },
      { evaluatorId: "tc-1", name: "Tool call correctness", stat: null },
    ]);
  });

  it("shows the tool call score once there is one", () => {
    const cards = taskEvaluatorScoreCards(
      evaluators,
      { "tc-1": stat },
      new Set(["tc-1"]),
    );
    expect(cards).toEqual([
      { evaluatorId: "tc-1", name: "Tool call correctness", stat },
    ]);
  });
});
