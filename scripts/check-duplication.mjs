#!/usr/bin/env node
// Fails when the lines changed against main copy code that already exists, or
// type a web address that another file already has. Copies already on main are
// left alone, so this only ever asks about your own change.
//
//   npm run check:duplication
//
// Run before each commit (.husky/pre-commit) and on every pull request.
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const MIN_TOKENS = "100";
const IGNORE = "**/__tests__/**,**/*.test.*,**/*.spec.*";
const URL_RE = /https?:\/\/[^\s"'`)<>\\]+/g;
const LINKS_FILE = "src/constants/links.ts";

const git = (...args) =>
  execFileSync("git", args, { encoding: "utf8", maxBuffer: 1 << 28 });

/** `git diff -U0` output -> Map of file -> Set of line numbers on the new side. */
export function parseChangedLines(diff) {
  const changed = new Map();
  let file = null;
  for (const line of diff.split("\n")) {
    if (line.startsWith("+++ ")) {
      file = line === "+++ /dev/null" ? null : line.slice(6);
      if (file && !changed.has(file)) changed.set(file, new Set());
      continue;
    }
    const hunk = file && /^@@ -\S+ \+(\d+)(?:,(\d+))? @@/.exec(line);
    if (!hunk) continue;
    const start = Number(hunk[1]);
    const count = hunk[2] === undefined ? 1 : Number(hunk[2]);
    for (let n = start; n < start + count; n++) changed.get(file).add(n);
  }
  return changed;
}

const touches = (changed, side) => {
  const lines = changed.get(side.name);
  if (!lines) return false;
  for (let n = side.start; n <= side.end; n++) if (lines.has(n)) return true;
  return false;
};

/** jscpd's duplicates, kept only when either copy covers a changed line. */
export function clonesTouchingChanges(duplicates, changed) {
  return duplicates.filter(
    (d) => touches(changed, d.firstFile) || touches(changed, d.secondFile),
  );
}

/** Web addresses typed on a changed line that another file already holds.
 *  `filesHolding(url)` returns every file under src/ containing it. */
export function repeatedUrls(changed, readFile, filesHolding) {
  const found = [];
  for (const [file, lines] of changed) {
    if (file === LINKS_FILE || !/\.(ts|tsx)$/.test(file)) continue;
    if (/__tests__|\.test\.|\.spec\./.test(file)) continue;
    const text = readFile(file).split("\n");
    for (const n of lines) {
      for (const url of text[n - 1]?.match(URL_RE) ?? []) {
        const others = filesHolding(url).filter((f) => f !== file);
        if (others.length) found.push({ file, line: n, url, others });
      }
    }
  }
  return found;
}

function mergeBase() {
  for (const ref of ["origin/main", "main"]) {
    try {
      return git("merge-base", ref, "HEAD").trim();
    } catch {
      // try the next one
    }
  }
  console.error(
    "check-duplication: cannot find main to compare against. Run `git fetch origin main` and try again.",
  );
  process.exit(2);
}

function main() {
  // --cached compares what is staged, so before a commit this is exactly what
  // is about to be committed; in CI nothing is staged beyond HEAD.
  const changed = parseChangedLines(
    git("diff", "-U0", "--cached", mergeBase(), "--", "src"),
  );
  if (changed.size === 0) return;

  const out = mkdtempSync(join(tmpdir(), "jscpd-"));
  let duplicates;
  try {
    // ponytail: scans the files on disk, so lines edited but not staged can
    // shift the line numbers a little before a commit. Exact in CI.
    execFileSync(
      "npx",
      ["jscpd", "src", "--min-tokens", MIN_TOKENS, "--ignore", IGNORE,
        // jscpd skips files over 1000 lines by default, and the biggest files
        // are where copies pile up.
        "--max-lines", "100000", "--max-size", "5mb",
        "--reporters", "json", "--output", out, "--silent"],
      { stdio: ["ignore", "ignore", "inherit"] },
    );
    duplicates = JSON.parse(
      readFileSync(join(out, "jscpd-report.json"), "utf8"),
    ).duplicates;
  } finally {
    rmSync(out, { recursive: true, force: true });
  }

  const clones = clonesTouchingChanges(duplicates, changed);
  const urls = repeatedUrls(
    changed,
    (f) => readFileSync(f, "utf8"),
    (url) => {
      try {
        return git("grep", "-lF", url, "--", "src").trim().split("\n");
      } catch {
        return [];
      }
    },
  );

  for (const d of clones) {
    const a = d.firstFile;
    const b = d.secondFile;
    console.error(
      `Copied code (${d.lines} lines): ${a.name}:${a.start}-${a.end} matches ${b.name}:${b.start}-${b.end}`,
    );
  }
  for (const u of urls) {
    console.error(
      `${u.file}:${u.line} types ${u.url}, which ${u.others.join(", ")} already has. Put it in ${LINKS_FILE} and import it from there.`,
    );
  }
  if (clones.length || urls.length) {
    console.error(
      "\nReuse the existing code instead of copying it: move it into a shared function or component and call that from both places.",
    );
    process.exit(1);
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) main();
