// Previous / next in a labelling item's edit window.
//
// Opening one item for edit on a labelling task's Items tab shows "Previous
// item" / "Next item" and an "N of M" count; the left and right arrow keys
// step too. Stepping with unsaved edits asks "Discard changes?" first.
//
// Each test seeds a task with two items through the backend's own API, drives
// the real page, and deletes the task afterwards.
//
// Import from ./fixtures so E2E coverage is collected when E2E_COVERAGE=1.
// Run with `npm run test:e2e:integration` (needs a backend, see e2e/README.md).
import fs from "node:fs";
import type { APIRequestContext, Locator, Page } from "@playwright/test";
import { test, expect } from "./fixtures";
import { waitForOrgReady } from "./helpers";
import { STORAGE_STATE } from "./storage-state";

const BACKEND_URL =
  process.env.NEXT_PUBLIC_BACKEND_URL || "http://localhost:8000";

/** The signed-in token auth.setup.ts saved, so seeding runs as that user. */
function savedAccessToken(): string {
  const state = JSON.parse(fs.readFileSync(STORAGE_STATE, "utf8")) as {
    cookies?: { name: string; value: string }[];
  };
  const token = state.cookies?.find((c) => c.name === "access_token")?.value;
  expect(token, `no access_token in ${STORAGE_STATE}`).toBeTruthy();
  return token as string;
}

/** One backend call as the signed-in user. Fails the test on any error. */
async function api<T>(
  request: APIRequestContext,
  path: string,
  init: { method?: string; body?: unknown } = {},
): Promise<T> {
  const method = init.method ?? "GET";
  const res = await request.fetch(`${BACKEND_URL}${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${savedAccessToken()}`,
      "Content-Type": "application/json",
    },
    ...(init.body === undefined ? {} : { data: init.body }),
  });
  expect(
    res.ok(),
    `${method} ${path} failed (${res.status()}): ${await res.text()}`,
  ).toBeTruthy();
  return (await res.json()) as T;
}

type Evaluator = { uuid: string; name: string; evaluator_type?: string };

async function evaluatorOfType(
  request: APIRequestContext,
  type: string,
): Promise<Evaluator> {
  const list = await api<{ items?: Evaluator[] } | Evaluator[]>(
    request,
    "/evaluators?include_defaults=true",
  );
  const all = Array.isArray(list) ? list : (list.items ?? []);
  const evaluator = all.find((e) => e.evaluator_type === type);
  expect(evaluator, `no built-in ${type} evaluator`).toBeTruthy();
  return evaluator as Evaluator;
}

/** A task of `type` with two items named `names`, no annotations. */
async function seedTask(
  request: APIRequestContext,
  type: "stt" | "llm",
  names: string[],
): Promise<{ uuid: string; evaluatorName: string }> {
  const evaluator = await evaluatorOfType(request, type);
  const task = await api<{ uuid: string }>(request, "/annotation-tasks", {
    method: "POST",
    body: {
      name: `E2E edit arrows ${type} ${Date.now()}`,
      type,
      evaluator_ids: [evaluator.uuid],
    },
  });
  await api(request, `/annotation-tasks/${task.uuid}/items`, {
    method: "POST",
    body: {
      items: names.map((name) => ({
        payload:
          type === "stt"
            ? {
                name,
                reference_transcript: "hello there",
                predicted_transcript: "hello their",
              }
            : {
                name,
                chat_history: [{ role: "user", content: "Can you help me?" }],
                agent_response: "Yes, happy to help.",
              },
      })),
    },
  });
  return { uuid: task.uuid, evaluatorName: evaluator.name };
}

/**
 * Open the task's Items tab and the first listed item's edit window. Returns
 * the name field and which seeded name it opened on (the list is sorted by
 * last update, so the order is read rather than assumed).
 */
async function openFirstItemEdit(
  page: Page,
  taskUuid: string,
  names: string[],
  namePlaceholder: string,
): Promise<{ nameField: Locator; first: string; other: string }> {
  await page.goto(`/human-alignment/tasks/${taskUuid}?tab=items`);
  await waitForOrgReady(page);
  await expect(page.getByText(names[0]).first()).toBeVisible({
    timeout: 45000,
  });
  await page.getByRole("button", { name: "Edit", exact: true }).first().click();

  const nameField = page.getByPlaceholder(namePlaceholder);
  await expect(nameField).toBeVisible({ timeout: 15000 });
  const first = await nameField.inputValue();
  expect(names).toContain(first);
  const other = names.find((n) => n !== first) as string;
  return { nameField, first, other };
}

/** Arrow keys are ignored while a text field has focus. */
async function pressOffField(page: Page, key: string): Promise<void> {
  await page.evaluate(() => (document.activeElement as HTMLElement)?.blur());
  await page.keyboard.press(key);
}

