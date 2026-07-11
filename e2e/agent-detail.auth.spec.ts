// Backend-backed agent lifecycle: create a Build agent (name-only → redirect to
// its detail page), click through the detail tabs, then delete it from the
// list. Exercises NewAgentDialog, the /agents/[uuid] tabbed detail (AgentDetail
// with its Tools / Data extraction / Tests / Settings tab content), and agent
// deletion. Run with `npm run test:e2e:integration`.
import { test, expect } from "./fixtures";

test.describe("Agent detail (authenticated, real backend)", () => {
  test("creates a Build agent, navigates its tabs, then deletes it", async ({
    page,
  }) => {
    const name = `E2E Agent ${Date.now()}`;

    await page.goto("/agents");
    // Let the OrganizationBootstrapper finish fetching /organizations so the
    // X-Org-UUID header is set before we create (creating too early races it).
    await page.waitForLoadState("networkidle");
    await page.getByRole("button", { name: "New agent" }).first().click();
    await expect(
      page.getByRole("heading", { name: "New agent" }),
    ).toBeVisible();

    // Only the name is required; the default "Build your agent" setup needs no
    // URL. Create and land on the detail page.
    await page.getByPlaceholder("Enter agent name").fill(name);
    await page.getByRole("button", { name: "Create", exact: true }).click();
    await expect(page).toHaveURL(/\/agents\/[0-9a-f-]{36}/, { timeout: 15000 });

    // Build agents expose these tabs; each updates ?tab= and mounts its own
    // content component. Click through them to exercise that code.
    for (const tab of ["Tools", "Data extraction", "Tests", "Settings"]) {
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
