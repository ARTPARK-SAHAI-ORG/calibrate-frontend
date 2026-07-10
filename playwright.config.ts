import { defineConfig, devices } from "@playwright/test";

/**
 * End-to-end tests: drive a real browser through the running app.
 *
 * `webServer` boots `npm run dev` (reusing an already-running one locally) and
 * Playwright waits for :3000 before the suite starts. E2E specs live in `e2e/`
 * and are kept out of the Jest run via `testPathIgnorePatterns` in
 * jest.config.js.
 *
 * Note: specs that hit authenticated pages need a real or mocked backend
 * (`NEXT_PUBLIC_BACKEND_URL`). The starter spec only touches public routes so
 * it runs with no backend. See e2e/README.md.
 */
export default defineConfig({
  testDir: "./e2e",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  reporter: process.env.CI ? "github" : "list",
  use: {
    baseURL: "http://localhost:3000",
    trace: "on-first-retry",
  },
  projects: [
    { name: "chromium", use: { ...devices["Desktop Chrome"] } },
  ],
  webServer: {
    command: "npm run dev",
    url: "http://localhost:3000",
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
});
