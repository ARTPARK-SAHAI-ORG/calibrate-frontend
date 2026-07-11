// Backend-backed CRUD flows for the simple resource pages: Personas and
// Scenarios. Both use the same slide-in-panel + DeleteConfirmationDialog
// pattern, so one spec covers both. Import from ./fixtures for E2E coverage.
//
// Run with `npm run test:e2e:integration` (needs a backend, see e2e/README.md).
import { test, expect } from "./fixtures";

/**
 * Drives create → verify-in-list → delete for a resource page whose "create"
 * form is a right-side slide-in panel with a single required text field (the
 * label) plus a pre-filled, valid textarea. Personas and Scenarios are
 * structurally identical, so this helper parametrizes the differences.
 */
async function createDeleteResource(
  page: import("@playwright/test").Page,
  {
    path,
    heading,
    addButton,
    labelPlaceholder,
    name,
    deleteHeading,
  }: {
    path: string;
    heading: string;
    addButton: string;
    labelPlaceholder: string;
    name: string;
    deleteHeading: string;
  },
) {
  await page.goto(path);
  await expect(page).toHaveURL(new RegExp(`${path}$`));
  await expect(page.getByRole("heading", { name: heading })).toBeVisible();

  // Open the create panel (header button; may also appear in the empty state).
  await page.getByRole("button", { name: addButton }).first().click();

  // The panel overlay shares the "Add X" button name with the header, so scope
  // all interactions to the panel to avoid ambiguity.
  const panel = page.locator(".fixed.inset-0.z-50");
  await expect(panel.getByPlaceholder(labelPlaceholder)).toBeVisible();
  await panel.getByPlaceholder(labelPlaceholder).fill(name);
  // The description/characteristics textarea comes pre-filled and valid, so a
  // minimal create only needs the label. Submit from within the panel.
  await panel.getByRole("button", { name: addButton }).click();

  // Create resolves → the panel closes and the list is refetched. Wait for the
  // panel to disappear before asserting on the list (the refetch + first
  // compile can take a few seconds).
  await expect(panel).toBeHidden({ timeout: 15000 });

  // The name renders in both the desktop table (a `grid` row) and the mobile
  // card view, so scope to the desktop grid row to get a single element.
  const row = page.locator("div.grid").filter({ hasText: name });
  await expect(row).toBeVisible({ timeout: 15000 });

  // Delete it: the row's only button is the icon-only delete button. Click it,
  // then confirm in the shared DeleteConfirmationDialog.
  await row.getByRole("button").click();
  await expect(page.getByRole("heading", { name: deleteHeading })).toBeVisible();
  await page.getByRole("button", { name: "Delete", exact: true }).click();

  // Row disappears once the backend delete resolves.
  await expect(row).toHaveCount(0, { timeout: 15000 });
}

test.describe("Personas page (authenticated, real backend)", () => {
  test("loads, and creates then deletes a persona", async ({ page }) => {
    await createDeleteResource(page, {
      path: "/personas",
      heading: "Personas",
      addButton: "Add persona",
      labelPlaceholder: "e.g., Rural Farmer - Karnataka",
      name: `E2E Persona ${Date.now()}`,
      deleteHeading: "Delete persona",
    });
  });
});

test.describe("Scenarios page (authenticated, real backend)", () => {
  test("loads, and creates then deletes a scenario", async ({ page }) => {
    await createDeleteResource(page, {
      path: "/scenarios",
      heading: "Scenarios",
      addButton: "Add scenario",
      labelPlaceholder: "e.g., Crop Insurance Inquiry",
      name: `E2E Scenario ${Date.now()}`,
      deleteHeading: "Delete scenario",
    });
  });
});
