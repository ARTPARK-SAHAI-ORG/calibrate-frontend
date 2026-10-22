import {
  answerKindOf,
  formatKappa,
  kappaBlank,
  kappaLabel,
} from "../agreementKappa";

describe("kappaLabel", () => {
  it("spells out every kind of kappa", () => {
    expect(kappaLabel("fleiss")).toBe("Fleiss' kappa");
    expect(kappaLabel("linear_weighted_fleiss")).toBe(
      "Linear weighted Fleiss' kappa",
    );
    expect(kappaLabel("cohen")).toBe("Cohen's kappa");
    expect(kappaLabel("linear_weighted_cohen")).toBe(
      "Linear weighted Cohen's kappa",
    );
  });

  it("falls back to a plain name when the kind is missing", () => {
    expect(kappaLabel(null)).toBe("Kappa");
    expect(kappaLabel(undefined)).toBe("Kappa");
  });
});

describe("formatKappa", () => {
  it("shows two decimals", () => {
    expect(formatKappa(-0.333)).toBe("-0.33");
    expect(formatKappa(0.4)).toBe("0.40");
  });

  it("never prints a minus sign on a value that rounds to 0", () => {
    expect(formatKappa(-0.004)).toBe("0.00");
    expect(formatKappa(-0)).toBe("0.00");
  });
});

describe("kappaBlank", () => {
  it("gives the short text and the hover sentence for each reason", () => {
    expect(
      kappaBlank({ kappa: null, kappa_blank_reason: "too_few_items" }),
    ).toEqual({
      text: "Too few items",
      help: "Kappa needs at least two items, because one item cannot show what chance alone would produce",
    });
    expect(
      kappaBlank({ kappa: null, kappa_blank_reason: "everyone_agreed" }),
    ).toEqual({
      text: "Everyone agreed",
      help: "Every answer was the same, so chance alone would also agree every time and kappa cannot be worked out",
    });
  });

  it("has no reason when there is a kappa or no reason was sent", () => {
    expect(
      kappaBlank({ kappa: 0.2, kappa_blank_reason: "too_few_items" }),
    ).toBeNull();
    expect(kappaBlank({ kappa: null, kappa_blank_reason: null })).toBeNull();
    expect(kappaBlank({})).toBeNull();
    expect(kappaBlank(undefined)).toBeNull();
  });
});

describe("answerKindOf", () => {
  it("reads a linear weighted kappa as rating answers and a plain one as binary", () => {
    expect(answerKindOf("linear_weighted_cohen")).toBe("rating");
    expect(answerKindOf("linear_weighted_fleiss")).toBe("rating");
    expect(answerKindOf("cohen")).toBe("binary");
    expect(answerKindOf("fleiss")).toBe("binary");
    expect(answerKindOf(null)).toBeNull();
    expect(answerKindOf(undefined)).toBeNull();
  });
});
