/**
 * Reads CHANGELOG.MD into the shape the changelog page draws.
 *
 * The file is written by .github/workflows/changelog.yml, one line per pull
 * request merged into main, under a heading per month:
 *
 *   ## August 2026
 *
 *   - Duplicate an agent from its own page ([#363](https://github.com/.../363))
 *
 * Anything that does not match is skipped rather than shown raw, so a hand
 * edit to the file can never put half-written markup on the page.
 */

export type ChangelogEntry = {
  /** What changed, in the words the changelog uses. */
  text: string;
  /** The pull request number, without the "#". */
  number: string;
  /** Where that pull request lives. */
  url: string;
};

export type ChangelogMonth = {
  /** The heading as written, for example "August 2026". */
  month: string;
  entries: ChangelogEntry[];
};

const HEADING = /^##\s+(\S.*?)\s*$/;
const ENTRY = /^-\s+(\S.*?)\s*\(\[#(\d+)\]\((https?:\/\/[^\s)]+)\)\)$/;

export function parseChangelog(text: string): ChangelogMonth[] {
  const months: ChangelogMonth[] = [];

  for (const line of text.split("\n")) {
    const heading = HEADING.exec(line);
    if (heading) {
      months.push({ month: heading[1], entries: [] });
      continue;
    }

    const entry = ENTRY.exec(line);
    // An entry before the first heading has no month to sit under, so it is
    // dropped with everything else that does not match.
    if (!entry || months.length === 0) continue;

    months[months.length - 1].entries.push({
      text: entry[1],
      number: entry[2],
      url: entry[3],
    });
  }

  // A month whose lines were all unreadable would otherwise show as a heading
  // with nothing under it.
  return months.filter((m) => m.entries.length > 0);
}
