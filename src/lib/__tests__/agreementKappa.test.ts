import {
  buildTrendChart,
  formatKappa,
  formatTrendValue,
  KAPPA_HELP,
  kappaLabel,
  kappaText,
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
    expect(kappaLabel("mixed")).toBe(
      "Fleiss' kappa, linear weighted for ratings",
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

it("says what a kappa below 0 means", () => {
  expect(KAPPA_HELP).toMatch(/below 0 means worse than chance/);
});

describe("kappaText", () => {
  it("names the kind and shows two decimals", () => {
    expect(kappaText({ kappa: 0.4, kappa_type: "cohen" })).toBe(
      "Cohen's kappa 0.40",
    );
  });

  it("is null when there is no kappa", () => {
    expect(kappaText({ kappa: null, kappa_type: null })).toBeNull();
    expect(kappaText({})).toBeNull();
    expect(kappaText(undefined)).toBeNull();
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
