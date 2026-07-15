// Onboarding flagship tour E2E: verify the auto-driving "Run your first
// evaluation" tour actually builds and runs a real evaluation end to end.
//
// The tour injects sample values and clicks the app's real controls, so this
// spec only drives the tour's own popover "Next" button and asserts the app
// reaches each milestone: create agent -> system prompt -> save -> Evaluators
// tab -> Tests tab (seeds 2 demo tests via API) -> run -> results summary.
//
// Like runs.auth.spec.ts it needs the backend in FAKE_AI_PROVIDERS mode so the
// run returns deterministic passing results with no AI keys/cost. Every test
// here is SKIPPED unless E2E_FAKE_AI=1 (set by `npm run test:e2e:integration`).
//
// Run locally against a fake-AI backend with:
//   E2E_FAKE_AI=1 NEXT_PUBLIC_BACKEND_URL=http://localhost:8001 \
//     npx playwright test --project=authenticated onboarding-tour
import { test, expect } from "./fixtures";
import { waitForOrgReady } from "./helpers";
import type { Page } from "@playwright/test";

const FAKE_AI = process.env.E2E_FAKE_AI === "1";

// The tour hard-codes this agent name (src/lib/onboarding/tours/firstEval.ts).
const DEMO_AGENT_NAME = "Demo agent";
const SEEN_KEY = "calibrate:onboarding:v1:first-eval";
const START_EVENT = "calibrate:start-tour";

const popoverTitle = (page: Page) => page.locator(".driver-popover-title");
const nextButton = (page: Page) => page.locator(".driver-popover-next-btn");

/** Advance the tour: assert the current step's title, then click its Next. */
async function step(page: Page, title: string): Promise<void> {
  await expect(popoverTitle(page)).toContainText(title, { timeout: 30000 });
  await nextButton(page).click();
}

async function deleteAgentIfPresent(page: Page, name: string): Promise<void> {
  await page.goto("/agents");
  await waitForOrgReady(page);
  const row = page.locator("div.grid").filter({ hasText: name });
  if (await row.first().isVisible().catch(() => false)) {
    await row.first().getByRole("button", { name: "Delete agent" }).click();
    await expect(page.getByRole("heading", { name: "Delete agent" })).toBeVisible();
    await page.getByRole("button", { name: "Delete", exact: true }).click();
    await expect(row).toHaveCount(0, { timeout: 15000 });
  }
}

test.describe("Onboarding flagship tour (authenticated, fake-AI backend)", () => {
  test.beforeEach(async ({ page }) => {
    test.skip(
      !FAKE_AI,
      "requires the backend in FAKE_AI_PROVIDERS mode; set E2E_FAKE_AI=1",
    );
    // Disable the first-run auto-start so the tour starts only when we dispatch
    // it — deterministic regardless of prior "seen" state in shared storage.
    await page.addInitScript(
      (key) => {
        try {
          localStorage.setItem(key, "completed");
        } catch {
          /* ignore */
        }
      },
      SEEN_KEY,
    );
    await deleteAgentIfPresent(page, DEMO_AGENT_NAME);
  });

  test.afterEach(async ({ page }) => {
    await deleteAgentIfPresent(page, DEMO_AGENT_NAME);
  });

  test("auto-drives create -> tests -> run -> results", async ({ page }) => {
    await page.goto("/agents");
    await waitForOrgReady(page);

    // Start the tour explicitly (the profile-menu "Take a tour" path).
    await page.evaluate(
      (evt) => window.dispatchEvent(new CustomEvent(evt, { detail: "first-eval" })),
      START_EVENT,
    );

    // 1) Welcome: assert the theme class lands (so the app styling applies),
    //    the "X of N" progress counter, and the always-present Skip affordance.
    await expect(popoverTitle(page)).toContainText("Welcome to Calibrate", {
      timeout: 30000,
    });
    await expect(page.locator(".driver-popover")).toHaveClass(/calibrate-tour/);
    await expect(page.locator(".driver-popover-progress-text")).toContainText(
      /1 of \d+/,
    );
    await expect(page.locator(".calibrate-tour-skip")).toBeVisible();
    // Clicking the backdrop (top-left corner, away from the popover) must NOT
    // end the tour — only the X and "Skip tour" buttons do.
    await page.mouse.click(5, 5);
    await expect(popoverTitle(page)).toContainText("Welcome to Calibrate");
    await nextButton(page).click();

    // 2) Create an agent (spotlights "New agent"; action opens + names the form).
    await step(page, "Create an agent");

    // 3) Build or connect: the dialog shows both options (name prefilled);
    //    Next creates the agent.
    await expect(popoverTitle(page)).toContainText("Build or connect", {
      timeout: 30000,
    });
    await expect(page.locator('[data-tour="agent-type-options"]')).toBeVisible({
      timeout: 15000,
    });
    await nextButton(page).click();

    // 4) Instructions: land on the detail page; the sample prompt is prefilled.
    await expect(page).toHaveURL(/\/agents\/[0-9a-f-]{36}/, { timeout: 20000 });
    await expect(popoverTitle(page)).toContainText("Give it instructions", {
      timeout: 30000,
    });
    await expect(page.locator('[data-tour="agent-system-prompt"]')).toHaveValue(
      /customer-support/i,
      { timeout: 15000 },
    );
    // Exactly one popover — no orphan left over from the create-navigation.
    await expect(page.locator(".driver-popover")).toHaveCount(1);
    await nextButton(page).click();

    // 5) Save -> 6) Add an evaluator (opens the picker) -> 7) pick Correctness.
    await step(page, "Save your work");
    await expect(page.locator(".driver-popover")).toHaveCount(1);
    await step(page, "Add an evaluator");
    await expect(page.locator('[data-tour="add-evaluators-dialog"]')).toBeVisible({
      timeout: 15000,
    });
    await step(page, "Choose what to check");

    // 8) Meet your tests: the two seeded tests appear in the list.
    await expect(popoverTitle(page)).toContainText("Meet your tests", {
      timeout: 30000,
    });
    await expect(page.getByText("Demo · shipping time").first()).toBeVisible({
      timeout: 20000,
    });
    await nextButton(page).click();

    // 9) Open a test -> 10) its message -> 11) its evaluator (closes the editor).
    await step(page, "Your two sample tests");
    await step(page, "The customer's message");
    await step(page, "How it is graded");

    // 12) Run: clicks "Run all tests" and opens TestRunnerDialog.
    await step(page, "Run your tests");

    // 13) Summary results: renders once the run completes. The fake backend
    //     passes every case -> 100% pass rate.
    await expect(popoverTitle(page)).toContainText("Your results", {
      timeout: 90000,
    });
    await expect(page.locator('[data-tour="test-run-summary"]')).toBeVisible({
      timeout: 15000,
    });
    await expect(page.getByText("Pass rate").first()).toBeVisible({ timeout: 15000 });
    await expect(page.getByText("100%").first()).toBeVisible({ timeout: 15000 });
    await nextButton(page).click();

    // 14) Outputs tab -> 15) open a result -> 16) the answer -> 17) the verdict.
    await step(page, "See every answer");
    await step(page, "Passed and failed");
    await step(page, "Your agent's answer");
    await expect(popoverTitle(page)).toContainText("The evaluator's verdict", {
      timeout: 15000,
    });
    await expect(page.locator('[data-tour="run-result-verdict"]')).toBeVisible({
      timeout: 10000,
    });

    // Finish the tour; the popover should disappear.
    await nextButton(page).click();
    await expect(popoverTitle(page)).toHaveCount(0, { timeout: 10000 });
  });
});
