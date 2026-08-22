#!/usr/bin/env node
// Local stand-in for Codecov's `patch` check: are the lines this branch adds
// covered by tests?
//
// Codecov's patch target is `auto`, i.e. the base commit's coverage, so there
// is no fixed number to hardcode. We use this run's own overall coverage as
// the local stand-in for the base: main is nearly all of the code, so its
// coverage and this run's overall coverage sit within a point of each other.
//
// ponytail: reads whatever lcov files are already on disk rather than running
// the E2E suite itself. Run `npm run test:e2e:coverage` first if a changed file
// is only reached by Playwright.
import { readFileSync, existsSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { relative, resolve } from "node:path";

const ROOT = process.cwd();
const LCOV_FILES = ["coverage/component/lcov.info", "coverage/e2e/lcov.info"];

const git = (...args) =>
  execFileSync("git", args, { encoding: "utf8", maxBuffer: 1 << 28 });

/** Merge every lcov on disk into { path -> Map(line -> hits) }. */
function readCoverage() {
  const files = new Map();
  const found = [];
  for (const lcov of LCOV_FILES) {
    if (!existsSync(lcov)) continue;
    found.push(lcov);
    let current = null;
    for (const line of readFileSync(lcov, "utf8").split("\n")) {
      if (line.startsWith("SF:")) {
        const path = relative(ROOT, resolve(ROOT, line.slice(3).trim()));
        if (!files.has(path)) files.set(path, new Map());
        current = files.get(path);
      } else if (line.startsWith("DA:") && current) {
        const [no, hits] = line.slice(3).split(",");
        current.set(Number(no), (current.get(Number(no)) ?? 0) + Number(hits));
      } else if (line.startsWith("end_of_record")) {
        current = null;
      }
    }
  }
  return { files, found };
}

/** Lines this branch adds, per file: { path -> Set(line) }. */
function readChangedLines(base) {
  const diff = git("diff", "-U0", `${base}...HEAD`, "--", "src");
  const changed = new Map();
  let path = null;
  for (const line of diff.split("\n")) {
    if (line.startsWith("+++ b/")) {
      path = line.slice(6).trim();
      if (path === "/dev/null") path = null;
    } else if (line.startsWith("@@") && path) {
      const m = /\+(\d+)(?:,(\d+))?/.exec(line);
      if (!m) continue;
      const start = Number(m[1]);
      const count = m[2] === undefined ? 1 : Number(m[2]);
      if (!changed.has(path)) changed.set(path, new Set());
      for (let i = 0; i < count; i++) changed.get(path).add(start + i);
    }
  }
  return changed;
}

function baseRef() {
  for (const ref of ["origin/main", "main"]) {
    try {
      return git("merge-base", ref, "HEAD").trim();
    } catch {}
  }
  return null;
}

const base = baseRef();
if (!base) {
  console.log("No main branch to compare against — skipping patch coverage.");
  process.exit(0);
}

const { files, found } = readCoverage();
if (found.length === 0) {
  console.error("No coverage found. Run `npm run test:coverage` first.");
  process.exit(1);
}
if (!found.some((f) => f.includes("/e2e/"))) {
  console.log(
    "Note: no coverage/e2e/lcov.info — lines only reached by Playwright will look uncovered.\n" +
      "      Run `npm run test:e2e:coverage` if that is the case here.",
  );
}

// Overall coverage across everything measured — the local stand-in for main's.
let overallHit = 0;
let overallTotal = 0;
for (const lines of files.values()) {
  for (const hits of lines.values()) {
    overallTotal++;
    if (hits > 0) overallHit++;
  }
}

const changed = readChangedLines(base);
const uncovered = [];
let patchHit = 0;
let patchTotal = 0;
for (const [path, lines] of changed) {
  // Files with no lcov entry are outside what coverage measures (src/app,
  // middleware, auth.ts and the other collectCoverageFrom exclusions).
  const measured = files.get(path);
  if (!measured) continue;
  for (const line of [...lines].sort((a, b) => a - b)) {
    const hits = measured.get(line);
    if (hits === undefined) continue; // not an executable line
    patchTotal++;
    if (hits > 0) patchHit++;
    else uncovered.push(`${path}:${line}`);
  }
}

const pct = (hit, total) => (total === 0 ? 100 : (hit / total) * 100);
const patchPct = pct(patchHit, patchTotal);
const overallPct = pct(overallHit, overallTotal);

if (patchTotal === 0) {
  console.log("No changed lines under src/ are measured — nothing to check.");
  process.exit(0);
}

console.log(
  `Changed lines covered: ${patchHit}/${patchTotal} (${patchPct.toFixed(2)}%)\n` +
    `Target (this run's overall coverage): ${overallPct.toFixed(2)}%`,
);

if (patchPct + 1e-9 >= overallPct) {
  console.log("Patch coverage is at or above the target.");
  process.exit(0);
}

console.error(
  `\nPatch coverage is below the target. ${uncovered.length} changed line(s) have no test:\n` +
    uncovered.map((l) => `  ${l}`).join("\n") +
    "\n\nAdd tests that reach these lines, or push with SKIP_COVERAGE=1 to bypass.",
);
process.exit(1);
