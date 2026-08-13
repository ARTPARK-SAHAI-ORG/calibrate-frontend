// The workspace in the address. Every page behind sign-in sits under the
// workspace it belongs to (`/<workspace-id>/agents`), so a link means one exact
// thing no matter which workspace the reader is sitting in. This spec covers
// the three things that has to do:
//   1. An older address with no workspace in it still opens, and the address
//      the user ends up on names the workspace.
//   2. Moving between sections from the sidebar keeps the same workspace.
//   3. Picking a different workspace in the sidebar switcher changes the
//      workspace in the address and keeps the user in the same section.
//
// Import from ./fixtures so E2E coverage is collected when E2E_COVERAGE=1.
// Run with `npm run test:e2e:integration` (needs a backend, see e2e/README.md).
import { test, expect } from "./fixtures";
import {
  waitForOrgReady,
  workspacePath,
  workspaceUuidFromUrl,
} from "./helpers";

// The workspace the address names. Fails the test when there is none, so the
// caller never has to handle a null.
function activeWorkspace(url: string): string {
  const uuid = workspaceUuidFromUrl(url);
  expect(uuid, `expected a workspace in the address: ${url}`).not.toBeNull();
  return uuid as string;
}

test.describe("Workspace in the address (authenticated, real backend)", () => {
  test("an address with no workspace opens under the signed-in user's workspace", async ({
    page,
  }) => {
    await page.goto("/agents");
    await waitForOrgReady(page);

    // The app forwarded the older address to the same page under the user's
    // workspace, so the workspace is now part of the address.
    await expect(page).toHaveURL(
      new RegExp(
        "^https?://[^/]+/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/agents$",
      ),
      { timeout: 20000 },
    );
    await expect(
      page.getByRole("button", { name: "New agent" }).first(),
    ).toBeVisible({ timeout: 20000 });
  });

  test("the workspace stays the same when moving between sections", async ({
    page,
  }) => {
    await page.goto("/agents");
    await waitForOrgReady(page);
    await expect(page).toHaveURL(workspacePath("/agents"), { timeout: 20000 });
    const workspace = activeWorkspace(page.url());

    // The sidebar nav items are Next.js <Link>s labelled with the section name.
    for (const section of ["Tools", "Evaluators", "Personas"]) {
      await page.getByRole("link", { name: section, exact: true }).click();
      await expect(page).toHaveURL(workspacePath(`/${section.toLowerCase()}`), {
        timeout: 20000,
      });
      expect(activeWorkspace(page.url())).toBe(workspace);
    }
  });

  test("picking another workspace changes the workspace but keeps the section", async ({
    page,
  }) => {
    // Make sure there are at least two workspaces to switch between, and that
    // this test does not depend on what other specs left behind. Creating one
    // from the switcher also makes it the active workspace.
    const name = `E2E URL WS ${Date.now()}`;
    await page.goto("/tools");
    await waitForOrgReady(page);

    const trigger = page.locator('button[aria-haspopup="menu"]').first();
    await expect(trigger).toBeVisible({ timeout: 20000 });
    await trigger.click();
    await page.getByRole("button", { name: "Create workspace" }).click();
    await expect(
      page.getByRole("heading", { name: "Create workspace" }),
    ).toBeVisible();
    await page.getByPlaceholder("e.g. Acme Health").fill(name);
    await page
      .getByRole("button", { name: "Create workspace", exact: true })
      .last()
      .click();

    // The new workspace becomes active, which reloads the section the user was
    // in under it.
    await expect(page).toHaveURL(workspacePath("/tools"), { timeout: 30000 });
    await waitForOrgReady(page);
    const created = activeWorkspace(page.url());

    // Now pick a different workspace from the switcher.
    await expect(trigger).toBeVisible({ timeout: 20000 });
    await trigger.click();
    const menu = page.getByRole("menu");
    await expect(menu.getByText("Workspaces")).toBeVisible({ timeout: 20000 });
    const other = menu
      .locator("ul button")
      .filter({ hasNotText: name })
      .first();
    await expect(other).toBeVisible({ timeout: 20000 });
    await other.click();

    // Same section, different workspace in the address.
    await expect(page).toHaveURL(workspacePath("/tools"), { timeout: 30000 });
    expect(activeWorkspace(page.url())).not.toBe(created);
  });
});
