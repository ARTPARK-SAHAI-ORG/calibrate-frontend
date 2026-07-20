// Verify-before-run gate on the agent Tests tab (connection agents).
//
// A connection agent whose endpoint has not been verified must NOT start a run
// when a Run control is clicked — it opens VerifyConnectionDialog first. In the
// dialog the user clicks Verify: on a passing endpoint check the dialog closes
// and the run starts; on a failing check the dialog shows the error plus a
// "Try again" and a "View connection settings" button (no Cancel).
//
// Test 1 uses a real, deterministic FAILURE: a public-but-not-an-agent URL
// (https://example.com/agent) passes the backend's SSRF guard but is not a real
// agent, so the outbound verify call fails every time.
// Test 2 mocks ONLY the verify endpoint to pass, then asserts the held run
// starts and completes against the fake-AI backend (100% pass rate).
//
// Both require the backend in FAKE_AI_PROVIDERS mode; run via
//   npm run test:e2e:integration  (sets E2E_FAKE_AI=1)
// otherwise every test here is SKIPPED.
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

// Create a Connection agent through the "New agent" dialog and land on its
// detail page (which defaults to the Connection tab). Mirrors
// agent-detail.auth.spec.ts createAgent(kind="connection") — kept local per the
// repo convention that specs copy helpers rather than share them.
async function createConnectionAgent(page: Page, name: string): Promise<void> {
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
      // "Connect your existing agent" switches the kind to connection.
      await page.getByText("Connect your existing agent").click();
    }
    if (await createBtn.isVisible().catch(() => false)) {
      await createBtn.click();
    }
    await expect(page).toHaveURL(/\/agents\/[0-9a-f-]{36}/, { timeout: 6000 });
  }).toPass({ timeout: 45000 });
}

// On the connection agent's Connection tab, set its endpoint URL. The tab has
// no explicit Save button for the URL: AgentDetail debounce-auto-saves on
// change, so fill then give the debounce (~800ms) time to persist before we
// leave the tab / trigger a run that reads the saved agent_url + unverified
// flag. Mirrors agent-detail.auth.spec.ts.
async function setConnectionUrl(page: Page, url: string): Promise<void> {
  const urlInput = page.getByPlaceholder(
    "https://your-agent.example.com/chat",
  );
  await expect(urlInput).toBeVisible({ timeout: 15000 });
  await urlInput.fill(url);
  await page.waitForTimeout(1500);
}

// Delete an agent from the /agents list via its titled delete button.
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

