import { buildJobHumanScoreCards } from "../jobHumanScores";

const binary = { uuid: "ev-yes", name: "Correct", output_type: "binary" };
const rating = {
  uuid: "ev-rate",
  name: "Helpfulness",
  output_type: "rating",
  scale_min: 1,
  scale_max: 5,
};

const ann = (item_id: string, evaluator_id: string | null, value: unknown) => ({
  item_id,
  evaluator_id,
  value,
});

describe("buildJobHumanScoreCards", () => {
  it("gives the share marked true for a yes/no evaluator", () => {
    const cards = buildJobHumanScoreCards(
      [binary],
      [
        ann("i1", "ev-yes", { value: true }),
        ann("i2", "ev-yes", { value: true }),
        ann("i3", "ev-yes", { value: false }),
        ann("i4", "ev-yes", { value: false }),
      ],
    );
    expect(cards).toHaveLength(1);
    expect(cards[0].evaluatorId).toBe("ev-yes");
    expect(cards[0].name).toBe("Correct");
    expect(cards[0].stat.value).toBe("50%");
    expect(cards[0].stat.ratio).toBeCloseTo(0.5);
  });

  it("averages a rating evaluator against its own scale", () => {
    const cards = buildJobHumanScoreCards(
      [rating],
      [ann("i1", "ev-rate", { value: 4 }), ann("i2", "ev-rate", { value: 2 })],
    );
    expect(cards[0].stat.value).toBe("3 / 5");
    // 1..5 scale, so a mean of 3 sits halfway.
    expect(cards[0].stat.ratio).toBeCloseTo(0.5);
  });

  it("reads a bare stored value as well as a wrapped one", () => {
    const cards = buildJobHumanScoreCards(
      [binary],
      [ann("i1", "ev-yes", true), ann("i2", "ev-yes", { value: false })],
    );
    expect(cards[0].stat.value).toBe("50%");
  });

  it("ignores the item's own comment slot", () => {
    const cards = buildJobHumanScoreCards(
      [binary],
      [
        ann("i1", "ev-yes", { value: true }),
        ann("i1", null, { comment: "looks fine" }),
        ann("i2", null, { comment: "not sure" }),
      ],
    );
    expect(cards[0].stat.value).toBe("100%");
    expect(cards[0].stat.title).toBe("Correct on 1 of 1 label");
  });

  it("counts only the answers given for that evaluator", () => {
    const other = { uuid: "ev-two", name: "Polite", output_type: "binary" };
    const cards = buildJobHumanScoreCards(
      [binary, other],
      [
        ann("i1", "ev-yes", { value: true }),
        ann("i2", "ev-yes", { value: true }),
        ann("i1", "ev-two", { value: false }),
        ann("i2", "ev-two", { value: false }),
      ],
    );
    expect(cards[0].stat.value).toBe("100%");
    expect(cards[1].stat.value).toBe("0%");
  });

  it("counts labels, not items, because several people can label one item", () => {
    const cards = buildJobHumanScoreCards(
      [binary, rating],
      [
        ann("i1", "ev-yes", { value: true }),
        ann("i2", "ev-yes", { value: true }),
        ann("i3", "ev-yes", { value: false }),
        ann("i1", "ev-rate", { value: 4 }),
        ann("i2", "ev-rate", { value: 2 }),
      ],
    );
    expect(cards[0].stat.title).toBe("Correct on 2 of 3 labels");
    expect(cards[1].stat.title).toBe("Average across 2 labels");
  });

  it("leaves out an evaluator nobody labelled", () => {
    const cards = buildJobHumanScoreCards(
      [binary, rating],
      [ann("i1", "ev-yes", { value: true })],
    );
    expect(cards.map((c) => c.evaluatorId)).toEqual(["ev-yes"]);
  });
});
