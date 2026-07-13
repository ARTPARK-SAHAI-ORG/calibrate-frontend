// Run -> results E2E: trigger a REAL backend run and assert the results UI.
//
// These exercise the run-gated code that no other spec can reach without an AI
// backend: TestRunnerDialog polling + TestRunSummary, EvaluatorVerdictCard,
// test-results/shared, and the Benchmark* / LeaderboardBarChart stack.
//
// They require the backend running in test mode (FAKE_AI_PROVIDERS=1), which
// makes every LLM/judge call return deterministic canned results with NO real
// API keys or cost (see e2e/FAKE_AI_PROVIDERS.md for the backend contract).
// Until that backend support lands + CI sets E2E_FAKE_AI=1, every test here is
// SKIPPED, so the spec is inert in the current suite.
//
// The canned contract these assertions rely on: every test/evaluator PASSES,
// so a completed run shows a 100% pass rate and "Pass" verdicts.
//
// Run locally against a fake-AI backend with:
//   E2E_FAKE_AI=1 NEXT_PUBLIC_BACKEND_URL=http://localhost:8001 \
//     npx playwright test --project=authenticated runs.auth
import { test, expect } from "./fixtures";
import { waitForOrgReady } from "./helpers";
import type { Page } from "@playwright/test";

const FAKE_AI = process.env.E2E_FAKE_AI === "1";

// Create a Build agent through the "New agent" dialog and land on its detail
// page. Mirrors e2e/agent-detail.auth.spec.ts createAgent (kept local so the
// two specs stay independent).
async function createBuildAgent(page: Page, name: string): Promise<void> {
  await page.goto("/agents");
  await waitForOrgReady(page);

  const dialogHeading = page.getByRole("heading", { name: "New agent" });
  const createBtn = page.getByRole("button", { name: "Create", exact: true });

  // The dialog's access token comes from a hook effect, so the very first
  // create can race auth readiness and 401 (which closes the dialog). Retry the
  // whole open → fill → create each iteration so a failed attempt re-opens the
  // dialog and tries again once the token has hydrated.
  await expect(async () => {
    if (!(await dialogHeading.isVisible().catch(() => false))) {
      await page.getByRole("button", { name: "New agent" }).first().click();
      await expect(dialogHeading).toBeVisible({ timeout: 5000 });
      await page.getByPlaceholder("Enter agent name").fill(name);
    }
    await createBtn.click();
    await expect(page).toHaveURL(/\/agents\/[0-9a-f-]{36}/, { timeout: 5000 });
  }).toPass({ timeout: 30000 });
}

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
// next-reply test attached to this agent. Mirrors the proven create flow in
// tests.auth.spec.ts ("creates a next-reply test through the editor"): the
// editor opens pre-seeded with a user/agent/user conversation + the default
// Correctness evaluator, so a valid create only needs every seeded message
// filled and the evaluator criteria set.
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
  // agent yet, so TestsTabContent reliably pops an "Update default evaluators?"
  // prompt. Wait for it and dismiss ("Not now") — it otherwise overlays the
  // Run/Compare buttons. (isVisible() doesn't wait, so assert-then-click.)
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

test.describe("Run -> results (authenticated, fake-AI backend)", () => {
  test.beforeEach(() => {
    test.skip(
      !FAKE_AI,
      "requires the backend in FAKE_AI_PROVIDERS mode; set E2E_FAKE_AI=1",
    );
  });

  test("runs an agent's tests and shows a passing summary", async ({ page }) => {
    const agentName = `E2E Run Agent ${Date.now()}`;
    const testName = `E2E Run Test ${Date.now()}`;

    await createBuildAgent(page, agentName);
    await createNextReplyTestOnAgent(page, testName);

    // Trigger the run from the Tests tab. "Run all tests" opens TestRunnerDialog
    // and starts the run (POST /agent-tests/agent/{uuid}/run), then polls
    // GET /agent-tests/run/{taskId} every 3s until the status is terminal.
    await page.getByRole("button", { name: /Run all/ }).click();

    // Results tabs (Summary / Outputs) render ONLY once runStatus === "done".
    // Fake backend completes near-instantly; allow for the POST + first poll.
    await expect(
      page.getByRole("button", { name: "Summary", exact: true }),
    ).toBeVisible({ timeout: 30000 });

    // Summary tab: a Pass rate card. Every fake verdict passes → 100% pass rate
    // (asserted on the percentage, which is robust to the test-case count).
    await expect(page.getByText("Pass rate").first()).toBeVisible({
      timeout: 15000,
    });
    await expect(page.getByText("100%").first()).toBeVisible({ timeout: 15000 });

    // Outputs tab: the per-test results group the passing test under a
    // "Passed (n)" heading (test-results/shared StatusIcon + grouping).
    await page.getByRole("button", { name: "Outputs", exact: true }).click();
    await expect(page.getByText(/Passed \(\d+\)/).first()).toBeVisible({
      timeout: 15000,
    });

    // Close the dialog and clean up.
    await page.keyboard.press("Escape");
    await deleteAgent(page, agentName);
  });

  test("benchmarks an agent across models and shows a leaderboard", async ({
    page,
  }) => {
    const agentName = `E2E Bench Agent ${Date.now()}`;
    const testName = `E2E Bench Test ${Date.now()}`;

    await createBuildAgent(page, agentName);
    await createNextReplyTestOnAgent(page, testName);

    // "Compare models" opens BenchmarkDialog. It starts with one empty model
    // slot (selectedModels=[null]) and "Run comparison" is disabled until a
    // model is picked. Click the empty slot ("Select a model") to open the
    // shared LLMSelectorModal, then choose the first model in the list.
    await page.getByRole("button", { name: /Compare models/ }).click();
    await page
      .getByRole("button", { name: "Select a model" })
      .first()
      .click();
    // The selector modal is the innermost overlay containing the "Search LLM"
    // box (the outer BenchmarkDialog is also .fixed, so take the last match).
    // Its model rows are full-width buttons wrapping the model name.
    const searchBox = page.getByPlaceholder("Search LLM");
    await expect(searchBox).toBeVisible({ timeout: 15000 });
    const modelModal = page.locator(".fixed").filter({ has: searchBox }).last();

    // Benchmarking a Build agent picks from the OpenRouter model catalog. The
    // FAKE_AI backend fakes run EXECUTION but not the model-catalog endpoint, so
    // in that deployment the picker is empty ("OpenRouter models are not
    // supported"). Skip when there's nothing to select — this test activates
    // once the fake backend also serves a model catalog.
    const modelRows = modelModal.locator("button.w-full");
    await page.waitForTimeout(1500);
    const modelCount = await modelRows.count();
    test.skip(
      modelCount === 0,
      "no benchmark model catalog in the FAKE_AI deployment",
    );
    await modelRows.first().click();

    // A model is selected → "Run comparison" is enabled. Run the benchmark.
    await page.getByRole("button", { name: "Run comparison" }).click();

    // BenchmarkResultsDialog polls GET /agent-tests/benchmark/{taskId}; the
    // Leaderboard / Outputs tabs render only once the run is done.
    await expect(
      page.getByRole("button", { name: "Leaderboard", exact: true }),
    ).toBeVisible({ timeout: 30000 });

    // The leaderboard renders a table (model rows + pass-rate columns).
    await expect(page.locator("table").first()).toBeVisible({
      timeout: 15000,
    });

    await page.keyboard.press("Escape");
    await deleteAgent(page, agentName);
  });
});
