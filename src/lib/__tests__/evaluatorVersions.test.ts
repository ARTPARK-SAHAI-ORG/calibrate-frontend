import { liveVersionOf } from "../evaluatorVersions";

describe("liveVersionOf", () => {
  it("returns null when evaluator is null/undefined", () => {
    expect(liveVersionOf(null)).toBeNull();
    expect(liveVersionOf(undefined)).toBeNull();
  });

  it("returns null when live_version_index is not a number", () => {
    expect(liveVersionOf({ live_version_index: null, versions: [1, 2] })).toBeNull();
    expect(liveVersionOf({ versions: [1, 2] })).toBeNull();
  });

  it("returns the version at the given index", () => {
    expect(
      liveVersionOf({ live_version_index: 1, versions: ["a", "b", "c"] }),
    ).toBe("b");
  });

  it("returns null when versions is missing", () => {
    expect(liveVersionOf({ live_version_index: 0 })).toBeNull();
  });

  it("returns null when index is out of bounds", () => {
    expect(liveVersionOf({ live_version_index: 5, versions: ["a"] })).toBeNull();
  });
});
