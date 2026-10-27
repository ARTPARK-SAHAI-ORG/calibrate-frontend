import {
  buildTrendChart,
  formatKappa,
  kappaBlank,
  kappaLabel,
  formatAgreement,
  kappaForKind,
  percentOf,
  type TrendPoint,
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

const point = (
  i: number,
  agreement: number | null,
  kappa: number | null = null,
): TrendPoint => ({
  key: `v${i}`,
  label: `v${i}`,
  agreement,
  kappa,
  kappa_type: "cohen",
});

describe("buildTrendChart", () => {
  it("puts agreement as a whole percent and kappa beside it for each point", () => {
    const { data, kappaDomain } = buildTrendChart([
      point(1, 0.8, 0.5),
      point(2, 0.6),
    ]);
    expect(data).toEqual([
      { key: "v1", label: "v1", agreement: 80, kappa: 0.5 },
      { key: "v2", label: "v2", agreement: 60, kappa: null },
    ]);
    expect(kappaDomain).toEqual([0, 1]);
  });

  it("takes the kappa axis below 0 only when a kappa shows as below 0", () => {
    expect(buildTrendChart([point(1, 0.4, -0.2)]).kappaDomain).toEqual([-1, 1]);
    expect(buildTrendChart([point(1, 0.4, -0.004)]).kappaDomain).toEqual([0, 1]);
  });
});

describe("formatAgreement", () => {
  it("shows a fraction as a whole percent", () => {
    expect(formatAgreement(0.456)).toBe("46%");
    expect(formatAgreement(1)).toBe("100%");
    expect(percentOf(0.004)).toBe(0);
  });
});

describe("kappaForKind", () => {
  it("finds the entry for one kind of answer", () => {
    const binary = { answer_kind: "binary" as const, kappa: 0.2 };
    expect(kappaForKind([binary], "binary")).toBe(binary);
    expect(kappaForKind([binary], "rating")).toBeUndefined();
    expect(kappaForKind(undefined, "binary")).toBeUndefined();
  });
});