async function stepsBothWays(
  page: Page,
  nameField: Locator,
  first: string,
  other: string,
  /** Something the window shows once it has loaded, if it loads at all.
   * Until then it does not know what it started with and asks before
   * every step, so the test waits for it like a person would. */
  loadedWhen?: Locator,
): Promise<void> {
  await expect(page.getByText("1 of 2", { exact: true })).toBeVisible();
  if (loadedWhen) await expect(loadedWhen).toBeVisible({ timeout: 15000 });
  await page.getByRole("button", { name: "Next item", exact: true }).click();
  if (loadedWhen) await expect(loadedWhen).toBeVisible({ timeout: 15000 });
  await expect(nameField).toHaveValue(other, { timeout: 15000 });
  await expect(page.getByText("2 of 2", { exact: true })).toBeVisible();

  await pressOffField(page, "ArrowLeft");
  await expect(nameField).toHaveValue(first, { timeout: 15000 });
  if (loadedWhen) await expect(loadedWhen).toBeVisible({ timeout: 15000 });
  await expect(page.getByText("1 of 2", { exact: true })).toBeVisible();
}

/** Preview leaves the edit window for the item view window, on the same
 * item. */
async function viewsTheItem(
  page: Page,
  nameField: Locator,
  name: string,
): Promise<void> {
  await page.getByRole("button", { name: "Preview", exact: true }).click();
  await expect(nameField).toHaveCount(0);
  await expect(page.getByRole("heading", { name, exact: true })).toBeVisible({
    timeout: 15000,
  });
}

test.describe("Labelling item edit window: previous / next (authenticated, real backend)", () => {
  let taskUuid: string | null = null;
  // React's own warnings land in the browser console. Any of them on this
  // page fails the test (two edit windows sharing a key slipped through once).
  let consoleErrors: string[] = [];

  test.beforeEach(async ({ page }) => {
    consoleErrors = [];
    page.on("console", (m) => {
      if (m.type() === "error" && m.text().includes("same key")) {
        consoleErrors.push(m.text());
      }
    });
  });

  test.afterEach(async ({ request }) => {
    try {
      if (taskUuid) {
        await api(request, `/annotation-tasks/${taskUuid}`, { method: "DELETE" });
      }
    } finally {
      taskUuid = null;
      expect(consoleErrors).toEqual([]);
    }
  });

  test("a speech-to-text item steps to the next item, and asks first when edited", async ({
    page,
    request,
  }) => {
    test.setTimeout(120_000);
    const names = ["Arrows clip one", "Arrows clip two"];
    taskUuid = (await seedTask(request, "stt", names)).uuid;

    const { nameField, first, other } = await openFirstItemEdit(
      page,
      taskUuid,
      names,
      "e.g. Clip 1",
    );
    await stepsBothWays(page, nameField, first, other);

    // Unsaved edits: stepping asks first, and only steps on Discard.
    await nameField.fill(`${first} changed`);
    await page.getByRole("button", { name: "Next item", exact: true }).click();
    await expect(page.getByText("Discard changes?")).toBeVisible();
    await expect(nameField).toHaveValue(`${first} changed`);
    await page.getByRole("button", { name: "Discard", exact: true }).click();
    await expect(nameField).toHaveValue(other, { timeout: 15000 });
    await expect(page.getByText("2 of 2", { exact: true })).toBeVisible();

    await viewsTheItem(page, nameField, other);
  });

  test("a next-reply item steps to the next item and back", async ({
    page,
    request,
  }) => {
    test.setTimeout(120_000);
    const names = ["Arrows reply one", "Arrows reply two"];
    const seeded = await seedTask(request, "llm", names);
    taskUuid = seeded.uuid;

    const { nameField, first, other } = await openFirstItemEdit(
      page,
      taskUuid,
      names,
      "Your item name",
    );
    await stepsBothWays(
      page,
      nameField,
      first,
      other,
      page
        .getByTestId("label-item-evaluators-column")
        .getByText(seeded.evaluatorName, { exact: true }),
    );
    await viewsTheItem(page, nameField, first);
  });

  test("Preview while the next page is still loading keeps the item on screen", async ({
    page,
    request,
  }) => {
    test.setTimeout(120_000);
    const names = Array.from(
      { length: 11 },
      (_, i) => `Paging item ${String(i + 1).padStart(2, "0")}`,
    );
    taskUuid = (await seedTask(request, "stt", names)).uuid;

    await page.addInitScript(() =>
      window.localStorage.setItem("calibrate:items-page-size", "10"),
    );
    await page.goto(`/human-alignment/tasks/${taskUuid}?tab=items`);
    await waitForOrgReady(page);
    await expect(page.getByRole("button", { name: "Edit", exact: true })).toHaveCount(
      10,
      { timeout: 45000 },
    );

    // The last item on the first page, so Next has to load the second page.
    await page.getByRole("button", { name: "Edit", exact: true }).nth(9).click();
    const nameField = page.getByPlaceholder("e.g. Clip 1");
    await expect(nameField).toBeVisible({ timeout: 15000 });
    const lastOnPage = await nameField.inputValue();

    // Hold the second page back so Preview is clicked while it loads.
    await page.route(/\/summary\?.*offset=10/, async (route) => {
      await new Promise((r) => setTimeout(r, 3000));
      await route.continue();
    });
    const secondPage = page.waitForResponse(/\/summary\?.*offset=10/);
    await page.getByRole("button", { name: "Next item", exact: true }).click();
    await page.getByRole("button", { name: "Preview", exact: true }).click();
    await secondPage;
    await page.waitForTimeout(1000);

    await expect(page.getByRole("heading", { name: lastOnPage, exact: true })).toBeVisible();
    await expect(nameField).toHaveCount(0);
  });
});
