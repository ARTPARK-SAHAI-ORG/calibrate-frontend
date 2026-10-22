import {
  annotatorTrendSeries,
  answerKindOf,
  buildTrendChart,
  formatKappa,
  formatTrendValue,
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

describe("formatTrendValue", () => {
  it("shows agreement as a percentage and kappa to two places", () => {
    expect(formatTrendValue(80, "hh")).toBe("80%");
    expect(formatTrendValue(-0.42, "hh__kappa")).toBe("-0.42");
    expect(formatTrendValue(undefined, "hh")).toBe("—");
  });
});

const one = (points: TrendSeries["points"]): TrendSeries[] => [
  { key: "a", name: "A", kappaName: "A", color: "#000", points },
];

describe("buildTrendChart", () => {
  it("puts every agreement number and its kappa on one chart", () => {
    const { data, lines, kappaDomain } = buildTrendChart([
      {
        key: "hh",
        name: "Annotator agreement",
        kappaName: "Annotator agreement",
        color: "#10b981",
        points: [
          {
            key: "b1",
            label: "Jan",
            agreement: 0.8,
            kappa: 0.5,
            kappa_type: "fleiss",
          },
          {
            key: "b2",
            label: "Feb",
            agreement: null,
            kappa: null,
            kappa_type: null,
          },
        ],
      },
      {
        key: "ev",
        name: "Tone agreement with annotators",
        kappaName: "Tone",
        color: "#3b82f6",
        points: [
          {
            key: "b1",
            label: "Jan",
            agreement: 0.6,
            kappa: 0.2,
            kappa_type: "cohen",
          },
          {
            key: "b2",
            label: "Feb",
            agreement: 0.7,
            kappa: 0.3,
            kappa_type: "cohen",
          },
        ],
      },
    ]);
    expect(lines.map((l) => l.name)).toEqual([
      "Annotator agreement",
      "Annotator agreement (Fleiss' kappa)",
      "Tone agreement with annotators",
      "Tone (Cohen's kappa)",
    ]);
    expect(lines.map((l) => l.kappa)).toEqual([false, true, false, true]);
    expect(data).toEqual([
      {
        key: "b1",
        label: "Jan",
        hh: 80,
        hh__kappa: 0.5,
        ev: 60,
        ev__kappa: 0.2,
      },
      {
        key: "b2",
        label: "Feb",
        hh: null,
        hh__kappa: null,
        ev: 70,
        ev__kappa: 0.3,
      },
    ]);
    expect(kappaDomain).toEqual([0, 1]);
  });

  it("names the kappa line after the agreement line when no kappa name is given", () => {
    const { lines } = buildTrendChart([
      {
        key: "a",
        name: "Tone kappa",
        color: "#000",
        points: [
          { key: "1", label: "Jan", agreement: 0.4, kappa: 0.1, kappa_type: "cohen" },
        ],
      },
    ]);
    expect(lines.map((l) => l.name)).toEqual([
      "Tone kappa",
      "Tone kappa (Cohen's kappa)",
    ]);
  });

  it("keeps two buckets that share a label as two points", () => {
    const { data } = buildTrendChart(
      one([
        { key: "2025-12-01", label: "Dec", agreement: 0.4 },
        { key: "2025-12-31", label: "Dec", agreement: 0.6 },
      ]),
    );
    expect(data.map((d) => [d.label, d.a])).toEqual([
      ["Dec", 40],
      ["Dec", 60],
    ]);
  });

  it("takes the kappa axis below 0 only when a kappa shows as below 0", () => {
    expect(
      buildTrendChart(
        one([
          {
            key: "1",
            label: "Jan",
            agreement: 0.4,
            kappa: -0.2,
            kappa_type: "cohen",
          },
        ]),
      ).kappaDomain,
    ).toEqual([-1, 1]);
    expect(
      buildTrendChart(
        one([
          {
            key: "1",
            label: "Jan",
            agreement: 0.4,
            kappa: -0.004,
            kappa_type: "cohen",
          },
        ]),
      ).kappaDomain,
    ).toEqual([0, 1]);
  });

  it("styles inter-annotator lines dashed and gives overall lines no kappa line", () => {
    const { lines } = buildTrendChart([
      {
        ...one([
          { key: "1", label: "Jan", agreement: 0.4, kappa: 0.1, kappa_type: "cohen" },
        ])[0],
        dashed: true,
      },
      {
        key: "o",
        name: "Overall",
        kappaName: "Overall",
        color: "#111",
        overall: true,
        points: [
          { key: "1", label: "Jan", agreement: 0.5, kappa: 0.3, kappa_type: "fleiss" },
        ],
      },
    ]);
    expect(lines.map((l) => [l.name, l.kappa, l.dashed, l.overall])).toEqual([
      ["A", false, true, false],
      ["A (Cohen's kappa)", true, true, false],
      ["Overall", false, false, true],
    ]);
  });

  it("names both kinds when the kind changes along the line", () => {
    const { lines } = buildTrendChart(
      one([
        {
          key: "1",
          label: "Jan",
          agreement: 0.4,
          kappa: 0.1,
          kappa_type: "cohen",
        },
        {
          key: "2",
          label: "Feb",
          agreement: 0.5,
          kappa: 0.2,
          kappa_type: "fleiss",
        },
      ]),
    );
    expect(lines[1].name).toBe("A (Cohen's kappa or Fleiss' kappa)");
  });

  it("leaves out lines with nothing to draw, as on older responses", () => {
    const { lines, data } = buildTrendChart(
      one([{ key: "1", label: "Jan", agreement: null }]),
    );
    expect(lines).toEqual([]);
    expect(data).toEqual([{ key: "1", label: "Jan", a: null, a__kappa: null }]);
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

describe("annotatorTrendSeries", () => {
  const k = (
    answer_kind: "binary" | "rating",
    kappa: number,
    kappa_type: "cohen" | "linear_weighted_cohen",
  ) => ({ answer_kind, kappa, kappa_type });

  it("draws one agreement line and one kappa line per kind, binary first", () => {
    const series = annotatorTrendSeries(
      [
        {
          bucket_end: "2026-01-31",
          agreement: 0.8,
          kappa_by_kind: [k("rating", 0.6, "linear_weighted_cohen")],
        },
        {
          bucket_end: "2026-02-28",
          agreement: 0.7,
          kappa_by_kind: [
            k("binary", 0.2, "cohen"),
            k("rating", 0.5, "linear_weighted_cohen"),
          ],
        },
      ],
      (iso) => iso.slice(5, 7),
    );
    const { lines, data } = buildTrendChart(series);
    expect(lines.map((l) => [l.name, l.kappa])).toEqual([
      ["Agreement with other annotators", false],
      ["Binary answers (Cohen's kappa)", true],
      ["Rating answers (Linear weighted Cohen's kappa)", true],
    ]);
    expect(data).toEqual([
      {
        key: "2026-01-31",
        label: "01",
        agreement: 80,
        agreement__kappa: null,
        binary: null,
        binary__kappa: null,
        rating: null,
        rating__kappa: 0.6,
      },
      {
        key: "2026-02-28",
        label: "02",
        agreement: 70,
        agreement__kappa: null,
        binary: null,
        binary__kappa: 0.2,
        rating: null,
        rating__kappa: 0.5,
      },
    ]);
  });

  it("draws only the agreement line when no kappa came back", () => {
    const { lines } = buildTrendChart(
      annotatorTrendSeries(
        [{ bucket_end: "2026-01-31", agreement: 0.8 }],
        (iso) => iso,
      ),
    );
    expect(lines.map((l) => l.name)).toEqual([
      "Agreement with other annotators",
    ]);
  });
});

