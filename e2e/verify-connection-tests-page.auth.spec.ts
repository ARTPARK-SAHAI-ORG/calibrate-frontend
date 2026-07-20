// Backend-backed coverage for the "verify the connection before running" gate
// on the LLM Tests page (/tests). Clicking Run on a test opens RunTestDialog
// (the agent picker); picking an UNVERIFIED connection agent and clicking "Run
// test" opens VerifyConnectionDialog instead of starting the run. Clicking
// Verify either starts the run (pass) or shows the error + "Try again" / "View
// connection settings" (fail).
//
// Test 1 uses the REAL backend verify (URL points at example.com, so it fails)
// to exercise the gate + failure UI. Test 2 MOCKS only the verify endpoint to
// return success, then lets the real FAKE_AI run complete.
//
// These require the backend in FAKE_AI_PROVIDERS mode (deterministic, no AI
// keys/cost); they SKIP unless E2E_FAKE_AI=1, which `npm run test:e2e:integration`
// sets. Run with that command (see e2e/README.md / CLAUDE.md).
import { test, expect } from "./fixtures";
import { waitForOrgReady } from "./helpers";
import type { Page } from "@playwright/test";

const FAKE_AI = process.env.E2E_FAKE_AI === "1";

// A completed one-test run, shaped like GET /agent-tests/run/{id} for a pass.
const COMPLETED_RUN = {
  task_id: "mock-run-1",
  name: "mock run",
  status: "done",
  total_tests: 1,
  passed: 1,
  failed: 0,
  results: [
    {
      test_uuid: "mock-test-1",
      test_name: "verify pass test",
      status: "passed",
      passed: true,
      reasoning: "Simulated judge reasoning: criteria satisfied.",
      output: { response: "Simulated agent reply." },
      chat_history: [{ role: "user", content: "hi" }],
      judge_results: [],
    },
  ],
  evaluators: [],
};

// Create an agent through the "New agent" dialog and land on its detail page.
// Copied from e2e/agent-detail.auth.spec.ts (helpers are kept local per repo
// convention so specs stay independent). The dialog's token comes from a hook
// effect, so the very first create can race auth readiness and 401 (a no-op
// that leaves the dialog open) — retry the click until we navigate to detail.
async function createAgent(
  page: Page,
  name: string,
  kind: "build" | "connection" = "build",
): Promise<void> {
  await page.goto("/agents");
  await waitForOrgReady(page);

  const heading = page.getByRole("heading", { name: "New agent" });
  const createBtn = page.getByRole("button", { name: "Create", exact: true });
  // Cold-start / auth race: on the first authenticated test the /agents route
  // compiles on demand and the create can 401 (a no-op) or leave the dialog
  // closed without navigating. Re-open and refill the dialog each retry so the
  // block self-heals instead of spinning on a dialog that is no longer there.
  await expect(async () => {
    if (!(await heading.isVisible().catch(() => false))) {
      await page.getByRole("button", { name: "New agent" }).first().click();
      await expect(heading).toBeVisible();
      await page.getByPlaceholder("Enter agent name").fill(name);
      if (kind === "connection") {
        await page.getByText("Connect your existing agent").click();
      }
    }
    if (await createBtn.isVisible().catch(() => false)) {
      await createBtn.click();
    }
    await expect(page).toHaveURL(/\/agents\/[0-9a-f-]{36}/, { timeout: 6000 });
  }).toPass({ timeout: 45000 });
}

