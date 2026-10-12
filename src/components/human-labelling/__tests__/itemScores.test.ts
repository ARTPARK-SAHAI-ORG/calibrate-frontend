import {
  buildItemScores,
  type ItemScoreEvaluator,
  type ItemScoreRow,
} from "../itemScores";

const binary: ItemScoreEvaluator = {
  uuid: "ev-b",
  name: "Correctness",
  output_type: "binary",
  live_version_id: "v2",
  output_config: {
    scale: [
      { value: true, name: "Polite" },
      { value: false, name: "Rude" },
    ],
  },
};

const rating: ItemScoreEvaluator = {
  uuid: "ev-r",
  name: "Helpfulness",
  output_type: "rating",
  scale_min: 1,
  scale_max: 5,
};

function row(over: Partial<ItemScoreRow>): ItemScoreRow {
  return {
    item_id: "i1",
    evaluator_id: "ev-b",
    evaluator_version_id: "v2",
    evaluator_value: null,
    annotations: {},
    ...over,
  };
}

const ann = (...values: unknown[]) =>
  Object.fromEntries(values.map((value, i) => [`a${i}`, { value }]));

function cell(rows: ItemScoreRow[], evs: ItemScoreEvaluator[], ev = "ev-b") {
  return buildItemScores(rows, evs).get("i1")?.get(ev);
}

describe("buildItemScores", () => {
  it("reads only the live version's row, annotations included", () => {
    const c = cell(
      [
        row({ evaluator_version_id: "v1", evaluator_value: false, annotations: ann(false) }),
        row({ evaluator_version_id: "v2", evaluator_value: true, annotations: ann(true, true, false) }),
      ],
      [binary],
    );
    expect(c).toEqual({
      evaluator: { text: "Evaluator: Polite", tone: "pass" },
      humans: { text: "Humans: 66.7% Polite", tone: "mid" },
    });
  });

  it("falls back to the first row when the live version is unknown", () => {
    const ev = { ...binary, live_version_id: null, output_config: null };
    const c = cell(
      [
        row({ evaluator_version_id: "v1", evaluator_value: 0 }),
        row({ evaluator_version_id: "v2", evaluator_value: 1 }),
      ],
      [ev],
    );
    expect(c?.evaluator).toEqual({ text: "Evaluator: Wrong", tone: "fail" });
  });

  it("leaves out rows for unknown evaluators and non-live versions", () => {
    const out = buildItemScores(
      [row({ evaluator_id: "other" }), row({ evaluator_version_id: "v1" })],
      [binary],
    );
    expect(out.size).toBe(0);
  });

  it("coerces 1/0 annotations and formats 100% and 0%", () => {
    const ev = { ...binary, output_config: null };
    expect(cell([row({ annotations: ann(1, 1, true) })], [ev])?.humans).toEqual({
      text: "Humans: 100% Correct",
      tone: "pass",
    });
    expect(cell([row({ annotations: ann(0, false) })], [ev])?.humans).toEqual({
      text: "Humans: 0% Correct",
      tone: "fail",
    });
  });

  it("says when nothing has been scored", () => {
    const c = cell([row({ annotations: { a: null, b: { value: "" }, c: { value: null } } })], [binary]);
    expect(c).toEqual({
      evaluator: { text: "Evaluator: Not run", tone: "none" },
      humans: { text: "Humans: Not labelled yet", tone: "none" },
    });
  });

  it("shows a rating and the annotators' mean", () => {
    const c = cell(
      [row({ evaluator_id: "ev-r", evaluator_value: 4, annotations: ann(3, 4) })],
      [rating],
      "ev-r",
    );
    expect(c).toEqual({
      evaluator: { text: "Evaluator: 4", tone: "pass" },
      humans: { text: "Humans: 3.5", tone: "mid" },
    });
  });

  it.each([
    // scale 0..100 so the value is the ratio in percent
    [49, "fail"],
    [50, "mid"],
    [74, "mid"],
    [75, "pass"],
  ])("rating %s of 100 reads as %s", (value, tone) => {
    const ev = { ...rating, scale_min: 0, scale_max: 100 };
    const c = cell([row({ evaluator_id: "ev-r", evaluator_value: value })], [ev], "ev-r");
    expect(c?.evaluator.tone).toBe(tone);
  });

  it("drops the colour but keeps the text when a rating has no bounds", () => {
    const ev = { ...rating, scale_min: null, scale_max: null };
    const c = cell(
      [row({ evaluator_id: "ev-r", evaluator_value: 3, annotations: ann(2) })],
      [ev],
      "ev-r",
    );
    expect(c).toEqual({
      evaluator: { text: "Evaluator: 3", tone: "none" },
      humans: { text: "Humans: 2", tone: "none" },
    });
  });
});
