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

    // Step 2: create sidebar. The async default-prompt call prefills the Name,
    // judge model, and judge prompt (all required). Wait for it to land FIRST —
    // it also overwrites the Name field, so setting our unique name before the
    // prefill would get clobbered (and clicking Create before the model is set
    // just flags validation without creating). The model button reads "Select
    // judge model" until the prefill resolves.
    await expect(
      page.getByRole("heading", { name: "Add evaluator" }),
    ).toBeVisible();
    await expect(page.getByText("Select judge model")).toHaveCount(0, {
      timeout: 20000,
    });

    // Now override the prefilled name with a unique one and create.
    await page.getByPlaceholder("e.g., Follows Refund Policy").fill(name);
    await page.getByRole("button", { name: "Create evaluator" }).click();

    // The new evaluator card appears on the "My evaluators" tab.
    const card = page.getByRole("link", { name: `Open ${name}` });
    await expect(card).toBeVisible({ timeout: 20000 });

    // Open the evaluator detail / versioning page (its own route, otherwise
    // never exercised by E2E), confirm it loaded, then return to the list to
    // delete. The heading renders the evaluator's name once the fetch resolves.
    await card.click();
    await expect(page).toHaveURL(/\/evaluators\/[0-9a-f-]+$/, {
      timeout: 20000,
    });
    await expect(
      page.getByRole("button", { name: "Back to evaluators" }).first(),
    ).toBeVisible({ timeout: 20000 });
    await expect(page.getByText(name).first()).toBeVisible({ timeout: 20000 });

    await page.goto("/evaluators");
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
