// Backend-backed Evaluators flow: create an evaluator then delete it. The
// create is two steps — a use-case picker, then a sidebar whose Name / judge
// model / judge prompt are prefilled by GET /evaluators/default-prompt. We pick
// the "Speech to Text" use case, which needs no per-variable descriptions, and
// only override the Name to keep reruns unique. Run with
// `npm run test:e2e:integration`.
import { test, expect } from "./fixtures";
import { waitForOrgReady, workspacePath } from "./helpers";
import type { Page } from "@playwright/test";

// Shared create flow: run the two-step "Speech to Text" wizard and land on the
// "My evaluators" list with a card for `name`. Mirrors the standalone create
// test below (see its inline comments for why each wait is needed). Returns the
// card locator so callers can open or delete it.
async function createEvaluator(page: Page, name: string) {
  await page.goto("/evaluators");
  await waitForOrgReady(page);
  await expect(
    page.getByRole("heading", { name: "Evaluators", exact: true }),
  ).toBeVisible();

  await page.getByRole("button", { name: "Add evaluator" }).first().click();
  const picker = page.locator(".fixed.inset-0.z-50");
  await expect(
    picker.getByRole("heading", {
      name: "What is this evaluator for?",
      exact: true,
    }),
  ).toBeVisible();
  await picker.getByText("Speech to Text", { exact: true }).click();
  await picker.getByRole("button", { name: "Continue" }).click();

  await expect(
    page.getByRole("heading", { name: "Add evaluator", exact: true }),
  ).toBeVisible();
  // Wait for the async default-prompt prefill (it clobbers the Name field, so
  // set our unique name only after it lands; also gates a real create).
  await expect(page.getByText("Select judge model")).toHaveCount(0, {
    timeout: 20000,
  });

  await page.getByPlaceholder("e.g., Follows Refund Policy").fill(name);
  await page.getByRole("button", { name: "Create evaluator" }).click();

  const card = page.getByRole("link", { name: `Open ${name}` });
  await expect(card).toBeVisible({ timeout: 20000 });
  return card;
}

