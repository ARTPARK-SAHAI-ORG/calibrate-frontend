// Backend-backed Evaluators flow: create an evaluator then delete it. The
// create is two steps — a use-case picker, then a sidebar whose Name / judge
// model / judge prompt are prefilled by GET /evaluators/default-prompt. We pick
// the "Speech to Text" use case, which needs no per-variable descriptions, and
// only override the Name to keep reruns unique. Run with
// `npm run test:e2e:integration`.
import { test, expect } from "./fixtures";

test.describe("Evaluators page (authenticated, real backend)", () => {
  test("loads, creates an evaluator, then deletes it", async ({ page }) => {
    const name = `E2E Eval ${Date.now()}`;

    await page.goto("/evaluators");
    await expect(
      page.getByRole("heading", { name: "Evaluators" }),
    ).toBeVisible();

    // Step 1: use-case picker. Scope to the picker dialog — "Speech to Text"
    // also matches a "Filter by purpose" <option> on the page behind it.
    await page.getByRole("button", { name: "Add evaluator" }).first().click();
    const picker = page.locator(".fixed.inset-0.z-50");
    await expect(
      picker.getByRole("heading", { name: "What is this evaluator for?" }),
    ).toBeVisible();
    await picker.getByText("Speech to Text", { exact: true }).click();
    await picker.getByRole("button", { name: "Continue" }).click();

    // Step 2: create sidebar. Judge model + prompt are prefilled by the backend
    // default-prompt call; wait for the sidebar, then set a unique Name.
    await expect(
      page.getByRole("heading", { name: "Add evaluator" }),
    ).toBeVisible();
    const nameInput = page.getByPlaceholder("e.g., Follows Refund Policy");
    await expect(nameInput).toBeVisible();
    await nameInput.fill(name);

    await page.getByRole("button", { name: "Create evaluator" }).click();

    // The new evaluator card appears on the "My evaluators" tab.
    const card = page.getByRole("link", { name: `Open ${name}` });
    await expect(card).toBeVisible({ timeout: 20000 });

    // Delete via the card's titled delete button + confirmation dialog.
    await page
      .locator(`[aria-label="Open ${name}"]`)
      .locator("xpath=ancestor::*[.//button[@title='Delete evaluator']][1]")
      .getByRole("button", { name: "Delete evaluator" })
      .click();
    await expect(
      page.getByRole("heading", { name: "Delete evaluator" }),
    ).toBeVisible();
    await page.getByRole("button", { name: "Delete", exact: true }).click();
    await expect(card).toHaveCount(0, { timeout: 15000 });
  });
});
