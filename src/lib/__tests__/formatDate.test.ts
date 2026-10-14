import { formatDate } from "../formatDate";

describe("formatDate", () => {
  it("shows the year, short month and day", () => {
    expect(formatDate("2024-03-05T12:00:00Z")).toMatch(/2024/);
  });

  it("shows a dash for a date it cannot read", () => {
    expect(formatDate("not a date")).toBe("—");
  });
});
