import { parseBackendTime } from "../relativeTime";

describe("parseBackendTime", () => {
  it("reads a time with no zone as UTC", () => {
    expect(parseBackendTime("2026-01-18 09:30:00").toISOString()).toBe(
      "2026-01-18T09:30:00.000Z",
    );
  });

  it("keeps the zone a time already carries", () => {
    expect(parseBackendTime("2026-01-18T09:30:00.000Z").toISOString()).toBe(
      "2026-01-18T09:30:00.000Z",
    );
    expect(parseBackendTime("2026-01-18T15:00:00+05:30").toISOString()).toBe(
      "2026-01-18T09:30:00.000Z",
    );
  });
});
