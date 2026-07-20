// Backend-backed Traces flow (`src/app/traces/page.tsx`). The Traces UI is
// read + curate only — production turns are ingested by the customer's backend
// via `POST /traces`, so this spec seeds a couple of traces through that
// endpoint (using the signed-in account's own JWT, the same way a browser
// request would) and then drives the list, detail dialog, search, and delete.
// Run with `npm run test:e2e:integration`.
import { test, expect } from "./fixtures";

const BACKEND = process.env.NEXT_PUBLIC_BACKEND_URL ?? "http://localhost:8000";

test.describe("Traces page (authenticated, real backend)", () => {
  test("empty state, then ingest, list, detail, search, and delete", async ({
    page,
  }) => {
    await page.goto("/traces");
    await expect(page.getByRole("heading", { name: "Traces" })).toBeVisible();
    // The usage indicator reads the live count over the workspace cap.
    await expect(page.getByText(/\/ .* traces stored/)).toBeVisible({
      timeout: 15000,
    });

    // Seed two traces via POST /traces with the session's own token, exactly
    // as a customer backend would (the UI never ingests).
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

    const stamp = Date.now();
    const term = `polio${stamp}`;
    const targetMsgId = `e2e-${stamp}-a`;
    await page.request.post(`${BACKEND}/traces`, {
      headers,
      data: {
        message_id: targetMsgId,
        conversation_id: `e2e-conv-${stamp}`,
        input: [
          { role: "user", content: `Tell me about ${term} boosters` },
        ],
        output: { response: "Boosters are due at 16 months." },
        metadata: [{ key: "env", value: "e2e" }],
      },
    });
    await page.request.post(`${BACKEND}/traces`, {
      headers,
      data: {
        message_id: `e2e-${stamp}-b`,
        conversation_id: `e2e-conv-${stamp}`,
        input: [{ role: "user", content: "unrelated question" }],
        output: { tool_calls: [{ tool: "lookup", arguments: {} }] },
      },
    });

    // The list is server-paginated; search narrows it to the seeded row.
    await page.reload();
    await page.getByPlaceholder("Search traces").fill(term);
    // The message id renders in both the desktop table and the mobile cards
    // (both in the DOM), so scope to the first match.
    const row = page.getByText(targetMsgId).first();
    await expect(row).toBeVisible({ timeout: 15000 });

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
  });
});
