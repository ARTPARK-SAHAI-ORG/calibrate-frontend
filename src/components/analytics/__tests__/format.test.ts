import { formatCost } from "../format";

describe("formatCost", () => {
  it("says None when nothing in the range carries a cost", () => {
    expect(formatCost(null)).toBe("None");
  });

  it("shows a recorded cost in US dollars, including zero", () => {
    expect(formatCost(0)).toBe("$0.00");
    expect(formatCost(12.5)).toBe("$12.50");
  });

  it("does not round a fraction of a cent down to nothing", () => {
    expect(formatCost(0.0042)).toBe("$0.0042");
  });
});
