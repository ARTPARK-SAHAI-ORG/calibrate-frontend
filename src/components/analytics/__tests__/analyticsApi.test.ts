import { apiGet } from "../../../lib/api";
import { fetchAnalytics, isForbiddenError } from "../../../lib/analyticsApi";

jest.mock("../../../lib/api", () => ({ apiGet: jest.fn() }));

it("asks for the dates and the time zone, leaving out a missing start", async () => {
  await fetchAnalytics("tok", { start: "2026-10-01", end: "2026-10-19", tzOffsetMinutes: 330 });
  expect(apiGet).toHaveBeenLastCalledWith(
    "/admin/analytics?start=2026-10-01&end=2026-10-19&tz_offset_minutes=330",
    "tok",
  );
  await fetchAnalytics("tok", { end: "2026-10-19", tzOffsetMinutes: 0 });
  expect(apiGet).toHaveBeenLastCalledWith("/admin/analytics?end=2026-10-19&tz_offset_minutes=0", "tok");
});

it("recognises a refusal", () => {
  expect(isForbiddenError(new Error("Request failed: 403 - no"))).toBe(true);
  expect(isForbiddenError(new Error("Request failed: 500 - no"))).toBe(false);
  expect(isForbiddenError("Request failed: 403")).toBe(false);
});
