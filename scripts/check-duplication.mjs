#!/usr/bin/env node
// Fails when the lines changed against main copy code that already exists, or
// type a web address that another file already has. Copies already on main are
// left alone, so this only ever asks about your own change.
//
//   npm run check:duplication              everything on the branch
//   npm run check:duplication -- --staged  only what is about to be committed
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
// Standard names every SVG or structured-data block carries, not links.
const STANDARD_URL = /^https?:\/\/(www\.)?(w3\.org|schema\.org)\//;
const isTest = (f) => /__tests__|\.test\.|\.spec\./.test(f);
/** Web addresses in a piece of text, minus a full stop or comma after them. */
const urlsIn = (text) =>
  (text.match(URL_RE) ?? []).map((u) => u.replace(/[.,;:!?]+$/, ""));

const git = (...args) =>
  execFileSync("git", args, { encoding: "utf8", maxBuffer: 1 << 28, stdio: "pipe" });

/** `git diff -U0` output -> Map of file -> Set of line numbers on the new side. */
export function parseChangedLines(diff) {
  const changed = new Map();
  let file = null;
  let prev = "";
  for (const line of diff.split("\n")) {
    const header = line.startsWith("+++ ") && prev.startsWith("--- ");
    prev = line;
    if (header) {
      // git ends the name with a tab when it contains a space.
      file = line === "+++ /dev/null" ? null : line.slice(6).replace(/\t$/, "");
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

// ponytail: a copy counts as new when at least half its lines on one side were
// changed. Editing a line inside a copy already on main stays allowed; a copy
// pasted in and then edited on most of its lines would also slip through.
const mostlyChanged = (changed, side) => {
  const lines = changed.get(side.name);
  if (!lines) return false;
  let hit = 0;
  for (let n = side.start; n <= side.end; n++) if (lines.has(n)) hit++;
  return hit * 2 >= side.end - side.start + 1;
};

/** jscpd's duplicates, kept only when one copy is mostly changed lines. */
export function newClones(duplicates, changed) {
  return duplicates.filter(
    (d) => mostlyChanged(changed, d.firstFile) || mostlyChanged(changed, d.secondFile),
  );
}

/** Web addresses typed on a changed line that another file already holds.
 *  `filesHolding(url)` lists files whose text contains it, possibly as part of
 *  a longer address; `readBefore(file)` is the file on main ("" if new), so an
 *  address the file already had is not blamed on whoever edits that line. */
export function repeatedUrls(changed, readFile, filesHolding, readBefore) {
  const found = [];
  for (const [file, lines] of changed) {
    if (file === LINKS_FILE || !/\.(ts|tsx)$/.test(file) || isTest(file)) continue;
    const text = readFile(file).split("\n");
    const before = urlsIn(readBefore(file));
    for (const n of lines) {
      for (const url of urlsIn(text[n - 1] ?? "")) {
        if (STANDARD_URL.test(url) || before.includes(url)) continue;
        const others = filesHolding(url).filter(
          (f) => f !== file && !isTest(f) && urlsIn(readFile(f)).includes(url),
        );
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
  process.chdir(git("rev-parse", "--show-toplevel").trim());
  // Before a commit, only what this commit adds; in CI, the whole branch.
  const base = process.argv.includes("--staged") ? "HEAD" : mergeBase();
  // --cached compares what is staged, so before a commit this is exactly what
  // is about to be committed; in CI nothing is staged beyond HEAD.
  const changed = parseChangedLines(
    git("-c", "core.quotePath=false", "diff", "-U0", "--cached", base, "--", "src"),
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

  const clones = newClones(duplicates, changed);
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
    (f) => {
      try {
        return git("show", `${base}:${f}`);
      } catch {
        return "";
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
