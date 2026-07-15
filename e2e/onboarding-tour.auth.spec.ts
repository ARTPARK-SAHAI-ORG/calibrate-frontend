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

    // 1) Welcome -> 2) Create an agent (spotlights "New agent").
    await step(page, "Welcome to Calibrate");
    await step(page, "Create an agent");

    // 3) Name it: the action opens the dialog; assert it, then let the step
    //    fill "Demo agent" and submit, which navigates to the detail page.
    await expect(popoverTitle(page)).toContainText("Name it", { timeout: 30000 });
    await expect(page.locator('[data-tour="agent-name-input"]')).toBeVisible({
      timeout: 15000,
    });
    await nextButton(page).click();

    // 4) System prompt: land on the detail page, then the step pastes a sample.
    await expect(page).toHaveURL(/\/agents\/[0-9a-f-]{36}/, { timeout: 20000 });
    await step(page, "Give it a system prompt");
    await expect(page.locator('[data-tour="agent-system-prompt"]')).toHaveValue(
      /customer-support/i,
      { timeout: 15000 },
    );

    // 5) Save -> 6) Evaluators tab -> 7) Tests tab (seeds two demo tests).
    await step(page, "Save the agent");
    await step(page, "Evaluators score conversations");
    await step(page, "Now let's add tests");

    // The seeded demo tests should appear in the Tests tab list.
    await expect(page.getByText("Demo · shipping time").first()).toBeVisible({
      timeout: 20000,
    });

    // 8) Run: the action clicks "Run all tests" and opens TestRunnerDialog.
    await step(page, "Run the evaluation");

    // 9) Results: the summary anchor renders once the run completes. The fake
    //    backend passes every case -> 100% pass rate.
    await expect(popoverTitle(page)).toContainText("Read the results", {
      timeout: 90000,
    });
    await expect(page.locator('[data-tour="test-run-summary"]')).toBeVisible({
      timeout: 15000,
    });
    await expect(page.getByText("Pass rate").first()).toBeVisible({ timeout: 15000 });
    await expect(page.getByText("100%").first()).toBeVisible({ timeout: 15000 });

    // Finish the tour; the popover should disappear.
    await nextButton(page).click();
    await expect(popoverTitle(page)).toHaveCount(0, { timeout: 10000 });
  });
});
