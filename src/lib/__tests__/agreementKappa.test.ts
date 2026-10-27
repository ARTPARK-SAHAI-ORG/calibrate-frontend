import {
  answerKindOf,
  buildTrendChart,
  formatKappa,
  kappaBlank,
  kappaLabel,
  type TrendSeries,
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

const versions = (
  points: { agreement: number | null; kappa?: number | null }[],
): TrendSeries[] => [
  {
    key: "agreement",
    name: "Agreement",
    kappaName: "Kappa",
    color: "#111",
    kappaColor: "#222",
    points: points.map((p, i) => ({
      key: `v${i + 1}`,
      label: `v${i + 1}`,
      agreement: p.agreement,
      kappa: p.kappa ?? null,
      kappa_type: "cohen" as const,
    })),
  },
];

describe("buildTrendChart", () => {
  it("puts agreement as a percentage and kappa beside it for each point", () => {
    const { data, lines, kappaDomain } = buildTrendChart(
      versions([
        { agreement: 0.8, kappa: 0.5 },
        { agreement: 0.6, kappa: null },
      ]),
    );
    expect(lines).toEqual([
      { dataKey: "agreement", name: "Agreement", color: "#111", kappa: false },
      { dataKey: "agreement__kappa", name: "Kappa", color: "#222", kappa: true },
    ]);
    expect(data).toEqual([
      { key: "v1", label: "v1", agreement: 80, agreement__kappa: 0.5 },
      { key: "v2", label: "v2", agreement: 60, agreement__kappa: null },
    ]);
    expect(kappaDomain).toEqual([0, 1]);
  });

  it("lists the kappa line even before any point has a kappa", () => {
    expect(
      buildTrendChart(versions([{ agreement: 0.5 }])).lines.map((l) => l.name),
    ).toEqual(["Agreement", "Kappa"]);
  });

  it("leaves out the agreement line when no point has agreement", () => {
    expect(
      buildTrendChart(versions([{ agreement: null }])).lines.map((l) => l.name),
    ).toEqual(["Kappa"]);
  });

  it("takes the kappa axis below 0 only when a kappa shows as below 0", () => {
    expect(
      buildTrendChart(versions([{ agreement: 0.4, kappa: -0.2 }])).kappaDomain,
    ).toEqual([-1, 1]);
    expect(
      buildTrendChart(versions([{ agreement: 0.4, kappa: -0.004 }]))
        .kappaDomain,
    ).toEqual([0, 1]);
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