// Delete `name` from the "My evaluators" list via the card's titled delete
// button + confirmation dialog.
async function deleteEvaluator(page: Page, name: string) {
  const card = page.getByRole("link", { name: `Open ${name}` });
  await page.goto("/evaluators");
  await waitForOrgReady(page);
  await expect(card).toBeVisible({ timeout: 20000 });
  await page
    .locator(`[aria-label="Open ${name}"]`)
    .locator("xpath=ancestor::*[.//button[@title='Delete evaluator']][1]")
    .getByRole("button", { name: "Delete evaluator" })
    .click();
  await expect(
    page.getByRole("heading", { name: "Delete evaluator", exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Delete", exact: true }).click();
  await expect(card).toHaveCount(0, { timeout: 15000 });
}

test.describe("Evaluators page (authenticated, real backend)", () => {
  test("loads, creates an evaluator, then deletes it", async ({ page }) => {
    const name = `E2E Eval ${Date.now()}`;

    await page.goto("/evaluators");
    await waitForOrgReady(page);
    await expect(
      page.getByRole("heading", { name: "Evaluators", exact: true }),
    ).toBeVisible();

    // Step 1: use-case picker. Scope to the picker dialog — "Speech to Text"
    // also matches a "Filter by purpose" <option> on the page behind it.
    await page.getByRole("button", { name: "Add evaluator" }).first().click();
    const picker = page.locator(".fixed.inset-0.z-50");
    await expect(
      picker.getByRole("heading", {
        name: "What is this evaluator for?",
        exact: true,
      }),
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
      page.getByRole("heading", { name: "Add evaluator", exact: true }),
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
    // never exercised by E2E), confirm it loaded, then delete it from the
    // detail page's header delete button (confirmDelete), which navigates
    // back to the list. The heading renders the evaluator's name once the
    // fetch resolves.
    await card.click();
    await expect(page).toHaveURL(workspacePath(/\/evaluators\/[0-9a-f-]+/), {
      timeout: 20000,
    });
    await expect(
      page.getByRole("link", { name: "Evaluators" }).first(),
    ).toBeVisible({ timeout: 20000 });
    await expect(page.getByText(name).first()).toBeVisible({ timeout: 20000 });

    await page.getByRole("button", { name: "Delete evaluator" }).click();
    await expect(
      page.getByRole("heading", { name: "Delete evaluator", exact: true }),
    ).toBeVisible();
    await page.getByRole("button", { name: "Delete", exact: true }).click();

    // Deleting sends the reader back to the list, where the card is gone.
    await expect(page).toHaveURL(workspacePath("/evaluators"), {
      timeout: 20000,
    });
    await waitForOrgReady(page);
    await expect(card).toHaveCount(0, { timeout: 15000 });
  });

  // Exercises the detail page's versioning feature — the bulk of that route's
  // logic (openNewVersionDialog / createNewVersion / setVersionLive). Creates
  // an owned evaluator, adds a NON-live v2, then promotes it via "Mark as
  // current". Self-contained: creates and deletes its own evaluator.
  test("creates a new evaluator version and sets it live", async ({ page }) => {
    const name = `E2E Eval Ver ${Date.now()}`;

    const card = await createEvaluator(page, name);

    // Open the detail / versioning page and confirm it loaded.
    await card.click();
    await expect(page).toHaveURL(workspacePath(/\/evaluators\/[0-9a-f-]+/), {
      timeout: 20000,
    });
    await expect(
      page.getByRole("link", { name: "Evaluators" }).first(),
    ).toBeVisible({ timeout: 20000 });
    await expect(page.getByText(name).first()).toBeVisible({ timeout: 20000 });

    // The fresh evaluator has exactly one version, rendered as a "v1" badge.
    await expect(page.getByText("v1", { exact: true })).toBeVisible({
      timeout: 20000,
    });

    // Open the "New version" form. The header opener now reads "Edit"; the
    // dialog it opens still has the "New version" heading.
    await page.getByRole("button", { name: "Edit", exact: true }).click();
    const dialog = page.locator(".fixed.inset-0.z-50");
    await expect(
      dialog.getByRole("heading", { name: "New version", exact: true }),
    ).toBeVisible();

    // openNewVersionDialog synchronously seeds the judge prompt, model and
    // (for rating/binary) the scale from the live version, so the form is
    // submittable immediately. Confirm the model prefilled (it reads "Select
    // judge model" only when unset — which would block a real create).
    await expect(dialog.getByText("Select judge model")).toHaveCount(0, {
      timeout: 20000,
    });

    // Optional changelog (exercises the changelog branch of createNewVersion).
    await dialog
      .getByPlaceholder("Briefly describe what changed in this version")
      .fill("E2E automated version bump");

    // Uncheck "mark live" so v1 stays live and v2 is created inactive — this
    // lets us then exercise the separate "Mark as current" (setVersionLive)
    // path on v2. With it unchecked the submit button reads "Create version".
    await dialog.getByRole("checkbox").uncheck();
    await dialog.getByRole("button", { name: "Create version" }).click();

    // Dialog closes and the new v2 card appears in the versions list.
    await expect(
      dialog.getByRole("heading", { name: "New version", exact: true }),
    ).toHaveCount(0, { timeout: 20000 });
    await expect(page.getByText("v2", { exact: true })).toBeVisible({
      timeout: 20000,
    });

    // Scope to the v2 version card (the only rounded-xl container holding the
    // exact "v2" badge). It is not live yet, so it shows a "Mark as current"
    // button; v1 carries the "Current" pill.
    const v2Card = page
      .locator("div.rounded-xl")
      .filter({ has: page.getByText("v2", { exact: true }) });
    const markCurrent = v2Card.getByRole("button", { name: "Mark as current" });
    await expect(markCurrent).toBeVisible({ timeout: 20000 });
    await markCurrent.click();

    // After the refresh v2 becomes live — its card now shows the "Current" pill
    // and the "Mark as current" button disappears.
    await expect(v2Card.getByText("Current", { exact: true })).toBeVisible({
      timeout: 20000,
    });
    await expect(markCurrent).toHaveCount(0, { timeout: 20000 });

    // Clean up.
    await deleteEvaluator(page, name);
  });
});
