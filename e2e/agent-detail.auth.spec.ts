// Backend-backed agent lifecycle. Three tests, each creates its own agent so
// they never depend on pre-existing data:
//   1. Build agent: create (name-only → redirect to its detail page), click
//      through the detail tabs, then delete it from the list.
//   2. Build agent (deep): exercise the Evaluators tab (AddEvaluatorsDialog +
//      attach-if-available) and the Tests tab (open the Create-test flow so
//      TestsTabContent's open/seed code runs), then delete it.
//   3. Connection agent: pick the Connect setup, land on its detail page,
//      exercise AgentConnectionTabContent (URL, benchmark toggle, tool-calls
//      toggle), walk its Connection/Evaluators/Tests/Settings tabs, delete it.
// Exercises NewAgentDialog, the /agents/[uuid] tabbed detail (AgentDetail with
// its Tools / Tests / Evaluators / Settings / Connection tab content), and
// agent deletion. Run with `npm run test:e2e:integration`.
import { test, expect } from "./fixtures";
import { waitForOrgReady } from "./helpers";
import type { Page } from "@playwright/test";

// Create an agent through the "New agent" dialog and land on its detail page.
// `kind` selects the setup radio: "build" (default, name-only) or "connection"
// (the Connect option, whose config seeds an empty agent_url server-side).
// Mirrors the create-retry pattern the original test used: the dialog's token
// comes from a hook effect, so the very first create can race auth readiness
// and 401 (a no-op that leaves the dialog open) — retry the click until we
// navigate to the detail URL.
async function createAgent(
  page: Page,
  name: string,
  kind: "build" | "connection" = "build",
): Promise<void> {
  await page.goto("/agents");
  await waitForOrgReady(page);
  await page.getByRole("button", { name: "New agent" }).first().click();
  await expect(page.getByRole("heading", { name: "New agent" })).toBeVisible();

  await page.getByPlaceholder("Enter agent name").fill(name);
  if (kind === "connection") {
    // Setup picker: the "Connect your existing agent" option box switches the
    // agent kind to "connection" (Agents.tsx: onClick setAgentKind("connection")).
    await page.getByText("Connect your existing agent").click();
  }

  const createBtn = page.getByRole("button", { name: "Create", exact: true });
  await expect(async () => {
    if (await createBtn.isVisible().catch(() => false)) {
      await createBtn.click();
    }
    await expect(page).toHaveURL(/\/agents\/[0-9a-f-]{36}/, { timeout: 6000 });
  }).toPass({ timeout: 30000 });
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

test.describe("Agent detail (authenticated, real backend)", () => {
  test("creates a Build agent, navigates its tabs, then deletes it", async ({
    page,
  }) => {
    const name = `E2E Agent ${Date.now()}`;

    await createAgent(page, name, "build");

    // Build agents expose these tabs; each updates ?tab= and mounts its own
    // content component. Click through them to exercise that code.
    // Data extraction tab is temporarily hidden (extraction UI removed for now).
    for (const tab of ["Tools", "Tests", "Settings"]) {
      await page.getByRole("button", { name: tab, exact: true }).click();
      await expect(page).toHaveURL(
        new RegExp(`tab=${tab.toLowerCase().replace(" ", "[-_]?")}`),
      );
    }

    await deleteAgent(page, name);
  });

  test("deepens a Build agent's Evaluators and Tests tabs, then deletes it", async ({
    page,
  }) => {
    const name = `E2E Agent Deep ${Date.now()}`;

    await createAgent(page, name, "build");

    // --- Evaluators tab (EvaluatorsTabContent) -----------------------------
    await page.getByRole("button", { name: "Evaluators", exact: true }).click();
    await expect(page).toHaveURL(/tab=evaluators/);

    // Open the AddEvaluatorsDialog (searchable checkbox picker). The trigger
    // button reads "Add evaluators" in both the header (when evaluators are
    // already attached) and the empty state — exactly one is mounted at a time.
    await page
      .getByRole("button", { name: "Add evaluators", exact: true })
      .click();
    // Assert the dialog mounted (heading + search box).
    await expect(
      page.getByRole("heading", { name: "Add evaluators" }),
    ).toBeVisible({ timeout: 15000 });
    const evalSearch = page.getByPlaceholder("Search evaluators");
    await expect(evalSearch).toBeVisible();

    // If the workspace has library evaluators available to attach, tick the
    // first and add it; then confirm an attached card (with its "Remove"
    // action) is present. Otherwise just close the dialog — either path
    // still executes the dialog + attach code. (Full vs. open-only depends
    // on whether the seeded account has any library evaluators.)
    const evalCheckboxes = page.locator(
      '.fixed.z-50 input[type="checkbox"]',
    );
    const evalCount = await evalCheckboxes.count();
    if (evalCount > 0) {
      await evalCheckboxes.first().check();
      // Footer add button reads "Add (N)" once a selection is made.
      await page.getByRole("button", { name: /^Add \(/ }).click();
      // Dialog closes on success; an attached evaluator card exposes "Remove".
      await expect(
        page.getByRole("heading", { name: "Add evaluators" }),
      ).toHaveCount(0, { timeout: 15000 });
      await expect(
        page.getByRole("button", { name: "Remove" }).first(),
      ).toBeVisible({ timeout: 15000 });
    } else {
      await page.getByRole("button", { name: "Cancel", exact: true }).click();
      await expect(
        page.getByRole("heading", { name: "Add evaluators" }),
      ).toHaveCount(0, { timeout: 15000 });
    }

    // --- Tests tab (TestsTabContent) ---------------------------------------
    await page.getByRole("button", { name: "Tests", exact: true }).click();
    await expect(page).toHaveURL(/tab=tests/);

    // Open the Create-test flow from within the agent Tests tab. This mounts
    // AddTestDialog with the agent's evaluator context (agentEvaluatorUuids),
    // which is the TestsTabContent open/seed code we want to run. The "Create
    // test" button appears in both the empty state and the populated header.
    await page
      .getByRole("button", { name: "Create test", exact: true })
      .click();
    // Intro picker heading confirms the dialog mounted with the agent context.
    await expect(
      page.getByRole("heading", { name: "Create a test" }),
    ).toBeVisible({ timeout: 15000 });
    // Choose a type to run the seeding effect (agent evaluators seed the new
    // test). The intro box title is "Next reply test".
    await page.getByText("Next reply test", { exact: true }).first().click();
    // Editor mounted: it shows a name input placeholder like "Your test name".
    await expect(
      page.getByPlaceholder(/Your .* name/i).first(),
    ).toBeVisible({ timeout: 15000 });

    // Navigating away to the list unmounts the dialog cleanly (avoids the
    // "Discard changes?" guard) and lets us delete the agent.
    await deleteAgent(page, name);
  });

  test("creates a Connection agent, exercises its Connection tab, then deletes it", async ({
    page,
  }) => {
    const name = `E2E Conn Agent ${Date.now()}`;

    await createAgent(page, name, "connection");

    // Connection agents default to the Connection tab (AgentDetail sets
    // activeTab="connection" for type === "connection").
    // The Agent URL input carries this placeholder (AgentConnectionTabContent).
    const urlInput = page.getByPlaceholder(
      "https://your-agent.example.com/chat",
    );
    await expect(urlInput).toBeVisible({ timeout: 15000 });

    // Fill the required agent_url. For an initially-unverified connection
    // agent this triggers the debounced auto-save in AgentDetail.
    await urlInput.fill("https://example.com/agent");

    // Toggle the "Does your agent return tool calls?" switch — local UI state
    // that re-renders the expected-format docs (no config change, so no
    // unsaved-changes guard). It's the only role="switch" in this tab.
    await page.getByRole("switch").click();

    // Toggle "Support benchmarking different models" (a plain unlabeled toggle
    // button that sits as the next sibling of its label). This reveals the
    // provider picker and exercises handleBenchmarkToggle.
    await page
      .getByText("Support benchmarking different models")
      .locator("xpath=./following-sibling::button")
      .click();
    // The model-provider select appears once benchmarking is on.
    await expect(page.getByRole("combobox").first()).toBeVisible({
      timeout: 15000,
    });

    // Give the debounced auto-save (~800ms) time to persist the benchmark
    // config so savedBenchmarkProvider is updated before we leave the tab —
    // otherwise leaving the Connection tab with a changed benchmark_provider
    // pops the "Unsaved changes" dialog. We handle that dialog defensively in
    // switchConnectionTab below regardless.
    await page.waitForTimeout(1500);

    // Walk the connection agent's tabs (Connection / Evaluators / Tests /
    // Settings). Each asserts the ?tab= URL updates and its content renders.
    async function switchConnectionTab(label: string, tabParam: string) {
      await page.getByRole("button", { name: label, exact: true }).click();
      // If the benchmark-provider unsaved-changes guard fired, save & proceed.
      const unsaved = page.getByRole("heading", { name: "Unsaved changes" });
      if (await unsaved.isVisible().catch(() => false)) {
        await page.getByRole("button", { name: "Save", exact: true }).click();
      }
      await expect(page).toHaveURL(new RegExp(`tab=${tabParam}`));
    }

    await switchConnectionTab("Evaluators", "evaluators");
    await expect(
      page.getByRole("button", { name: "Add evaluators", exact: true }),
    ).toBeVisible({ timeout: 15000 });

    await switchConnectionTab("Tests", "tests");
    await switchConnectionTab("Settings", "settings");
    await switchConnectionTab("Connection", "connection");

    await deleteAgent(page, name);
  });
});