// Delete an agent from the /agents list via its titled delete button.
// Copied from e2e/runs.auth.spec.ts / agent-detail.auth.spec.ts.
async function deleteAgent(page: Page, name: string): Promise<void> {
  await page.goto("/agents");
  const row = page.locator("div.grid").filter({ hasText: name });
  await expect(row).toBeVisible({ timeout: 15000 });
  await row.getByRole("button", { name: "Delete agent" }).click();
  await expect(
    page.getByRole("heading", { name: "Delete agent" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Delete", exact: true }).click();
  await expect(row).toHaveCount(0, { timeout: 15000 });
}

// Create an unverified connection agent, then set its endpoint URL. Filling the
// URL triggers a debounced auto-save (AgentDetail); it does NOT verify, so the
// agent stays verified === false and the run gate fires. Mirrors the URL-set
// flow in agent-detail.auth.spec.ts.
async function createUnverifiedConnectionAgent(
  page: Page,
  name: string,
): Promise<void> {
  await createAgent(page, name, "connection");

  const urlInput = page.getByPlaceholder("https://your-agent.example.com/chat");
  await expect(urlInput).toBeVisible({ timeout: 15000 });
  await urlInput.fill("https://example.com/agent");
  // Let the debounced auto-save (~800ms) persist the URL before we navigate
  // away, so leaving the tab does not pop an "Unsaved changes" guard.
  await page.waitForTimeout(1500);
}

// Create a standalone next-reply test on /tests. Mirrors the proven create flow
// in tests.auth.spec.ts ("creates a next-reply test through the editor"): the
// editor opens pre-seeded with a user/agent/user conversation + the default
// Correctness evaluator, so a valid create only needs every seeded message
// filled and the evaluator criteria set. (The /tests page — unlike the agent
// Tests tab — does not pop the "Update default evaluators?" prompt.)
async function createStandaloneTest(page: Page, name: string): Promise<void> {
  await page.goto("/tests");
  await waitForOrgReady(page);
  await expect(
    page.getByRole("heading", { name: "LLM Tests" }),
  ).toBeVisible({ timeout: 20000 });

  await page.getByRole("button", { name: "Create test" }).first().click();
  await expect(
    page.getByRole("heading", { name: "Create a test" }),
  ).toBeVisible({ timeout: 20000 });
  await page.getByRole("button", { name: "Next reply test" }).click();

  const nameInput = page.getByPlaceholder("Your test name");
  await expect(nameInput).toBeVisible({ timeout: 20000 });
  await nameInput.fill(name);

  const messageBoxes = page.getByPlaceholder(/Enter (user|agent) message/);
  await expect(messageBoxes.first()).toBeVisible({ timeout: 15000 });
  const boxCount = await messageBoxes.count();
  for (let i = 0; i < boxCount; i++) {
    await messageBoxes.nth(i).fill(`Sample conversation turn ${i + 1}.`);
  }
  await page
    .getByPlaceholder("Criteria that the agent's response should satisfy")
    .fill("The agent answers the user's question clearly and politely.");

  await page.getByRole("button", { name: "Create", exact: true }).click();
  await expect(nameInput).toHaveCount(0, { timeout: 20000 });
  await expect(page.getByText(name, { exact: true }).first()).toBeVisible({
    timeout: 20000,
  });
}

// Delete a standalone test from the /tests list. Mirrors the cleanup in
// tests.auth.spec.ts.
async function deleteTest(page: Page, name: string): Promise<void> {
  await page.goto("/tests");
  await waitForOrgReady(page);
  const nameCell = page.getByText(name, { exact: true }).first();
  await expect(nameCell).toBeVisible({ timeout: 20000 });
  await nameCell
    .locator('xpath=ancestor::div[.//button[@title="Delete test"]][1]')
    .getByRole("button", { name: "Delete test" })
    .click();
  await expect(
    page.getByRole("heading", { name: "Delete test" }),
  ).toBeVisible({ timeout: 15000 });
  await page.getByRole("button", { name: "Delete", exact: true }).click();
  await expect(page.getByText(name, { exact: true })).toHaveCount(0, {
    timeout: 15000,
  });
}

// From the /tests list: open a test's Run dialog, pick the connection agent by
// name, and click "Run test". Leaves the verify gate to the caller to assert.
// The desktop table row's run control has aria-label "Run this test" (the
// mobile card uses "Run test", so this stays unambiguous on the desktop
// viewport). The RunTestDialog agent picker is a SingleSelectPicker whose
// trigger reads the placeholder "Select an agent"; its options render in a
// portal (role="option") with a "Search agents" box.
async function openRunDialogPickAgentAndRun(
  page: Page,
  testName: string,
  agentName: string,
): Promise<void> {
  await page.goto("/tests");
  await waitForOrgReady(page);

  const nameCell = page.getByText(testName, { exact: true }).first();
  await expect(nameCell).toBeVisible({ timeout: 20000 });
  await nameCell
    .locator('xpath=ancestor::div[.//button[@aria-label="Run this test"]][1]')
    .getByRole("button", { name: "Run this test" })
    .click();

  // Scope to the RunTestDialog (its own .fixed.inset-0.z-50 overlay) so the
  // footer "Run test" button never collides with the DOM-present mobile card.
  const runDialog = page
    .locator("div.fixed.inset-0.z-50")
    .filter({ has: page.getByRole("heading", { name: "Run test" }) });
  await expect(runDialog.getByRole("heading", { name: "Run test" })).toBeVisible(
    { timeout: 15000 },
  );

  await runDialog.getByRole("button", { name: "Select an agent" }).click();
  const agentSearch = page.getByPlaceholder("Search agents");
  await expect(agentSearch).toBeVisible({ timeout: 15000 });
  await agentSearch.fill(agentName);
  await page.getByRole("option", { name: agentName }).first().click();

  await runDialog.getByRole("button", { name: "Run test" }).click();
}

test.describe("Verify connection before running tests — LLM Tests page (fake-AI backend)", () => {
  test.beforeEach(() => {
    test.skip(
      !FAKE_AI,
      "requires the backend in FAKE_AI_PROVIDERS mode; set E2E_FAKE_AI=1",
    );
  });

  // Test 1 — the gate fires and, on a real failing check (endpoint is
  // unreachable example.com), shows the failure state's exactly-two buttons.
  test("gates an unverified connection agent and shows the failure state", async ({
    page,
  }) => {
    const agentName = `verify-page agent ${Date.now()}`;
    const testName = `verify-page test ${Date.now()}`;

    await createUnverifiedConnectionAgent(page, agentName);
    await createStandaloneTest(page, testName);

    await openRunDialogPickAgentAndRun(page, testName, agentName);

    // The gate opened VerifyConnectionDialog instead of starting the run.
    await expect(
      page.getByRole("heading", { name: "Verify connection" }),
    ).toBeVisible({ timeout: 15000 });
    // No run started: the run window's Summary tab is absent.
    await expect(
      page.getByRole("button", { name: "Summary", exact: true }),
    ).toHaveCount(0);

    // Run the check against the real backend — example.com is unreachable, so
    // it fails and the dialog switches to its failure state. Scope the Verify
    // click and the failure assertions to the dialog so they never collide.
    const verifyDialog = page.locator("div.fixed.inset-0.z-50").filter({
      has: page.getByRole("heading", { name: "Verify connection" }),
    });
    await verifyDialog.getByRole("button", { name: "Verify" }).click();

    await expect(
      verifyDialog.getByText("Could not reach the agent"),
    ).toBeVisible({
      timeout: 30000,
    });
    // Failure footer has exactly these two buttons (no Cancel).
    await expect(
      verifyDialog.getByRole("button", { name: "Try again" }),
    ).toBeVisible();
    await expect(
      verifyDialog.getByRole("button", { name: "View connection settings" }),
    ).toBeVisible();

    // Clean up.
    await page.keyboard.press("Escape");
    await deleteAgent(page, agentName);
    await deleteTest(page, testName);
  });

  // Test 2 — the pass path. Mock ONLY the verify endpoint to succeed; the run
  // itself is a real FAKE_AI run, so it completes with a 100% summary.
  test("starts the run when the connection verifies", async ({ page }) => {
    const agentName = `verify-page agent ${Date.now()}`;
    const testName = `verify-page test ${Date.now()}`;

    // Mock the whole pass path before anything can trigger it: the verify
    // call, the run start, and the run poll. The backend rejects a run on an
    // unverified connection agent with HTTP 400, so the run itself must be
    // mocked too — otherwise the results never appear. (The attach step
    // POST /agent-tests still hits the real backend; the run-start glob
    // **/agent-tests/agent/*/run does not match it.)
    await page.route("**/agents/*/verify-connection", (route) =>
      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          success: true,
          error: null,
          sample_response: { response: "ok" },
        }),
      }),
    );
    await page.route("**/agent-tests/agent/*/run", (route) =>
      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ task_id: "mock-run-1", status: "pending" }),
      }),
    );
    await page.route("**/agent-tests/run/*", (route) =>
      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(COMPLETED_RUN),
      }),
    );

    await createUnverifiedConnectionAgent(page, agentName);
    await createStandaloneTest(page, testName);

    await openRunDialogPickAgentAndRun(page, testName, agentName);

    await expect(
      page.getByRole("heading", { name: "Verify connection" }),
    ).toBeVisible({ timeout: 15000 });

    // Passing check → dialog closes and the run starts. The run window's
    // Summary tab appears once the mocked run completes; the mocked verdict
    // passes → 100% pass rate. Scope the Verify click to the dialog.
    const verifyDialog = page.locator("div.fixed.inset-0.z-50").filter({
      has: page.getByRole("heading", { name: "Verify connection" }),
    });
    await verifyDialog.getByRole("button", { name: "Verify" }).click();

    await expect(
      page.getByRole("button", { name: "Summary", exact: true }),
    ).toBeVisible({ timeout: 30000 });
    await expect(page.getByText("100%").first()).toBeVisible({
      timeout: 15000,
    });

    // Clean up.
    await page.keyboard.press("Escape");
    await deleteAgent(page, agentName);
    await deleteTest(page, testName);
  });
});
