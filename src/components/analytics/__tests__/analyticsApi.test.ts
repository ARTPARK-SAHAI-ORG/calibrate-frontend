import { apiDelete, apiGet, apiPost } from "../../../lib/api";
import {
  addSuperadmin,
  fetchAnalytics,
  fetchSuperadmins,
  removeSuperadmin,
} from "../../../lib/analyticsApi";

jest.mock("../../../lib/api", () => ({ apiGet: jest.fn(), apiPost: jest.fn(), apiDelete: jest.fn() }));

it("asks for the dates and the time zone, leaving out a missing start", async () => {
  await fetchAnalytics("tok", { start: "2026-10-01", end: "2026-10-19", tzOffsetMinutes: 330 });
  expect(apiGet).toHaveBeenLastCalledWith(
    "/admin/analytics?start=2026-10-01&end=2026-10-19&tz_offset_minutes=330",
    "tok",
  );
  await fetchAnalytics("tok", { end: "2026-10-19", tzOffsetMinutes: 0 });
  expect(apiGet).toHaveBeenLastCalledWith("/admin/analytics?end=2026-10-19&tz_offset_minutes=0", "tok");
});


it("lists, adds and removes superadmins", async () => {
  await fetchSuperadmins("tok");
  expect(apiGet).toHaveBeenLastCalledWith("/admin/superadmins", "tok");
  await addSuperadmin("tok", "a@b.co");
  expect(apiPost).toHaveBeenLastCalledWith("/admin/superadmins", "tok", { email: "a@b.co" });
  await removeSuperadmin("tok", "u1");
  expect(apiDelete).toHaveBeenLastCalledWith("/admin/superadmins/u1", "tok");
});
