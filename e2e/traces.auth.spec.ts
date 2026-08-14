// Backend-backed Traces tab on the agent detail page (the tab after Tests,
// `?tab=traces`, rendering `src/components/traces/*`). Traces belong to one
// agent: the customer's backend ingests them with `POST /traces` carrying that
// agent's uuid as `agent_id`, and the tab reads them back scoped to it. There
// is no /traces page and no sidebar entry any more.
// Each test creates its own agent, seeds traces for that agent through the
// ingest endpoint (using the signed-in account's own JWT, the same way a
// customer request would — the UI never ingests), opens the agent's Traces tab
// and drives the list, detail dialog, search, delete, and convert-to-tests.
// The first test also seeds a second agent with a trace matching the same
// search word, and asserts it never shows on the first agent's tab — that is
// what fails if the tab ever stops scoping its reads to one agent.
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

// Remove every trace of one agent through the same bulk-delete endpoint the UI
// uses, so a run never leaves rows against the workspace-wide trace cap.
async function deleteAllTracesOfAgent(
  page: Page,
  headers: Record<string, string>,
  agentUuid: string,
): Promise<void> {
  const res = await page.request.post(`${BACKEND}/traces/bulk-delete`, {
    headers,
    data: { select_all: true, agent_id: agentUuid },
  });
  expect(res.ok()).toBeTruthy();
}

// Switch from the agent detail page to its Traces tab (writes ?tab=traces).
async function openTracesTab(page: Page): Promise<void> {
  await page.getByRole("button", { name: "Traces", exact: true }).click();
  await expect(page).toHaveURL(/tab=traces/);
}

test.describe("Agent Traces tab (authenticated, real backend)", () => {
  test("lists an agent's traces, then detail, search, and delete", async ({
    page,
  }) => {
    const name = `E2E Traces Agent ${Date.now()}`;
    const agentUuid = await createAgent(page, name);
    const headers = await ingestHeaders(page);

    // Seed two traces for this agent, exactly as a customer backend would:
    // the ingest body carries the agent's uuid as `agent_id`.
    const stamp = Date.now();
    const term = `polio${stamp}`;
    const targetMsgId = `e2e-${stamp}-a`;
    await page.request.post(`${BACKEND}/traces`, {
      headers,
      data: {
        agent_id: agentUuid,
        message_id: targetMsgId,
        conversation_id: `e2e-conv-${stamp}`,
        input: [{ role: "user", content: `Tell me about ${term} boosters` }],
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

    // A second agent with a trace matching the very same search word. It must
    // never appear on the first agent's tab: if it does, the tab is listing
    // every trace in the workspace instead of this agent's.
    const otherName = `E2E Traces Other ${stamp}`;
    const otherAgentUuid = await createAgent(page, otherName);
    const otherMsgId = `e2e-${stamp}-other`;
    await page.request.post(`${BACKEND}/traces`, {
      headers,
      data: {
        agent_id: otherAgentUuid,
        message_id: otherMsgId,
        conversation_id: `e2e-conv-other-${stamp}`,
        input: [{ role: "user", content: `Tell me about ${term} boosters` }],
        output: { response: "A different agent's answer." },
      },
    });

    // Back to the first agent's Traces tab.
    await page.goto(`/agents/${agentUuid}`);
    await waitForOrgReady(page);
    await openTracesTab(page);
    // The usage indicator reads a live trace count over the cap. Only the
    // stable end of the sentence is matched, not the whole wording.
    await expect(
      page.getByText(/out of the .* it can hold/).first(),
    ).toBeVisible({ timeout: 15000 });

    // The list is server-paginated and scoped to this agent; search narrows it
    // to the seeded row.
    await page.getByPlaceholder("Search traces").fill(term);
    // The message id renders in both the desktop table and the mobile cards
    // (both in the DOM), so scope to the first match.
    const row = page.getByText(targetMsgId).first();
    await expect(row).toBeVisible({ timeout: 15000 });
    // Same search word, other agent: not listed here.
    await expect(page.getByText(otherMsgId)).toHaveCount(0);

    // Open the detail dialog and confirm it renders the output.
    await row.click();
    const dialog = page.locator(".fixed.inset-0.z-50");
    await expect(
      dialog.getByRole("heading", { name: "Trace", exact: true }),
    ).toBeVisible();
    await expect(
      dialog.getByText("Boosters are due at 16 months."),
    ).toBeVisible();
    await expect(dialog.getByText("Conversation history")).toBeVisible();
    // Close the dialog.
    await dialog.getByRole("button", { name: "Close" }).click();
    await expect(dialog).toBeHidden();

    // Delete the seeded trace via its row trash icon + confirmation.
    await page.getByPlaceholder("Search traces").fill(term);
    await expect(page.getByText(targetMsgId).first()).toBeVisible({
      timeout: 15000,
    });
    await page.getByRole("button", { name: "Delete trace" }).first().click();
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

  test("converts selected traces into response tests on the same agent", async ({
    page,
  }) => {
    const name = `E2E Traces Convert ${Date.now()}`;
    const agentUuid = await createAgent(page, name);
    const headers = await ingestHeaders(page);

    const stamp = Date.now();
    const term = `convert${stamp}`;
    const msgId = `e2e-conv-${stamp}`;
    await page.request.post(`${BACKEND}/traces`, {
      headers,
      data: {
        agent_id: agentUuid,
        message_id: msgId,
        conversation_id: `e2e-conv-grp-${stamp}`,
        input: [{ role: "user", content: `${term} question` }],
        output: { response: "An answer." },
      },
    });

    // Find and select the seeded trace's row checkbox.
    await openTracesTab(page);
    await page.getByPlaceholder("Search traces").fill(term);
    await expect(page.getByText(msgId).first()).toBeVisible({ timeout: 15000 });
    await page.getByRole("button", { name: "Select trace" }).first().click();

    // Open the convert dialog and submit (response type, default evaluator
    // preselected — no evaluator click needed).
    await page.getByRole("button", { name: /Convert to tests/ }).click();
    const dialog = page.locator(".fixed.inset-0.z-50");
    await expect(dialog.getByText("Test type", { exact: true })).toBeVisible();
    // The dialog no longer asks which agents to link: the created tests always
    // belong to the agent whose tab this is.
    await expect(dialog.getByText("Link to agents")).toHaveCount(0);
    await dialog.getByRole("button", { name: "Convert" }).click();

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
