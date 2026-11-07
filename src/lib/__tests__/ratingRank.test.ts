import { ratingRank, scaleBounds } from "../ratingRank";

describe("ratingRank", () => {
  it("calls the highest number best, the lowest worst and the rest middle", () => {
    expect(ratingRank(5, 1, 5)).toBe("best");
    expect(ratingRank(1, 1, 5)).toBe("worst");
    expect(ratingRank(3, 1, 5)).toBe("middle");
  });

  it("gives no rank when the highest and lowest are the same number", () => {
    expect(ratingRank(1, 1, 1)).toBeNull();
  });

  it("still finds the worst when the highest is not known", () => {
    expect(ratingRank(1, 1, undefined)).toBe("worst");
    expect(ratingRank(2, undefined, undefined)).toBe("middle");
  });

  it("reads the lowest and highest numbers of a scale", () => {
    expect(scaleBounds([4, 1, 3])).toEqual({ lowest: 1, highest: 4 });
  });
});