// From an agent's detail page, open the Tests tab and create a minimal
// next-reply test attached to this agent. Mirrors runs.auth.spec.ts.
async function createNextReplyTestOnAgent(
  page: Page,
  testName: string,
): Promise<void> {
  await page.getByRole("button", { name: "Tests", exact: true }).click();
  await expect(page).toHaveURL(/tab=tests/);

  await page.getByRole("button", { name: "Create test", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Create a test" }),
  ).toBeVisible({ timeout: 15000 });
  await page.getByText("Next reply test", { exact: true }).first().click();

  const nameInput = page.getByPlaceholder(/Your .* name/i).first();
  await expect(nameInput).toBeVisible({ timeout: 15000 });
  await nameInput.fill(testName);

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

  // The new test seeds the default Correctness evaluator, which isn't on the
  // agent yet, so TestsTabContent pops an "Update default evaluators?" prompt.
  // Dismiss it — it otherwise overlays the Run/Compare buttons.
  const evalPrompt = page.getByRole("heading", {
    name: "Update default evaluators?",
  });
  await expect(evalPrompt).toBeVisible({ timeout: 15000 });
  await page.getByRole("button", { name: "Not now" }).click();
  await expect(evalPrompt).toBeHidden({ timeout: 10000 });

  // Success signal: the new test appears in the Tests-tab list.
  await expect(page.getByText(testName, { exact: true }).first()).toBeVisible({
    timeout: 20000,
  });
}

test.describe("Verify connection before running tests — agent Tests tab (fake-AI backend)", () => {
  test.beforeEach(() => {
    test.skip(
      !FAKE_AI,
      "requires the backend in FAKE_AI_PROVIDERS mode; set E2E_FAKE_AI=1",
    );
  });

  // Gate + fail path: real backend, no mock. The Run control opens the verify
  // dialog instead of starting a run; a real verify against a non-agent URL
  // fails and shows the two failure actions.
  test("blocks the run and shows the failure state when the endpoint is not a real agent", async ({
    page,
  }) => {
    const name = `verify-tab ${Date.now()}`;
    const testName = `verify-tab test ${Date.now()}`;

    await createConnectionAgent(page, name);
    await setConnectionUrl(page, "https://example.com/agent");
    await createNextReplyTestOnAgent(page, testName);

    // Click Run all — for an unverified connection agent this opens the verify
    // dialog rather than starting a run.
    await page.getByRole("button", { name: /Run all/ }).click();

    await expect(
      page.getByRole("heading", { name: "Verify connection" }),
    ).toBeVisible({ timeout: 15000 });
    // No run started — the results Summary tab is not present.
    await expect(
      page.getByRole("button", { name: "Summary", exact: true }),
    ).toHaveCount(0);

    // Scope Verify clicks / dialog assertions to the dialog box: the agent
    // detail page has its own "Verify" button in the header.
    const verifyDialog = page.locator("div.fixed.inset-0.z-50").filter({
      has: page.getByRole("heading", { name: "Verify connection" }),
    });

    // Run the endpoint check. The real outbound verify call takes a few seconds.
    await verifyDialog.getByRole("button", { name: "Verify" }).click();

    await expect(
      verifyDialog.getByText("Could not reach the agent"),
    ).toBeVisible({
      timeout: 30000,
    });
    await expect(
      verifyDialog.getByRole("button", { name: "Try again" }),
    ).toBeVisible();
    await expect(
      verifyDialog.getByRole("button", { name: "View connection settings" }),
    ).toBeVisible();

    await page.keyboard.press("Escape");
    await deleteAgent(page, name);
  });

  // Pass path: mock ONLY the verify endpoint to succeed, then let the held run
  // start and complete for real against the fake-AI backend.
  test("starts and completes the run once the endpoint verifies", async ({
    page,
  }) => {
    const name = `verify-tab pass ${Date.now()}`;
    const testName = `verify-tab pass test ${Date.now()}`;

    // Mock the verify call and the whole run (start + poll) before anything
    // triggers them: the backend rejects a run on an unverified connection
    // agent with HTTP 400, so mocking only the verify call is not enough.
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

    await createConnectionAgent(page, name);
    await setConnectionUrl(page, "https://example.com/agent");
    await createNextReplyTestOnAgent(page, testName);

    await page.getByRole("button", { name: /Run all/ }).click();

    await expect(
      page.getByRole("heading", { name: "Verify connection" }),
    ).toBeVisible({ timeout: 15000 });
    // Scope the Verify click to the dialog box: the agent detail page has its
    // own "Verify" button in the header.
    const verifyDialog = page.locator("div.fixed.inset-0.z-50").filter({
      has: page.getByRole("heading", { name: "Verify connection" }),
    });
    await verifyDialog.getByRole("button", { name: "Verify" }).click();

    // Verify passes → the dialog closes and the run starts and completes. The
    // results Summary tab renders only once the run is done (fake backend is
    // near-instant; allow for the POST + first poll). Every fake verdict passes
    // → 100% pass rate.
    await expect(
      page.getByRole("button", { name: "Summary", exact: true }),
    ).toBeVisible({ timeout: 30000 });
    await expect(page.getByText("100%").first()).toBeVisible({
      timeout: 15000,
    });

    await page.keyboard.press("Escape");
    await deleteAgent(page, name);
  });
});
