// The chat link on the agent page: make it public, open the chat page (it
// needs no sign-in), send a message, rate the reply.
// Needs the backend in test mode (`FAKE_AI_PROVIDERS=1`), where every agent
// answers "Simulated agent reply.". Run with `npm run test:e2e:integration`.
// Import from ./fixtures so E2E coverage is collected when E2E_COVERAGE=1.
import { test, expect } from "./fixtures";
import { createAgent } from "./helpers";
import type { Page } from "@playwright/test";

const BACKEND = process.env.NEXT_PUBLIC_BACKEND_URL ?? "http://localhost:8000";
const FAKE_AI = process.env.E2E_FAKE_AI === "1";

async function authHeaders(page: Page): Promise<Record<string, string>> {
  const auth = await page.evaluate(() => ({
    token: localStorage.getItem("access_token"),
    org: localStorage.getItem("activeOrgUuid"),
  }));
  const headers: Record<string, string> = {
    Authorization: `Bearer ${auth.token}`,
  };
  if (auth.org) headers["X-Org-UUID"] = auth.org;
  return headers;
}

test.describe("Agent chat link (authenticated, real backend)", () => {
  test.skip(!FAKE_AI, "needs the backend in test mode (E2E_FAKE_AI=1)");

  test("turns the link on, chats with the agent and rates a reply", async ({
    page,
  }) => {
    const name = `E2E Chat Agent ${Date.now()}`;
    const agentUuid = await createAgent(page, name);
    const headers = await authHeaders(page);

    const probe = await page.request.get(
      `${BACKEND}/agents/${agentUuid}/chat-link`,
      { headers },
    );
    test.skip(
      probe.status() === 404,
      "the backend has no chat link yet (calibrate-backend#306)",
    );

    try {
      await page.getByRole("button", { name: "Share", exact: true }).click();
      await expect(
        page.getByRole("button", { name: "Copy link" }),
      ).toBeVisible();
      await expect(page.getByRole("link", { name: "Preview" })).toBeVisible();

      const link = await page.request.get(
        `${BACKEND}/agents/${agentUuid}/chat-link`,
        { headers },
      );
      const { is_public, share_token } = await link.json();
      expect(is_public).toBe(true);

      await page.goto(`/public/chat/${share_token}`);
      await expect(page.getByText(`Talk to ${name}`)).toBeVisible();
      await expect(page).toHaveTitle(`${name} chat`);

      await page.getByLabel("Message").fill("When is the next dose due?");
      await page.keyboard.press("Enter");
      await expect(page.getByText("Simulated agent reply.")).toBeVisible({
        timeout: 30000,
      });

      await page.getByRole("button", { name: "Bad reply" }).click();
      await page
        .getByLabel("What was wrong with this reply? (optional)")
        .fill("It did not answer the question");
      await page.getByRole("button", { name: "Save", exact: true }).click();
      await expect(
        page.getByLabel("What was wrong with this reply? (optional)"),
      ).toHaveCount(0);
      await expect(
        page.getByRole("button", { name: "Good reply" }),
      ).toHaveCount(0);

      // The rating and comment are stored on the trace the reply made.
      const traces = await page.request.get(
        `${BACKEND}/traces?agent_id=${agentUuid}&limit=10&offset=0`,
        { headers },
      );
      const [trace] = (await traces.json()).items;
      expect(trace.feedback).toMatchObject({
        is_correct: false,
        comment: "It did not answer the question",
      });
    } finally {
      await page.request.delete(`${BACKEND}/agents/${agentUuid}`, { headers });
    }
  });

  // ponytail: the Monitoring tab has no feedback filter on this branch yet
  // (it lands with #808 and the Monitoring pull request). Fill this in then.
  test.fixme("finds the rated trace under Filter by feedback in Monitoring", () => {});
});
