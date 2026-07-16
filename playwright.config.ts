import { defineConfig, devices } from "@playwright/test";
import { STORAGE_STATE } from "./e2e/storage-state";

/**
 * End-to-end tests: drive a real browser through the running app.
 *
 * `webServer` boots `npm run dev -- -p 3100` (override via E2E_PORT) and
 * Playwright waits for that port before the suite starts. E2E specs live in
 * `e2e/` and are kept out of the Jest run via `testPathIgnorePatterns` in
 * jest.config.js.
 *
 * Two projects (see `projects` below): `public` specs run with no backend;
 * `authenticated` specs run logged-in against a real backend at
 * `NEXT_PUBLIC_BACKEND_URL` (auth seeded by e2e/auth.setup.ts). See
 * e2e/README.md.
 *
 * Coverage: run `E2E_COVERAGE=1 npx playwright test` (or `npm run
 * test:e2e:coverage`) to collect V8 code coverage of the app source. The
 * monocart-reporter maps it back to `src/` and writes lcov + HTML to
 * coverage/e2e/ — separate from the Jest component coverage in
 * coverage/component/. See e2e/fixtures.ts for the collection hook.
 */
const COLLECT_COVERAGE = process.env.E2E_COVERAGE === "1";

// E2E runs on its own port so it never reuses (and mixes coverage with) a dev
// server you're running by hand on :3000, or one from another git worktree.
const PORT = Number(process.env.E2E_PORT ?? 3100);
const BASE_URL = `http://localhost:${PORT}`;

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  // CI runs against `npm run dev`, so the first hit to each route pays a cold
  // Turbopack compile — give assertions and whole tests more headroom there.
  timeout: process.env.CI ? 60_000 : 30_000,
  expect: { timeout: process.env.CI ? 10_000 : 5_000 },
  reporter: COLLECT_COVERAGE
    ? [
        ["list"],
        [
          "monocart-reporter",
          {
            name: "Calibrate E2E",
            outputFile: "./coverage/e2e/test-report.html",
            coverage: {
              // Which V8 entries to process: our own dev server's app JS
              // chunks. Drop the HTML document, HMR client, and Turbopack
              // runtime — none carry useful app source.
              entryFilter: (entry: { url: string }) => {
                const url = entry.url || "";
                if (!url.includes(`localhost:${PORT}/_next/`)) return false;
                if (url.includes("hmr-client")) return false;
                if (url.includes("[turbopack]")) return false;
                return true;
              },
              // Unified source filter (glob, first match wins) applied to
              // every source — including un-source-mapped generated chunks,
              // which sourceFilter alone doesn't catch. Keep only our app
              // dirs; drop bundles, node_modules, and the Next.js framework
              // (its sources also map under a `src/` path, e.g. next/src/...).
              filter: {
                "**/_next/**": false,
                "**/node_modules/**": false,
                "**/next/src/**": false,
                // The Data Extraction agent tab is intentionally hidden (PR
                // #230), so its content component is unreachable by any E2E
                // flow. Exclude it so it doesn't drag down the denominator.
                // (first match wins, so this must precede the components glob.)
                "**/src/components/agent-tabs/DataExtractionTabContent.tsx": false,
                "**/src/app/**": true,
                "**/src/components/**": true,
                "**/src/hooks/**": true,
                "**/src/lib/**": true,
                "**/src/constants/**": true,
                "**": false,
              },
              reports: [["lcovonly"], ["html"], ["console-summary"]],
              outputDir: "./coverage/e2e",
            },
          },
        ],
      ]
    : process.env.CI
      ? "github"
      : "list",
  use: {
    baseURL: BASE_URL,
    trace: "on-first-retry",
  },
  projects: [
    // Signs up a user against the backend and saves storage state. A
    // dependency of `authenticated`, so it runs first.
    { name: "setup", testMatch: /.*\.setup\.ts/ },
    // Backend-free specs (public routes, client-side behavior). This is what
    // `npm run test:e2e` runs — no backend required. Any *.spec.ts that isn't a
    // backend-backed *.auth.spec.ts is a public spec (login, signup, landing).
    {
      name: "public",
      testMatch: /\.spec\.ts$/,
      testIgnore: /\.auth\.spec\.ts$/,
      use: { ...devices["Desktop Chrome"] },
    },
    // Backend-backed specs. Loads the storage state from `setup` so tests
    // start logged in. Run via `npm run test:e2e:integration` with a backend
    // at NEXT_PUBLIC_BACKEND_URL.
    {
      name: "authenticated",
      testMatch: /.*\.auth\.spec\.ts/,
      use: { ...devices["Desktop Chrome"], storageState: STORAGE_STATE },
      dependencies: ["setup"],
    },
  ],
  webServer: {
    command: `npm run dev -- -p ${PORT}`,
    url: BASE_URL,
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
    // `getBackendUrl()` throws when NEXT_PUBLIC_BACKEND_URL is unset, so the
    // fully-mocked public specs (which intercept every backend call via
    // page.route) still need a non-empty value for the client bundle. A real
    // value (set by the authenticated integration run) always wins; this is a
    // dummy fallback whose host is never actually reached — routes are matched
    // by path, and public specs mock them. Landing/login/signup never fetch on
    // load, so this is inert for them.
    env: {
      NEXT_PUBLIC_BACKEND_URL:
        process.env.NEXT_PUBLIC_BACKEND_URL || "http://backend.e2e.local",
    },
  },
});
