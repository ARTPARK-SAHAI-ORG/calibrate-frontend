// Backend-backed CRUD for the Human alignment page (`/human-alignment`) and its
// CreateLabellingTaskDialog. Two flows:
//   1. Create a labelling task through the 3-step dialog (Details → Type →
//      Evaluators), then delete it from the Tasks tab.
//   2. Add an annotator, rename it, then remove it from the Annotators tab.
// This page reads/writes under the active workspace (X-Org-UUID), so every
// navigation is followed by waitForOrgReady. Import from ./fixtures for E2E
// coverage. Run with `npm run test:e2e:integration` (needs a backend).
import { test, expect } from "./fixtures";
import { waitForOrgReady } from "./helpers";

test.describe("Human alignment page (authenticated, real backend)", () => {
  test("creates a labelling task via the dialog, then deletes it", async ({
    page,
  }) => {
    const name = `E2E Task ${Date.now()}`;

    // Land directly on the Tasks tab (a real tab value, so the page won't
    // auto-switch away from an empty Overview).
    await page.goto("/human-alignment?tab=tasks");
    await waitForOrgReady(page);
    await expect(
      page.getByRole("heading", { name: "Human alignment" }),
    ).toBeVisible({ timeout: 20000 });

    // Open the create dialog. The header button is always present; on an empty
    // Tasks tab the empty-state action shares the same label, so scope to the
    // first match.
    await page
      .getByRole("button", { name: "Create new labelling task" })
      .first()
      .click();

    const dialog = page.locator(".fixed.inset-0.z-50");
    await expect(
      dialog.getByRole("heading", { name: "Create labelling task" }),
    ).toBeVisible({ timeout: 20000 });

    // Step 1 — Details. Only Name is required (placeholder uses an em dash, so
    // match a substring). Then advance.
    await dialog.getByPlaceholder("Copilot review").fill(name);
    await dialog.getByRole("button", { name: "Next", exact: true }).click();

    // Step 2 — Type. Pick "LLM reply" (llm); its accessible name won't collide
    // with "LLM output". Then advance.
    await dialog.getByRole("button", { name: "LLM reply" }).click();
    await dialog.getByRole("button", { name: "Next", exact: true }).click();

    // Step 3 — Evaluators. The dialog fetches /evaluators?include_defaults=true
    // and filters to the chosen type; the built-in llm correctness default
    // means at least one checkbox should appear. Select the first, then create.
    const firstEvaluator = dialog.locator('input[type="checkbox"]').first();
    await expect(firstEvaluator).toBeVisible({ timeout: 20000 });
    await firstEvaluator.check();
    await dialog.getByRole("button", { name: "Create task" }).click();

    // On success onCreated() navigates to the new task's detail route.
    await expect(page).toHaveURL(/\/human-alignment\/tasks\/[0-9a-f-]+/, {
      timeout: 20000,
    });

    // Back to the Tasks list to verify + delete. The row exposes a titled
    // delete button (aria-label `Delete <name>`) in both desktop and mobile
    // layouts, so scope to the first match.
    await page.goto("/human-alignment?tab=tasks");
    await waitForOrgReady(page);

    const deleteTaskBtn = page
      .getByRole("button", { name: `Delete ${name}` })
      .first();
    await expect(deleteTaskBtn).toBeVisible({ timeout: 20000 });
    await deleteTaskBtn.click();

    // Confirm in the shared DeleteConfirmationDialog (title → heading,
    // confirmText → button).
    await expect(
      page.getByRole("heading", { name: "Delete labelling task" }),
    ).toBeVisible({ timeout: 15000 });
    await page.getByRole("button", { name: "Delete", exact: true }).click();

    await expect(
      page.getByRole("button", { name: `Delete ${name}` }),
    ).toHaveCount(0, { timeout: 15000 });
  });

  test("adds an annotator, renames it, then removes it", async ({ page }) => {
    const stamp = Date.now();
    const name = `E2E Annotator ${stamp}`;
    const editedName = `${name} (edited)`;

    await page.goto("/human-alignment?tab=annotators");
    await waitForOrgReady(page);
    await expect(
      page.getByRole("heading", { name: "Human alignment" }),
    ).toBeVisible({ timeout: 20000 });

    // Add annotator via the inline form (input placeholder "Annotator name" +
    // "Add" submit button).
    await page.getByPlaceholder("Annotator name").fill(name);
    await page.getByRole("button", { name: "Add", exact: true }).click();

    // The new annotator appears in the list; its per-row rename button carries
    // the name in its aria-label (desktop + mobile, so scope to first).
    const renameBtn = page
      .getByRole("button", { name: `Rename ${name}` })
      .first();
    await expect(renameBtn).toBeVisible({ timeout: 20000 });

    // Rename: clicking rename swaps the name cell for an autofocused input.
    await renameBtn.click();
    const editInput = page.locator("input:focus");
    await expect(editInput).toBeVisible({ timeout: 15000 });
    await editInput.fill(editedName);
    await page.getByRole("button", { name: "Save name" }).first().click();

    // The edited name now drives the remove button's aria-label.
    const removeBtn = page
      .getByRole("button", { name: `Remove ${editedName}` })
      .first();
    await expect(removeBtn).toBeVisible({ timeout: 20000 });
    await removeBtn.click();

    // Confirm removal (title "Remove annotator" → heading, confirmText
    // "Remove" → button).
    await expect(
      page.getByRole("heading", { name: "Remove annotator" }),
    ).toBeVisible({ timeout: 15000 });
    await page.getByRole("button", { name: "Remove", exact: true }).click();

    await expect(
      page.getByRole("button", { name: `Remove ${editedName}` }),
    ).toHaveCount(0, { timeout: 15000 });
  });
});
