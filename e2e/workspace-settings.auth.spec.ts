// Backend-backed workspace-settings flows: rename the workspace (Admin tab),
// create + revoke an API key (API keys tab), and create a new workspace via the
// sidebar switcher. Exercises useOrganizations, useWorkspaceApiKeys,
// CreateApiKeyDialog, CreateWorkspaceDialog, and the settings tab layout. Run
// with `npm run test:e2e:integration`.
import { test, expect } from "./fixtures";
import { openWorkspaceSettings, waitForOrgReady } from "./helpers";

test.describe("Workspace settings (authenticated, real backend)", () => {
  test("renames the active workspace on the Admin tab", async ({ page }) => {
    await openWorkspaceSettings(page, "Admin");

    // The Admin "Name" input is pre-filled with the current name; Save enables
    // once it differs. It's the only textbox on the tab.
    const nameInput = page.getByRole("textbox").first();
    await expect(nameInput).toBeVisible({ timeout: 15000 });
    await nameInput.fill(`E2E WS ${Date.now()}`);
    await page.getByRole("button", { name: "Save", exact: true }).click();

    // Success surfaces a confirmation toast.
    await expect(page.getByText("Workspace name updated")).toBeVisible({
      timeout: 15000,
    });
  });

  test("creates then revokes a workspace API key", async ({ page }) => {
    const keyName = `E2E Key ${Date.now()}`;
    await openWorkspaceSettings(page, "API keys");

    await page.getByRole("button", { name: "Create key" }).first().click();
    await expect(
      page.getByRole("heading", { name: "Create API key" }),
    ).toBeVisible();
    await page.getByPlaceholder("e.g. GitHub Actions").fill(keyName);
    await page
      .getByRole("button", { name: "Create key", exact: true })
      .last()
      .click();

    // Phase 2: the plaintext key is revealed once. Close the dialog.
    await expect(
      page.getByRole("heading", { name: "API key created" }),
    ).toBeVisible({ timeout: 15000 });
    await page.getByRole("button", { name: "Done" }).click();

    // The key is now listed by name; revoke it.
    const row = page.locator("div.grid, tr").filter({ hasText: keyName });
    await expect(row.first()).toBeVisible({ timeout: 15000 });
    await row.getByRole("button", { name: "Revoke" }).first().click();
    // Confirm in the dialog. Scope to the dialog so we don't also match the
    // row's own "Revoke" button behind it.
    const dialog = page.locator(".fixed.inset-0.z-50");
    await expect(
      dialog.getByRole("heading", { name: "Revoke API key" }),
    ).toBeVisible();
    await dialog.getByRole("button", { name: "Revoke", exact: true }).click();
  });

  test("creates a new workspace from the sidebar switcher", async ({
    page,
  }) => {
    await page.goto("/agents");
    await waitForOrgReady(page);
    await page.locator('button[aria-haspopup="menu"]').first().click();
    await expect(page.getByText("Workspaces")).toBeVisible({ timeout: 15000 });

    await page.getByRole("button", { name: "Create workspace" }).click();
    await expect(
      page.getByRole("heading", { name: "Create workspace" }),
    ).toBeVisible();
    await page.getByPlaceholder("e.g. Acme Health").fill(`E2E New WS ${Date.now()}`);
    await page
      .getByRole("button", { name: "Create workspace", exact: true })
      .last()
      .click();

    // Creating a workspace closes the dialog (the switcher then reflects it).
    await expect(
      page.getByRole("heading", { name: "Create workspace" }),
    ).toBeHidden({ timeout: 15000 });
  });
});
