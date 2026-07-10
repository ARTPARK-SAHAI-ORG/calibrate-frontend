// Keep only real app source files in the E2E lcov report.
//
// monocart maps V8 coverage back to `src/*` via source maps, but it also emits
// coverage records for the generated bundle chunks themselves (the
// `_next/static/chunks/..._src_app_login_page_tsx.js` wrappers). Those aren't
// reachable by monocart's entryFilter/sourceFilter/filter options and they
// double-count against the mapped originals, skewing the totals. This strips
// every lcov record whose source file isn't under `src/`.
//
// Runs automatically after `npm run test:e2e:coverage`.
import { readFileSync, writeFileSync, existsSync } from "node:fs";

const LCOV_PATH = "coverage/e2e/lcov.info";

if (!existsSync(LCOV_PATH)) {
  // No coverage produced (e.g. tests were filtered out) — nothing to clean.
  process.exit(0);
}

const raw = readFileSync(LCOV_PATH, "utf8");

// lcov records are separated by `end_of_record`; each starts with `SF:<path>`.
const kept = raw
  .split(/end_of_record\r?\n?/)
  .filter((record) => {
    const match = record.match(/^SF:(.+)$/m);
    if (!match) return false;
    const sourceFile = match[1].trim();
    return /(^|\/)src\//.test(sourceFile) && !sourceFile.includes("_next/");
  })
  .map((record) => `${record.trimStart()}end_of_record\n`)
  .join("");

writeFileSync(LCOV_PATH, kept);

const files = (kept.match(/^SF:/gm) || []).length;
console.log(`[clean-e2e-lcov] kept ${files} src/ file(s) in ${LCOV_PATH}`);
