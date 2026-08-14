// "Send for review" — the button in the header action row on the evaluation
// run page and the signed-in labelling job page. It takes the items the
// filters leave visible and creates labelling jobs for the annotators you
// pick, going straight to the annotator picker.
//
// The pages this covers need a labelling task with items, human answers, a
// finished labelling job and a finished evaluation run. Building all of that
// by clicking would take several minutes per test, so each test seeds it
// through the backend's own API with the signed-in token and then drives the
// real pages. Everything seeded is deleted again afterwards.
//
// Import from ./fixtures so E2E coverage is collected when E2E_COVERAGE=1.
// Run with `npm run test:e2e:integration` (needs a backend, see e2e/README.md).
import fs from "node:fs";
import type { APIRequestContext, Page } from "@playwright/test";
import { test, expect } from "./fixtures";
import { waitForOrgReady } from "./helpers";
import { STORAGE_STATE } from "./storage-state";

const BACKEND_URL =
  process.env.NEXT_PUBLIC_BACKEND_URL || "http://localhost:8000";

/** The three items every test seeds, in the order they are created. */
const ITEM_NAMES = ["SFR item one", "SFR item two", "SFR item three"];
/** The one item the seeded annotator answered "no" on. */
const DISAGREEING_ITEM = 1;

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

type Seeded = {
  taskUuid: string;
  annotatorUuid: string;
  annotatorName: string;
  /** The annotator's own link token, also the signed-in job page's token. */
  jobToken: string;
  jobUuid: string;
  runUuid: string;
};

/**
 * A labelling task with three items, a finished labelling job carrying the
 * annotator's answers, and a finished evaluation run over the same items.
 *
 * The answers are seeded as part of creating the items, which the backend
 * turns into one finished job for that annotator. One answer is "no" while
 * the evaluator scores every item "yes", so exactly one item disagrees.
 */
async function seed(request: APIRequestContext): Promise<Seeded> {
  const stamp = `${Date.now()}-${Math.floor(Math.random() * 1000)}`;

  const evaluatorList = await api<{ items?: Evaluator[] } | Evaluator[]>(
    request,
    "/evaluators?include_defaults=true",
  );
  type Evaluator = {
    uuid: string;
    evaluator_type?: string;
    output_type?: string;
  };
  const all: Evaluator[] = Array.isArray(evaluatorList)
    ? evaluatorList
    : (evaluatorList.items ?? []);
  const llm = all.filter((e) => e.evaluator_type === "llm");
  const evaluator = llm.find((e) => e.output_type === "binary") ?? llm[0];
  expect(
    evaluator,
    "no built-in LLM evaluator to build the task on",
  ).toBeTruthy();

  const task = await api<{ uuid: string }>(request, "/annotation-tasks", {
    method: "POST",
    body: {
      name: `E2E Send for review ${stamp}`,
      type: "llm",
      evaluator_ids: [evaluator.uuid],
    },
  });

  const annotatorName = `E2E SFR annotator ${stamp}`;
  const annotator = await api<{ uuid: string }>(request, "/annotators", {
    method: "POST",
    body: { name: annotatorName },
  });

  const created = await api<{ annotation_job_id: string }>(
    request,
    `/annotation-tasks/${task.uuid}/items`,
    {
      method: "POST",
      body: {
        annotator_id: annotator.uuid,
        items: ITEM_NAMES.map((name, i) => ({
          payload: {
            name,
            chat_history: [{ role: "user", content: "Can you help me?" }],
            agent_response: "Yes, happy to help.",
          },
          annotations: {
            [evaluator.uuid]: { value: i !== DISAGREEING_ITEM },
          },
        })),
      },
    },
  );

  const jobs = await api<{ uuid: string; public_token: string }[]>(
    request,
    `/annotation-tasks/${task.uuid}/jobs`,
  );
  const job = jobs.find((j) => j.uuid === created.annotation_job_id);
  expect(
    job,
    "the seeded answers did not produce a labelling job",
  ).toBeTruthy();

  const run = await api<{ job_uuid: string }>(
    request,
    `/annotation-tasks/${task.uuid}/evaluator-runs`,
    {
      method: "POST",
      body: {
        evaluators: [{ evaluator_id: evaluator.uuid }],
        select_all: true,
      },
    },
  );

  // The run is a background job. Nothing on the page can be asserted until it
  // has finished, so wait for it here rather than in every test.
  await expect
    .poll(
      async () =>
        (
          await api<{ status: string }>(
            request,
            `/annotation-tasks/${task.uuid}/evaluator-runs/${run.job_uuid}`,
          )
        ).status,
      { timeout: 120_000, intervals: [1000] },
    )
    .toBe("completed");

  return {
    taskUuid: task.uuid,
    annotatorUuid: annotator.uuid,
    annotatorName,
    jobToken: job!.public_token,
    jobUuid: job!.uuid,
    runUuid: run.job_uuid,
  };
}

