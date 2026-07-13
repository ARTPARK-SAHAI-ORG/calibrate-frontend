// Backend-backed coverage for the /tests page's two large create surfaces:
// the AddTestDialog (two-phase: type picker → full editor) and the
// BulkUploadTestsModal. Both are heavy components that are ~unexercised by
// other specs, so simply MOUNTING them lights up hundreds of lines. We stop
// short of completing a create (a real create needs an agent + evaluators and
// a full conversation history) — a green test that mounts the dialogs is the
// high-value, low-flake win here. Import from ./fixtures for E2E coverage.
//
// Run with `npm run test:e2e:integration` (needs a backend, see e2e/README.md).
import { test, expect } from "./fixtures";

test.describe("Tests page (authenticated, real backend)", () => {
  test("opens the Create test dialog through to the editor, then closes", async ({
    page,
  }) => {
    const name = `E2E Test ${Date.now()}`;

    await page.goto("/tests");
    // Page header from src/app/tests/page.tsx (<h1>LLM Tests</h1>).
    await expect(
      page.getByRole("heading", { name: "LLM Tests" }),
    ).toBeVisible({ timeout: 20000 });

    // "Create test" appears either top-right (when tests exist) or inside the
    // empty-state placeholder card — both carry the same label, so .first().
    await page
      .getByRole("button", { name: "Create test" })
      .first()
      .click();

    // Phase 1: the two-phase create flow opens on a centred type picker.
    // Heading "Create a test" + label "Select the type of test" are from the
    // intro block in AddTestDialog.tsx (~line 2935).
    await expect(
      page.getByRole("heading", { name: "Create a test" }),
    ).toBeVisible({ timeout: 20000 });
    await expect(page.getByText("Select the type of test")).toBeVisible();

    // Pick the "Next reply test" card (TEST_TYPE_OPTIONS[0].title) to animate
    // into the full editor. This mounts the bulk of AddTestDialog.
    await page.getByRole("button", { name: "Next reply test" }).click();

    // Phase 2: the editor. The next-reply/evaluator tab renders a "Test name"
    // label + input with placeholder "Your test name" (AddTestDialog.tsx
    // ~line 3096-3103). Assert it mounted, then fill the trivially-fillable
    // name field.
    const nameInput = page.getByPlaceholder("Your test name");
    await expect(nameInput).toBeVisible({ timeout: 20000 });
    await nameInput.fill(name);
    await expect(nameInput).toHaveValue(name);

    // Close via the editor footer's "Back" button — it calls onClose directly
    // (no discard-changes guard), which unmounts the dialog.
    await page.getByRole("button", { name: "Back", exact: true }).click();
    await expect(nameInput).toHaveCount(0, { timeout: 15000 });
  });

  test("opens the Bulk upload modal, then closes", async ({ page }) => {
    await page.goto("/tests");
    await expect(
      page.getByRole("heading", { name: "LLM Tests" }),
    ).toBeVisible({ timeout: 20000 });

    // "Bulk upload" appears top-right or in the empty-state card — .first().
    await page
      .getByRole("button", { name: "Bulk upload" })
      .first()
      .click();

    // Heading "Bulk upload tests" + the "Select the type of test" label are
    // from BulkUploadTestsModal.tsx (~line 1298, ~1332).
    await expect(
      page.getByRole("heading", { name: "Bulk upload tests" }),
    ).toBeVisible({ timeout: 20000 });
    await expect(page.getByText("Select the type of test")).toBeVisible();

    // Close via the modal's "Cancel" button (backdrop is intentionally
    // non-dismissing here).
    await page.getByRole("button", { name: "Cancel", exact: true }).click();
    await expect(
      page.getByRole("heading", { name: "Bulk upload tests" }),
    ).toHaveCount(0, { timeout: 15000 });
  });
});
