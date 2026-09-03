import { expect, type Page } from "@playwright/test";

/** A workspace id is always a uuid. */
const WORKSPACE_SEGMENT =
  "[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}";

/**
 * Build a URL matcher that accepts the address with or without the workspace.
 *
 * Every page behind sign-in now sits under the workspace it belongs to
 * (`/<workspace-id>/agents`). Opening the older address without it still works:
 * the app forwards it to the same page under the signed-in user's workspace. So
 * an assertion has to pass either way.
 *
 * Pass a plain path ("/agents") and it is matched literally, special characters
 * and all. Pass a regular expression when part of the path varies, such as an
 * id; write it without ^ or $, which are added here. A query string or a #part
 * after the path is allowed; anything else is not.
 */
export function workspacePath(path: string | RegExp): RegExp {
  const body =
    typeof path === "string"
      ? path.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
      : path.source;
  return new RegExp(`^https?://[^/]+/${WORKSPACE_SEGMENT}${body}(?:[?#].*)?$`);
}

/** The workspace id the address names, or null when it names none. */
export function workspaceUuidFromUrl(url: string): string | null {
  const first = new URL(url).pathname.split("/")[1] ?? "";
  return new RegExp(`^${WORKSPACE_SEGMENT}$`).test(first) ? first : null;
}

/**
 * Wait until the address names a workspace.
 *
 * Opening a page without one shows the opening screen in its place, which reads
 * the sign-in token, fetches the workspace list and only then moves to the same
 * page under that workspace. In CI, with the dev server compiling each route on
 * first hit, that whole chain can take several seconds. Call this straight
 * after a goto that leaves the workspace out, before asserting on anything the
 * page renders.
 */
export async function waitForOrgReady(page: Page): Promise<void> {
  await expect
    .poll(() => workspaceUuidFromUrl(page.url()), { timeout: 30_000 })
    .not.toBeNull();
}

/**
 * Open /workspace-settings with its tab content resolved.
 *
 * The whole tab layout (side tabs + the active tab's form) is gated on the page
 * resolving the active org *object* from `useOrganizations`. On a cold-compiled
 * first navigation in CI that render can lose the race with the org bootstrap
 * and get stuck on "No active workspace selected". Once `activeOrgUuid` is
 * persisted, a reload resolves it deterministically — so we give the first load
 * a fair chance and reload once if the tabs haven't appeared. Selecting a
 * non-default tab (e.g. "API keys") is done after the layout is up.
 */
export async function openWorkspaceSettings(
  page: Page,
  tab: "Admin" | "API keys" = "Admin",
): Promise<void> {
  await page.goto("/workspace-settings");
  await waitForOrgReady(page);

  const adminTab = page.getByRole("button", { name: "Admin", exact: true });
  try {
    await expect(adminTab).toBeVisible({ timeout: 12_000 });
  } catch {
    await page.reload();
    await waitForOrgReady(page);
    await expect(adminTab).toBeVisible({ timeout: 30_000 });
  }

  if (tab !== "Admin") {
    await page.getByRole("button", { name: tab, exact: true }).click();
  }
}

/**
 * Pick a test type in the "Create a test" dialog and move on to the editor.
 *
 * Choosing a type is two steps: click the card on the left, then click "Next"
 * in the footer. Both are found by the attributes on the markup rather than by
 * the words on screen, so rewording the cards does not break every spec that
 * creates a test.
 */
export async function chooseTestType(
  page: Page,
  type: "next-reply" | "tool-invocation" | "conversation" = "next-reply",
): Promise<void> {
  await page
    .locator(`[data-tour="test-type-options-list"] [data-test-type="${type}"]`)
    .click();
  await page.locator('[data-tour="test-type-next"]').click();
}

/**
 * Create an agent through the "New agent" dialog and land on its detail page.
 *
 * Creating an agent is two steps: name it (and say whether it is built here or
 * connected from outside), then say what it does. Both steps are found by the
 * attributes on the markup rather than by the words on screen.
 *
 * The dialog's access token comes from a hook effect, so the very first create
 * in a run can race auth readiness and quietly do nothing. The whole open, fill
 * and create is retried until the address changes to the agent's own page, so a
 * failed attempt re-opens the dialog and tries again once the token has landed.
 *
 * Returns the new agent's id.
 */
export async function createAgent(
  page: Page,
  name: string,
  kind: "build" | "connection" = "build",
): Promise<string> {
  await page.goto("/agents");
  await waitForOrgReady(page);

  const heading = page.getByRole("heading", { name: "New agent", exact: true });
  const createBtn = page.getByRole("button", { name: "Create", exact: true });

  await expect(async () => {
    if (!(await heading.isVisible().catch(() => false))) {
      await page.getByRole("button", { name: "New agent" }).first().click();
      await expect(heading).toBeVisible({ timeout: 5000 });
      await page.getByPlaceholder("Enter agent name").fill(name);
      // The dialog opens on "connect an existing agent", so a build agent
      // needs its option picked.
      await page
        .locator(
          `[data-agent-kind="${kind === "connection" ? "connection" : "agent"}"]`,
        )
        .click();
      await page.locator('[data-tour="agent-next-submit"]').click();
      // Every spec here exercises conversation-shaped flows.
      await page.locator('[data-tour="agent-nature-conversation"]').click();
    }
    if (await createBtn.isVisible().catch(() => false)) {
      await createBtn.click();
    }
    await expect(page).toHaveURL(workspacePath(/\/agents\/[0-9a-f-]{36}/), {
      timeout: 6000,
    });
  }).toPass({ timeout: 45000 });

  const uuid = page.url().match(/\/agents\/([0-9a-f-]{36})/)?.[1];
  expect(uuid).toBeTruthy();
  return uuid as string;
}