/**
 * Walk the annotator picker through to a created job: tick the annotator,
 * confirm, and check the links dialog names it.
 */
async function assignTo(page: Page, annotatorName: string): Promise<void> {
  await expect(
    page.getByRole("heading", { name: "Assign annotators", exact: true }),
  ).toBeVisible({ timeout: 15000 });
  await page
    .locator("label")
    .filter({ hasText: annotatorName })
    .locator('input[type="checkbox"]')
    .check();
  await page.getByRole("button", { name: "Assign", exact: true }).click();

  await expect(
    page.getByRole("heading", { name: "1 new job created", exact: true }),
  ).toBeVisible({ timeout: 20000 });
  await expect(page.getByText(annotatorName).first()).toBeVisible();
}

test.describe("Send for review (authenticated, real backend)", () => {
  let seeded: Seeded;

  test.beforeEach(async ({ request }) => {
    seeded = await seed(request);
  });

  test.afterEach(async ({ request }) => {
    // Deleting the task takes its items, jobs and runs with it.
    await api(request, `/annotation-tasks/${seeded.taskUuid}`, {
      method: "DELETE",
    });
    await api(request, `/annotators/${seeded.annotatorUuid}`, {
      method: "DELETE",
    });
  });

  test("the evaluation run page sends the items it is showing for review", async ({
    page,
  }) => {
    await page.goto(
      `/human-alignment/tasks/${seeded.taskUuid}/evaluator-runs/${seeded.runUuid}`,
    );
    await waitForOrgReady(page);

    const sendButton = page.getByRole("button", {
      name: "Send for review 3",
    });
    await expect(sendButton).toBeVisible({ timeout: 30000 });
    await sendButton.click();

    // Clicking goes straight to choosing annotators.
    await assignTo(page, seeded.annotatorName);
  });

  test("narrowing the evaluation run page to disagreements narrows what is sent", async ({
    page,
  }) => {
    await page.goto(
      `/human-alignment/tasks/${seeded.taskUuid}/evaluator-runs/${seeded.runUuid}`,
    );
    await waitForOrgReady(page);

    await expect(
      page.getByRole("button", { name: "Send for review 3" }),
    ).toBeVisible({ timeout: 30000 });

    // The evaluator scored every item "yes"; the annotator answered "no" on
    // one, so exactly one item disagrees.
    await page
      .getByRole("button", { name: "Show disagreements only", exact: true })
      .click();

    await expect(
      page.getByRole("button", { name: "Send for review 1" }),
    ).toBeVisible({ timeout: 15000 });
    await expect(
      page.getByRole("button", { name: "Send for review 3" }),
    ).toHaveCount(0);
  });

  test("the signed-in labelling job page sends its items for review", async ({
    page,
  }) => {
    await page.goto(`/human-alignment/jobs/${seeded.jobToken}`);
    await waitForOrgReady(page);

    const sendButton = page.getByRole("button", {
      name: "Send for review 3",
    });
    await expect(sendButton).toBeVisible({ timeout: 30000 });
    await sendButton.click();

    await assignTo(page, seeded.annotatorName);
  });

  test("the links anyone can open never offer to send items for review", async ({
    page,
    request,
  }) => {
    // Three page loads in one test, each a first compile in a cold dev server.
    test.setTimeout(150_000);

    // Turn on the two read-only links this job and run can have.
    const jobShare = await api<{ view_token: string }>(
      request,
      `/annotation-tasks/${seeded.taskUuid}/jobs/${seeded.jobUuid}/visibility`,
      { method: "PATCH", body: { is_public: true } },
    );
    const runShare = await api<{ share_token: string }>(
      request,
      `/annotation-tasks/${seeded.taskUuid}/evaluator-runs/${seeded.runUuid}/visibility`,
      { method: "PATCH", body: { is_public: true } },
    );

    for (const url of [
      `/annotate-job/${seeded.jobToken}`,
      `/public/annotation-jobs/view/${jobShare.view_token}`,
      `/public/annotation-eval/${runShare.share_token}`,
    ]) {
      await page.goto(url);
      // Wait for the items to be on screen, so "no button" is a real absence
      // and not a page that had not loaded yet.
      await expect(page.getByText("Item 1 of 3")).toBeVisible({
        timeout: 45000,
      });
      await expect(
        page.getByRole("button", { name: /for review/ }),
        `"Send for review" must not appear on ${url}`,
      ).toHaveCount(0);
    }
  });
});
