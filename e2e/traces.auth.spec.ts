// Backend-backed Traces tab on the agent detail page (the tab after Tests,
// `?tab=traces`, rendering `src/components/traces/*`). Traces belong to one
// agent: the customer's backend ingests them with `POST /traces` carrying that
// agent's uuid as `agent_id`, and the tab reads them back scoped to it. There
// is no /traces page and no sidebar entry any more.
// The tab is a plain paged list with no search box, so each test creates its
// own agent, seeds a couple of traces for it through the ingest endpoint (using
// the signed-in account's own JWT, the same way a customer request would — the
// UI never ingests), then reads the rows straight off the first page and drives
// the detail dialog, the row delete, and adding traces to tests.
// The first test also seeds a second agent with its own trace and asserts it
// never shows on the first agent's tab — that is what fails if the tab ever
// stops scoping its reads to one agent.
// Every seeded trace is removed at the end (traces count against a
// workspace-wide cap, so leftovers pile up across runs).
// Run with `npm run test:e2e:integration`.
import { test, expect } from "./fixtures";
import { waitForOrgReady, workspacePath } from "./helpers";
import type { Page } from "@playwright/test";

const BACKEND = process.env.NEXT_PUBLIC_BACKEND_URL ?? "http://localhost:8000";

// Create a Build agent through the "New agent" dialog, land on its detail page
// and return its uuid (traces are seeded against it). Same create-retry as
// agent-detail.auth.spec.ts: the dialog's token comes from a hook effect, so
// the very first create can race auth readiness and 401 (a no-op that leaves
// the dialog open) — retry the click until we navigate to the detail URL.
async function createAgent(page: Page, name: string): Promise<string> {
  await page.goto("/agents");
  await waitForOrgReady(page);
  await page.getByRole("button", { name: "New agent" }).first().click();
  await expect(
    page.getByRole("heading", { name: "New agent", exact: true }),
  ).toBeVisible();
  await page.getByPlaceholder("Enter agent name").fill(name);

  const createBtn = page.getByRole("button", { name: "Create", exact: true });
  await expect(async () => {
    if (await createBtn.isVisible().catch(() => false)) {
      await createBtn.click();
    }
    await expect(page).toHaveURL(workspacePath(/\/agents\/[0-9a-f-]{36}/), {
      timeout: 6000,
    });
  }).toPass({ timeout: 30000 });

  const uuid = page.url().match(/\/agents\/([0-9a-f-]{36})/)?.[1];
  expect(uuid).toBeTruthy();
  return uuid as string;
}

