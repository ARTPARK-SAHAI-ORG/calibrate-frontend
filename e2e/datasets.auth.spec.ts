// Backend-backed dataset flows for the STT and TTS pages. The "New dataset"
// modal is a simple name-only create that redirects to /datasets/<uuid>, so
// this spec covers the STT/TTS Datasets tab, the dataset-create modal, the
// /datasets/[id] detail route (which mounts STTDatasetEditor / TTSDatasetEditor),
// and dataset deletion. Run with `npm run test:e2e:integration`.
import { test, expect } from "./fixtures";

/**
 * After landing on a freshly-created (empty) dataset's detail page, exercise the
 * relevant editor so its row-management code runs. The two editors differ:
 *
 * - TTS rows are text-only, so we can fill a row, add another, fill it, and Save
 *   (a plain POST — no audio). That exercises the add/save path end-to-end.
 * - STT rows require an uploaded .wav (s3Path) before they count as complete, so
 *   `addRow` blocks adding a *filled-but-incomplete* row. Instead we add a blank
 *   row first (blank rows are skipped by the completeness check), then fill the
 *   reference transcription — mounting the extra row + upload UI without needing
 *   a real audio upload. We do NOT save STT (no backend audio to attach).
 */
async function exerciseEditor(
  page: import("@playwright/test").Page,
  editorType: "stt" | "tts",
) {
  if (editorType === "tts") {
    const firstRow = page.getByPlaceholder("Enter text to synthesize");
    await expect(firstRow.first()).toBeVisible({ timeout: 15000 });
    await firstRow.first().fill("The quick brown fox jumps.");

    // Adding another row is allowed because the first row now has text.
    await page.getByRole("button", { name: "Add another row" }).click();
    const rows = page.getByPlaceholder("Enter text to synthesize");
    await expect(rows).toHaveCount(2, { timeout: 15000 });
    await rows.nth(1).fill("A second synthesized line.");

    // Pending changes surface the Save button; saving POSTs both rows.
    await page.getByRole("button", { name: "Save", exact: true }).click();
    // After a successful save fetchDataset re-runs and the header reflects the
    // two new items.
    await expect(page.getByText(/2 items/).first()).toBeVisible({
      timeout: 15000,
    });
  } else {
    const refInput = page.getByPlaceholder("Enter reference transcription");
    await expect(refInput.first()).toBeVisible({ timeout: 15000 });

    // The ZIP-upload affordance renders alongside the manual rows.
    await expect(
      page.getByRole("button", { name: "Download sample ZIP" }),
    ).toBeVisible({ timeout: 15000 });

    // Add another (blank) row — blank rows bypass the completeness check, so
    // this mounts another row without needing an audio upload. The initial rows
    // mount asynchronously, so we don't assert an exact count (it's racy);
    // clicking "Add another sample" and filling the last row is enough to run
    // the add-row + text-change handlers.
    const rows = page.getByPlaceholder("Enter reference transcription");
    await expect(rows.first()).toBeVisible({ timeout: 15000 });
    await page.getByRole("button", { name: "Add another sample" }).click();

    // Type a reference transcription into the first (visible) row to run the
    // text-change handler. No save: STT rows need an uploaded .wav to persist.
    await rows.first().fill("Reference transcription for the sample.");
  }
}

/**
 * Creates a dataset from an STT/TTS Datasets tab (name-only modal → redirect to
 * the dataset detail page), exercises the editor, navigates back, and deletes it.
 */
async function createExerciseDeleteDataset(
  page: import("@playwright/test").Page,
  {
    listPath,
    pageHeading,
    modalHeading,
    namePlaceholder,
    name,
    editorType,
  }: {
    listPath: string;
    pageHeading: string;
    modalHeading: string;
    namePlaceholder: string;
    name: string;
    editorType: "stt" | "tts";
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

  // The detail page mounts the editor — its header shows the dataset name.
  await expect(
    page.getByRole("heading", { name, exact: true }),
  ).toBeVisible({ timeout: 15000 });

  // Exercise the editor (add rows, fill text, and for TTS also save).
  await exerciseEditor(page, editorType);

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
  test("creates, edits, then deletes an STT dataset", async ({ page }) => {
    await createExerciseDeleteDataset(page, {
      listPath: "/stt",
      pageHeading: "Speech-to-Text Evaluation",
      modalHeading: "New STT dataset",
      namePlaceholder: "e.g. Hindi test set",
      name: `E2E STT ds ${Date.now()}`,
      editorType: "stt",
    });
  });
});

test.describe("TTS datasets (authenticated, real backend)", () => {
  test("creates, edits, then deletes a TTS dataset", async ({ page }) => {
    await createExerciseDeleteDataset(page, {
      listPath: "/tts",
      pageHeading: "Text-to-Speech Evaluation",
      modalHeading: "New TTS dataset",
      namePlaceholder: "e.g. Announcements test set",
      name: `E2E TTS ds ${Date.now()}`,
      editorType: "tts",
    });
  });
});
