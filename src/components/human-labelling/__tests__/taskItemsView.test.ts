import {
  filterSortTaskItems,
  taskItemsPage,
  type TaskItemLike,
} from "../taskItemsView";

function item(
  uuid: string,
  name: string,
  updated_at?: string,
  extra?: Record<string, unknown>,
): TaskItemLike {
  return {
    uuid,
    payload: { name, ...extra },
    updated_at,
    created_at: "2024-01-01 00:00:00",
  };
}

describe("filterSortTaskItems", () => {
  it("returns every item when the search is blank", () => {
    const items = [item("a", "Alpha"), item("b", "Beta")];
    expect(filterSortTaskItems(items, "", "desc")).toHaveLength(2);
    expect(filterSortTaskItems(items, "   ", "desc")).toHaveLength(2);
  });

  it("matches the search against the item name, case-insensitively", () => {
    const items = [item("a", "Refund flow"), item("b", "Booking flow")];
    const out = filterSortTaskItems(items, "REFUND", "desc");
    expect(out.map((i) => i.uuid)).toEqual(["a"]);
  });

  it("matches the search against other payload fields, not just the name", () => {
    const items = [
      item("a", "One", undefined, { agent_response: "please hold" }),
      item("b", "Two", undefined, { agent_response: "goodbye" }),
    ];
    const out = filterSortTaskItems(items, "hold", "desc");
    expect(out.map((i) => i.uuid)).toEqual(["a"]);
  });

  it("sorts newest-first for desc and oldest-first for asc", () => {
    const items = [
      item("old", "Old", "2024-01-01 00:00:00"),
      item("new", "New", "2024-06-01 00:00:00"),
    ];
    expect(filterSortTaskItems(items, "", "desc").map((i) => i.uuid)).toEqual([
      "new",
      "old",
    ]);
    expect(filterSortTaskItems(items, "", "asc").map((i) => i.uuid)).toEqual([
      "old",
      "new",
    ]);
  });

  it("falls back to created_at when updated_at is missing", () => {
    const items = [
      { uuid: "a", payload: { name: "A" }, created_at: "2024-01-01 00:00:00" },
      { uuid: "b", payload: { name: "B" }, created_at: "2024-09-01 00:00:00" },
    ];
    expect(filterSortTaskItems(items, "", "desc").map((i) => i.uuid)).toEqual([
      "b",
      "a",
    ]);
  });

  it("treats unparseable / missing dates as oldest", () => {
    const items = [
      { uuid: "bad", payload: { name: "Bad" }, updated_at: "not-a-date" },
      { uuid: "good", payload: { name: "Good" }, updated_at: "2024-05-01 00:00:00" },
    ];
    expect(filterSortTaskItems(items, "", "desc").map((i) => i.uuid)).toEqual([
      "good",
      "bad",
    ]);
  });

  it("tolerates a non-serialisable payload without throwing", () => {
    const circular: Record<string, unknown> = { name: "" };
    circular.self = circular;
    const items: TaskItemLike[] = [{ uuid: "a", payload: circular }];
    // "self" is unreachable via JSON, so a search that only the circular ref
    // could satisfy simply finds nothing rather than crashing.
    expect(filterSortTaskItems(items, "self", "desc")).toHaveLength(0);
  });
});

describe("taskItemsPage", () => {
  const items = Array.from({ length: 25 }, (_, i) =>
    item(
      String(i),
      `Item ${i}`,
      `2024-01-${String((i % 28) + 1).padStart(2, "0")} 00:00:00`,
    ),
  );

  it("returns the requested page slice and the full matching total", () => {
    const page = taskItemsPage(items, {
      search: "",
      sort: "asc",
      offset: 10,
      limit: 10,
    });
    expect(page.total).toBe(25);
    expect(page.items).toHaveLength(10);
    expect(page.items[0].uuid).toBe("10");
  });

  it("reports the last, short page correctly", () => {
    const page = taskItemsPage(items, {
      search: "",
      sort: "asc",
      offset: 20,
      limit: 10,
    });
    expect(page.total).toBe(25);
    expect(page.items).toHaveLength(5);
  });

  it("narrows the total to the search matches", () => {
    const page = taskItemsPage(items, {
      search: "Item 1",
      sort: "asc",
      offset: 0,
      limit: 10,
    });
    // "Item 1", "Item 10".."Item 19" => 11 matches
    expect(page.total).toBe(11);
    expect(page.items).toHaveLength(10);
  });

  it("returns an empty page for an empty task", () => {
    const page = taskItemsPage([], {
      search: "",
      sort: "desc",
      offset: 0,
      limit: 10,
    });
    expect(page).toEqual({ items: [], total: 0 });
  });
});