// Delete an agent from the /agents list via its titled delete button.
async function deleteAgent(page: Page, name: string): Promise<void> {
  await page.goto("/agents");
  await waitForOrgReady(page);
  const row = page.locator("div.grid").filter({ hasText: name });
  await expect(row).toBeVisible({ timeout: 15000 });
  await row.getByRole("button", { name: "Delete agent" }).click();
  await expect(
    page.getByRole("heading", { name: "Delete agent", exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Delete", exact: true }).click();
  await expect(row).toHaveCount(0, { timeout: 15000 });
}

// The signed-in session's own auth headers, for raw ingest calls.
async function ingestHeaders(page: Page): Promise<Record<string, string>> {
  const auth = await page.evaluate(() => ({
    token: localStorage.getItem("access_token"),
    org: localStorage.getItem("activeOrgUuid"),
  }));
  expect(auth.token).toBeTruthy();
  const headers: Record<string, string> = {
    Authorization: `Bearer ${auth.token}`,
    "Content-Type": "application/json",
  };
  if (auth.org) headers["X-Org-UUID"] = auth.org;
  return headers;
}

// Remove every trace of one agent, so a run never leaves rows against the
// workspace-wide trace cap. Bulk delete takes explicit ids only, so read the
// agent's traces first. Each test seeds a handful, well inside one page.
async function deleteAllTracesOfAgent(
  page: Page,
  headers: Record<string, string>,
  agentUuid: string,
): Promise<void> {
  const listed = await page.request.get(
    `${BACKEND}/traces?agent_id=${agentUuid}&limit=200&offset=0`,
    { headers },
  );
  expect(listed.ok()).toBeTruthy();
  const ids = ((await listed.json()).items ?? []).map(
    (trace: { uuid: string }) => trace.uuid,
  );
  if (ids.length === 0) return;
  const deleted = await page.request.post(`${BACKEND}/traces/bulk-delete`, {
    headers,
    data: { trace_ids: ids },
  });
  expect(deleted.ok()).toBeTruthy();
}

// Switch from the agent detail page to its Traces tab (writes ?tab=traces).
async function openTracesTab(page: Page): Promise<void> {
  await page.getByRole("button", { name: "Traces", exact: true }).click();
  await expect(page).toHaveURL(/tab=traces/);
}

test.describe("Agent Traces tab (authenticated, real backend)", () => {
  test("lists an agent's traces, then opens one and deletes it", async ({
    page,
  }) => {
    const name = `E2E Traces Agent ${Date.now()}`;
    const agentUuid = await createAgent(page, name);
    const headers = await ingestHeaders(page);

    // Seed two traces for this agent, exactly as a customer backend would:
    // the ingest body carries the agent's uuid as `agent_id`.
    const stamp = Date.now();
    const targetMsgId = `e2e-${stamp}-a`;
    await page.request.post(`${BACKEND}/traces`, {
      headers,
      data: {
        agent_id: agentUuid,
        message_id: targetMsgId,
        conversation_id: `e2e-conv-${stamp}`,
        input: [{ role: "user", content: "Tell me about booster doses" }],
        output: { response: "Boosters are due at 16 months." },
        metadata: [{ key: "env", value: "e2e" }],
      },
    });
    await page.request.post(`${BACKEND}/traces`, {
      headers,
      data: {
        agent_id: agentUuid,
        message_id: `e2e-${stamp}-b`,
        conversation_id: `e2e-conv-${stamp}`,
        input: [{ role: "user", content: "unrelated question" }],
        output: { tool_calls: [{ tool: "lookup", arguments: {} }] },
      },
    });

    // A second agent with its own trace. It must never appear on the first
    // agent's tab: if it does, the tab is listing every trace in the workspace
    // instead of this agent's.
    const otherName = `E2E Traces Other ${stamp}`;
    const otherAgentUuid = await createAgent(page, otherName);
    const otherMsgId = `e2e-${stamp}-other`;
    await page.request.post(`${BACKEND}/traces`, {
      headers,
      data: {
        agent_id: otherAgentUuid,
        message_id: otherMsgId,
        conversation_id: `e2e-conv-other-${stamp}`,
        input: [{ role: "user", content: "Tell me about booster doses" }],
        output: { response: "A different agent's answer." },
      },
    });

    // Back to the first agent's Traces tab.
    await page.goto(`/agents/${agentUuid}`);
    await waitForOrgReady(page);
    await openTracesTab(page);

    // The agent was created for this run, so both seeded traces are on the
    // first page. The message id renders in both the desktop table and the
    // mobile cards (both in the DOM), so scope to the first match.
    const row = page.getByText(targetMsgId).first();
    await expect(row).toBeVisible({ timeout: 15000 });
    await expect(page.getByText(`e2e-${stamp}-b`).first()).toBeVisible();
    // The other agent's trace is not listed here.
    await expect(page.getByText(otherMsgId)).toHaveCount(0);

    // Open the detail dialog and confirm it renders the output. The dialog is
    // titled with the last thing the caller said, not the word "Trace".
    await row.click();
    const dialog = page.locator(".fixed.inset-0.z-50");
    await expect(
      dialog.getByRole("heading", {
        name: "Tell me about booster doses",
        exact: true,
      }),
    ).toBeVisible();
    await expect(
      dialog.getByText("Boosters are due at 16 months."),
    ).toBeVisible();
    // The details underneath name the trace, its conversation, and the
    // metadata the customer sent with it.
    await expect(dialog.getByText(`e2e-conv-${stamp}`)).toBeVisible();
    await expect(dialog.getByText("env")).toBeVisible();
    // Close the dialog.
    await dialog.getByRole("button", { name: "Close" }).click();
    await expect(dialog).toBeHidden();

    // Delete that same trace via its own row's trash icon + confirmation.
    // Without search the page holds more than one row, so pick the row by the
    // message id rather than taking the first trash icon on the page.
    await page
      .locator("div.grid")
      .filter({ hasText: targetMsgId })
      .getByRole("button", { name: "Delete trace" })
      .first()
      .click();
    await expect(
      page.getByRole("heading", { name: /Delete this trace\?/ }),
    ).toBeVisible();
    await page.getByRole("button", { name: "Delete", exact: true }).click();
    await expect(page.getByText(targetMsgId)).toHaveCount(0, {
      timeout: 15000,
    });

    // Remove the traces the UI delete left behind (the second seeded trace of
    // this agent, and the other agent's one), then both agents.
    await deleteAllTracesOfAgent(page, headers, agentUuid);
    await deleteAllTracesOfAgent(page, headers, otherAgentUuid);
    await deleteAgent(page, name);
    await deleteAgent(page, otherName);
  });

  test("adds a selected trace to tests on the same agent", async ({ page }) => {
    const name = `E2E Traces Convert ${Date.now()}`;
    const agentUuid = await createAgent(page, name);
    const headers = await ingestHeaders(page);

    const stamp = Date.now();
    const msgId = `e2e-convert-${stamp}`;
    await page.request.post(`${BACKEND}/traces`, {
      headers,
      data: {
        agent_id: agentUuid,
        message_id: msgId,
        conversation_id: `e2e-conv-grp-${stamp}`,
        input: [{ role: "user", content: "A question worth testing." }],
        output: { response: "An answer." },
      },
    });

    // The agent has exactly one trace, so it is the only row on the page.
    await openTracesTab(page);
    await expect(page.getByText(msgId).first()).toBeVisible({ timeout: 15000 });
    await page.getByRole("button", { name: "Select trace" }).first().click();

    // Open the add-to-tests dialog and submit. The agent is new so it has no
    // evaluators of its own, and the built-in reply evaluator asks for a
    // criteria value, which puts it out of reach here. So nothing starts
    // ticked and the first evaluator on offer has to be picked by hand.
    await page.getByRole("button", { name: /^Add to tests \(/ }).click();
    const dialog = page.locator(".fixed.inset-0.z-50");
    await expect(
      dialog.getByRole("heading", { name: /Add 1 trace to tests/ }),
    ).toBeVisible();
    const submit = dialog.getByRole("button", {
      name: "Add to tests",
      exact: true,
    });
    // Wait for the evaluators to arrive before reading the button, otherwise
    // it is only disabled because the list is still loading.
    const firstEvaluator = dialog.getByRole("checkbox").first();
    await expect(firstEvaluator).toBeVisible({ timeout: 15000 });
    if (!(await submit.isEnabled())) await firstEvaluator.check();
    // The dialog no longer asks which agents to link: the created tests always
    // belong to the agent whose tab this is.
    await expect(dialog.getByText("Link to agents")).toHaveCount(0);
    await submit.click();

    // Success toast with a link to the tests page.
    await expect(page.getByText(/Created \d+ test/)).toBeVisible({
      timeout: 15000,
    });

    // The converted test is linked to this agent, so it shows on its Tests tab
    // under the trace's message id.
    await page.goto(`/agents/${agentUuid}?tab=tests`);
    await waitForOrgReady(page);
    await page.getByPlaceholder("Search tests").first().fill(msgId);
    await expect(page.getByText(msgId).first()).toBeVisible({ timeout: 15000 });

    await deleteAllTracesOfAgent(page, headers, agentUuid);
    await deleteAgent(page, name);
  });
});
