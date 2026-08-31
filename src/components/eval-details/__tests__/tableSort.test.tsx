import React from "react";
import { render, screen, setupUser } from "@/test-utils";
import { compareCells, SortableTh, useTableSort } from "../tableSort";

describe("compareCells", () => {
  it("compares numbers as numbers, not as text", () => {
    // Compared as text, "10" would come before "9". As numbers it comes after.
    expect(compareCells("9", "10", "asc")).toBeLessThan(0);
    expect(compareCells("9", "10", "desc")).toBeGreaterThan(0);
  });

  it("compares text alphabetically, ignoring case", () => {
    expect(compareCells("apple", "Banana", "asc")).toBeLessThan(0);
    expect(compareCells("apple", "Banana", "desc")).toBeGreaterThan(0);
  });

  it("keeps blank cells at the bottom whichever way the column is sorted", () => {
    for (const dir of ["asc", "desc"] as const) {
      expect(compareCells(null, 1, dir)).toBeGreaterThan(0);
      expect(compareCells("", 1, dir)).toBeGreaterThan(0);
      expect(compareCells("   ", 1, dir)).toBeGreaterThan(0);
      expect(compareCells(1, undefined, dir)).toBeLessThan(0);
    }
    expect(compareCells(null, "", "asc")).toBe(0);
  });
});

// A miniature table using the same pieces the STT and TTS results tables use.
function SortDemo({ scores }: { scores: (number | null)[] }) {
  const { sort, toggleSort, sortRows } = useTableSort();
  const ordered = sortRows(scores, (score, key, index) =>
    key === "id" ? index : score,
  );
  return (
    <table>
      <thead>
        <tr>
          <SortableTh
            label="ID"
            sortKey="id"
            sort={sort}
            onToggle={toggleSort}
          />
          <SortableTh
            label="Score"
            sortKey="score"
            sort={sort}
            onToggle={toggleSort}
          />
        </tr>
      </thead>
      <tbody>
        {ordered.map(({ row, index }) => (
          <tr key={index} data-testid="row">
            <td>{index + 1}</td>
            <td>{row ?? "-"}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

const rowIds = () =>
  screen.getAllByTestId("row").map((tr) => tr.querySelector("td")!.textContent);

describe("useTableSort + SortableTh", () => {
  it("sorts smallest first, then largest first, then back to the run's own order", async () => {
    const user = setupUser();
    render(<SortDemo scores={[3, 1, 2]} />);
    expect(rowIds()).toEqual(["1", "2", "3"]);

    await user.click(screen.getByRole("button", { name: /Score/ }));
    expect(rowIds()).toEqual(["2", "3", "1"]);

    await user.click(screen.getByRole("button", { name: /Score/ }));
    expect(rowIds()).toEqual(["1", "3", "2"]);

    await user.click(screen.getByRole("button", { name: /Score/ }));
    expect(rowIds()).toEqual(["1", "2", "3"]);
  });

  it("keeps each row's own number when the rows move", async () => {
    const user = setupUser();
    render(<SortDemo scores={[3, 1, 2]} />);
    await user.click(screen.getByRole("button", { name: /Score/ }));
    // Row 2 holds the smallest score, so it moves to the top with its number.
    const firstRow = screen.getAllByTestId("row")[0];
    expect(firstRow.textContent).toBe("21");
  });

  it("puts rows with no score at the bottom both ways round", async () => {
    const user = setupUser();
    render(<SortDemo scores={[3, null, 1]} />);
    await user.click(screen.getByRole("button", { name: /Score/ }));
    expect(rowIds()).toEqual(["3", "1", "2"]);
    await user.click(screen.getByRole("button", { name: /Score/ }));
    expect(rowIds()).toEqual(["1", "3", "2"]);
  });

  it("switching columns starts that column smallest first", async () => {
    const user = setupUser();
    render(<SortDemo scores={[3, 1, 2]} />);
    await user.click(screen.getByRole("button", { name: /Score/ }));
    await user.click(screen.getByRole("button", { name: /Score/ }));
    await user.click(screen.getByRole("button", { name: /ID/ }));
    expect(rowIds()).toEqual(["1", "2", "3"]);
    expect(screen.getByRole("columnheader", { name: /ID/ })).toHaveAttribute(
      "aria-sort",
      "ascending",
    );
    expect(screen.getByRole("columnheader", { name: /Score/ })).toHaveAttribute(
      "aria-sort",
      "none",
    );
  });
});
