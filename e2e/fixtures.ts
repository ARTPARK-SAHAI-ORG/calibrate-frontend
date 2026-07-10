import { test as base, expect } from "@playwright/test";
import { addCoverageReport } from "monocart-reporter";

/**
 * Playwright test fixture that collects **E2E code coverage** for the app
 * source, separate from the Jest component coverage.
 *
 * How it works: when `E2E_COVERAGE=1`, an auto-fixture starts Chromium's V8 JS
 * coverage before each test and hands the raw coverage to monocart-reporter
 * after. monocart maps the bundled JS back to `src/` files via source maps and
 * writes an lcov + HTML report to `coverage/e2e/` (see playwright.config.ts).
 *
 * With the flag off (plain `npm run test:e2e`) this is a no-op, so normal runs
 * stay fast. Coverage is Chromium-only — the V8 coverage API isn't available
 * in other engines, so we skip collection there.
 *
 * Import `test`/`expect` from this file in specs instead of `@playwright/test`.
 */
const COLLECT = process.env.E2E_COVERAGE === "1";

export const test = base.extend<{ autoCoverage: void }>({
  autoCoverage: [
    async ({ page, browserName }, use) => {
      const collect = COLLECT && browserName === "chromium";
      if (collect) {
        await page.coverage.startJSCoverage({ resetOnNavigation: false });
      }

      await use();

      if (collect) {
        const coverage = await page.coverage.stopJSCoverage();
        await addCoverageReport(coverage, test.info());
      }
    },
    { scope: "test", auto: true },
  ],
});

export { expect };
