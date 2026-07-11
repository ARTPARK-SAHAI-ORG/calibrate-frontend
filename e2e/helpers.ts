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
