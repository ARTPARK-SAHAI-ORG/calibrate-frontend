import { hasTaskOverviewData } from "../taskOverviewData";

describe("hasTaskOverviewData", () => {
  it("is false with no agreement response", () => {
    expect(hasTaskOverviewData(null, [])).toBe(false);
  });

  it("is false when nothing has been labelled, scored, or run", () => {
    expect(
      hasTaskOverviewData(
        {
          human_human: { pair_count: 0 },
          evaluators: [{ pair_count: 0, result: { count: 0 } }],
        },
        [{ status: "queued" }, { status: "failed" }],
      ),
    ).toBe(false);
  });

  it("is true when annotators agree with each other", () => {
    expect(
      hasTaskOverviewData({ human_human: { pair_count: 4 } }, []),
    ).toBe(true);
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
