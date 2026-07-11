// Backend-backed agent lifecycle: create a Build agent (name-only → redirect to
// its detail page), click through the detail tabs, then delete it from the
// list. Exercises NewAgentDialog, the /agents/[uuid] tabbed detail (AgentDetail
// with its Tools / Tests / Settings tab content), and agent
// deletion. Run with `npm run test:e2e:integration`.
import { test, expect } from "./fixtures";
import { waitForOrgReady } from "./helpers";

test.describe("Agent detail (authenticated, real backend)", () => {
  test("creates a Build agent, navigates its tabs, then deletes it", async ({
    page,
  }) => {
    const name = `E2E Agent ${Date.now()}`;

    await page.goto("/agents");
    // Wait for the OrganizationBootstrapper to resolve the active org so the
    // X-Org-UUID header is set before we create (creating too early races it).
    await waitForOrgReady(page);
    await page.getByRole("button", { name: "New agent" }).first().click();
    await expect(
      page.getByRole("heading", { name: "New agent" }),
    ).toBeVisible();

    // Only the name is required; the default "Build your agent" setup needs no
    // URL. Create and land on the detail page.
    await page.getByPlaceholder("Enter agent name").fill(name);
    // The dialog's token comes from a hook effect, so the very first create can
    // race auth readiness and 401 (which creates nothing and leaves the dialog
    // open). Retry the click until it navigates — a failed create is a no-op.
    const createBtn = page.getByRole("button", { name: "Create", exact: true });
    await expect(async () => {
      if (await createBtn.isVisible().catch(() => false)) {
        await createBtn.click();
      }
      await expect(page).toHaveURL(/\/agents\/[0-9a-f-]{36}/, { timeout: 6000 });
    }).toPass({ timeout: 30000 });

    // Build agents expose these tabs; each updates ?tab= and mounts its own
    // content component. Click through them to exercise that code.
    // Data extraction tab is temporarily hidden (extraction UI removed for now).
    for (const tab of ["Tools", "Tests", "Settings"]) {
      await page.getByRole("button", { name: tab, exact: true }).click();
      await expect(page).toHaveURL(
        new RegExp(`tab=${tab.toLowerCase().replace(" ", "[-_]?")}`),
      );
    }

    // Clean up: delete the agent from the list via its titled delete button.
    await page.goto("/agents");
    const row = page.locator("div.grid").filter({ hasText: name });
    await expect(row).toBeVisible({ timeout: 15000 });
    await row.getByRole("button", { name: "Delete agent" }).click();
    await expect(
      page.getByRole("heading", { name: "Delete agent" }),
    ).toBeVisible();
    await page.getByRole("button", { name: "Delete", exact: true }).click();
    await expect(row).toHaveCount(0, { timeout: 15000 });
  });
});
