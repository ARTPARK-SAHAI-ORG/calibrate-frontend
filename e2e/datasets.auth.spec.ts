// Backend-backed dataset flows for the STT and TTS pages. The "New dataset"
// modal is a simple name-only create that redirects to /datasets/<uuid>, so
// this spec covers the STT/TTS Datasets tab, the dataset-create modal, the
// /datasets/[id] detail route, and dataset deletion. Run with
// `npm run test:e2e:integration`.
import { test, expect } from "./fixtures";

/**
 * Creates a dataset from an STT/TTS Datasets tab (name-only modal → redirect to
 * the dataset detail page), navigates back, and deletes it.
 */
async function createDeleteDataset(
  page: import("@playwright/test").Page,
  {
    listPath,
    pageHeading,
    modalHeading,
    namePlaceholder,
    name,
  }: {
    listPath: string;
    pageHeading: string;
    modalHeading: string;
    namePlaceholder: string;
    name: string;
  },
) {
  await page.goto(`${listPath}?tab=datasets`);
  await expect(page.getByRole("heading", { name: pageHeading })).toBeVisible();

  await page.getByRole("button", { name: "New dataset" }).first().click();
  await expect(page.getByRole("heading", { name: modalHeading })).toBeVisible();
  await page.getByPlaceholder(namePlaceholder).fill(name);
  await page.getByRole("button", { name: "Create", exact: true }).click();

  // Creating a dataset navigates to its detail page.
  await expect(page).toHaveURL(/\/datasets\/[0-9a-f-]{36}/, { timeout: 15000 });

  // Back on the Datasets tab, the new dataset is listed; delete it via its
  // titled icon button + confirmation dialog. Note the shared dialog's confirm
  // button defaults to "Remove" here (the datasets page doesn't override it).
  await page.goto(`${listPath}?tab=datasets`);
  const row = page.locator("div.cursor-pointer").filter({ hasText: name });
  await expect(row).toBeVisible({ timeout: 15000 });
  await row.getByRole("button", { name: "Delete dataset" }).click();
  await expect(
    page.getByRole("heading", { name: "Delete dataset" }),
  ).toBeVisible();
  await page.getByRole("button", { name: /^(Remove|Delete)$/ }).click();
  await expect(page.getByText(name, { exact: true })).toHaveCount(0, {
    timeout: 15000,
  });
}

test.describe("STT datasets (authenticated, real backend)", () => {
  test("creates then deletes an STT dataset", async ({ page }) => {
    await createDeleteDataset(page, {
      listPath: "/stt",
      pageHeading: "Speech-to-Text Evaluation",
      modalHeading: "New STT dataset",
      namePlaceholder: "e.g. Hindi test set",
      name: `E2E STT ds ${Date.now()}`,
    });
  });
});

test.describe("TTS datasets (authenticated, real backend)", () => {
  test("creates then deletes a TTS dataset", async ({ page }) => {
    await createDeleteDataset(page, {
      listPath: "/tts",
      pageHeading: "Text-to-Speech Evaluation",
      modalHeading: "New TTS dataset",
      namePlaceholder: "e.g. Announcements test set",
      name: `E2E TTS ds ${Date.now()}`,
    });
  });
});
