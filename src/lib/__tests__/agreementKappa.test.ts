import {
  buildTrendChart,
  formatKappa,
  formatTrendValue,
  kappaLabel,
  kappaText,
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

describe("kappaText", () => {
  it("names the kind and shows two decimals", () => {
    expect(kappaText({ kappa: 0.4, kappa_type: "cohen" })).toBe(
      "Cohen's kappa 0.40",
    );
    expect(formatKappa(-0.333)).toBe("-0.33");
  });

  it("is null when there is no kappa", () => {
    expect(kappaText({ kappa: null, kappa_type: null })).toBeNull();
    expect(kappaText({})).toBeNull();
    expect(kappaText(undefined)).toBeNull();
  });
});

describe("buildTrendChart", () => {
  it("puts every agreement number and its kappa on one chart", () => {
    const { data, lines, yDomain } = buildTrendChart([
      {
        key: "hh",
        name: "Annotator agreement",
        kappaName: "Annotator agreement",
        color: "#10b981",
        points: [
          { x: "Jan", agreement: 0.8, kappa: 0.5, kappa_type: "fleiss" },
          { x: "Feb", agreement: null, kappa: null, kappa_type: null },
        ],
      },
      {
        key: "ev",
        name: "Tone agreement with annotators",
        kappaName: "Tone",
        color: "#3b82f6",
        points: [
          { x: "Jan", agreement: 0.6, kappa: 0.2, kappa_type: "cohen" },
          { x: "Feb", agreement: 0.7, kappa: 0.3, kappa_type: "cohen" },
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
      { x: "Jan", hh: 80, hh__kappa: 50, ev: 60, ev__kappa: 20 },
      { x: "Feb", hh: null, hh__kappa: null, ev: 70, ev__kappa: 30 },
    ]);
    expect(yDomain).toEqual([0, 100]);
  });

  it("drops the axis below 0 only when a kappa is negative", () => {
    const { yDomain } = buildTrendChart([
      {
        key: "a",
        name: "A",
        kappaName: "A",
        color: "#000",
        points: [{ x: "Jan", agreement: 0.4, kappa: -0.2, kappa_type: "cohen" }],
      },
    ]);
    expect(yDomain).toEqual([-100, 100]);
  });

  it("names both kinds when the kind changes along the line", () => {
    const { lines } = buildTrendChart([
      {
        key: "a",
        name: "A",
        kappaName: "A",
        color: "#000",
        points: [
          { x: "Jan", agreement: 0.4, kappa: 0.1, kappa_type: "cohen" },
          { x: "Feb", agreement: 0.5, kappa: 0.2, kappa_type: "fleiss" },
        ],
      },
    ]);
    expect(lines[1].name).toBe("A (Cohen's kappa or Fleiss' kappa)");
  });

  it("leaves out lines with nothing to draw, as on older responses", () => {
    const { lines, data } = buildTrendChart([
      {
        key: "a",
        name: "A",
        kappaName: "A",
        color: "#000",
        points: [{ x: "Jan", agreement: null }],
      },
    ]);
    expect(lines).toEqual([]);
    expect(data).toEqual([{ x: "Jan", a: null, a__kappa: null }]);
  });
});

describe("formatTrendValue", () => {
  it("shows agreement as a percentage and kappa to two places", () => {
    expect(formatTrendValue(80, "hh")).toBe("80%");
    expect(formatTrendValue(-42, "hh__kappa")).toBe("-0.42");
    expect(formatTrendValue(undefined, "hh")).toBe("—");
  });
});
