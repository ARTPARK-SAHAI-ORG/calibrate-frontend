import { expect, type Page } from "@playwright/test";

/**
 * Wait until the OrganizationBootstrapper has resolved an active workspace.
 *
 * On first authenticated load the bootstrapper fetches `/organizations` and
 * stashes the default workspace uuid in localStorage under `activeOrgUuid`.
 * The WorkspaceSwitcher dropdown and the workspace-settings admin/API-keys
 * tabs only render their data once that's set — and in CI (cold Next dev
 * compile) it can take several seconds. Call this after navigating, before
 * interacting with any org-dependent UI, so those steps don't race the boot.
 */
export async function waitForOrgReady(page: Page): Promise<void> {
  await expect
    .poll(
      () => page.evaluate(() => localStorage.getItem("activeOrgUuid")),
      { timeout: 30_000 },
    )
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
