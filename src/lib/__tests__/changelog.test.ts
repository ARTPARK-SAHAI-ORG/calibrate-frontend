import { readFileSync } from "node:fs";
import { join } from "node:path";
import { parseChangelog } from "../changelog";

describe("parseChangelog", () => {
  it("groups entries under the month above them, in file order", () => {
    const months = parseChangelog(
      [
        "## August 2026",
        "",
        "- Duplicate an agent from its own page ([#363](https://github.com/o/r/pull/363))",
        "- Search an agent's traces ([#354](https://github.com/o/r/pull/354))",
        "",
        "## July 2026",
        "",
        "- Save an agent with Cmd+S ([#284](https://github.com/o/r/pull/284))",
        "",
      ].join("\n"),
    );

    expect(months.map((m) => m.month)).toEqual(["August 2026", "July 2026"]);
    expect(months[0].entries).toEqual([
      {
        text: "Duplicate an agent from its own page",
        number: "363",
        url: "https://github.com/o/r/pull/363",
      },
      {
        text: "Search an agent's traces",
        number: "354",
        url: "https://github.com/o/r/pull/354",
      },
    ]);
    expect(months[1].entries).toHaveLength(1);
  });

  it("keeps brackets inside the sentence out of the link", () => {
    const [month] = parseChangelog(
      [
        "## August 2026",
        "- Accept any value with the new [Is any] option ([#202](https://github.com/o/r/pull/202))",
      ].join("\n"),
    );

    expect(month.entries[0]).toEqual({
      text: "Accept any value with the new [Is any] option",
      number: "202",
      url: "https://github.com/o/r/pull/202",
    });
  });

  it("skips lines that are not a heading or an entry", () => {
    const [month] = parseChangelog(
      [
        "## August 2026",
        "Some stray prose someone typed in by hand",
        "- An entry with no link at all",
        "- A half written one ([#12](",
        "- Duplicate an agent ([#363](https://github.com/o/r/pull/363))",
      ].join("\n"),
    );

    expect(month.entries).toHaveLength(1);
    expect(month.entries[0].number).toBe("363");
  });

  it("drops an entry that sits before any month heading", () => {
    expect(
      parseChangelog(
        "- Orphan entry ([#1](https://github.com/o/r/pull/1))\n## August 2026\n",
      ),
    ).toEqual([]);
  });

  it("drops a month with no readable entries under it", () => {
    const months = parseChangelog(
      [
        "## August 2026",
        "nothing readable here",
        "## July 2026",
        "- Save an agent ([#284](https://github.com/o/r/pull/284))",
      ].join("\n"),
    );

    expect(months.map((m) => m.month)).toEqual(["July 2026"]);
  });

  it("returns nothing for an empty file", () => {
    expect(parseChangelog("")).toEqual([]);
  });

  it("reads every line of the real CHANGELOG.MD", () => {
    const text = readFileSync(join(process.cwd(), "CHANGELOG.MD"), "utf8");
    const months = parseChangelog(text);
    const entries = months.flatMap((m) => m.entries);

    // Every line that starts with "-" in the file has to survive the parse,
    // otherwise the page would quietly drop entries the workflow wrote.
    const dashes = text.split("\n").filter((l) => l.startsWith("- ")).length;
    expect(entries).toHaveLength(dashes);
    expect(months.length).toBeGreaterThan(0);
    for (const entry of entries) {
      expect(entry.text).not.toMatch(/\[|\]/);
      expect(entry.url).toContain(`/pull/${entry.number}`);
    }
  });
});
