// Onboarding flagship tour E2E — fully mocked, NO backend.
//
// The tour auto-drives the REAL app end to end (create agent → instructions →
// save → add two evaluators → build two tests → run → read results → open the
// failed test → fix the prompt → re-run → pass). Its whole point is a genuine
// fail-then-pass story, which a real backend can't reproduce deterministically:
// the FAKE_AI backend always returns a PASS, so it can never show the failure
// the tour is built to demonstrate. So instead of a backend, this spec installs
// a small in-browser fake backend via page.route(): every REST call the tour
// makes is intercepted and answered from a state machine that returns ONE fail +
// ONE pass on the first run and TWO passes on the second. This runs in the
// backend-free `public` Playwright project — no auth setup, no server, no keys.
//
// Run locally:
//   npx playwright test --project=public onboarding-tour
import { test, expect } from "./fixtures";
import type { Page, Route } from "@playwright/test";

// Disables the first-visit auto-start so the tour runs only when we dispatch it
// (deterministic regardless of stored "seen" state). Same key the app uses.
const SEEN_KEY = "calibrate:onboarding:v1:first-eval";
const START_EVENT = "calibrate:start-tour";
const AGENT_UUID = "agent-e2e-123";

const popoverTitle = (page: Page) => page.locator(".driver-popover-title");
const nextButton = (page: Page) => page.locator(".driver-popover-next-btn");

// ---------------------------------------------------------------------------
// Fake backend: a mutable state machine answering every endpoint the tour hits.
// ---------------------------------------------------------------------------

type FakeState = {
  attachedEvaluators: EvaluatorPayload[];
  tests: TestPayload[];
  runsCreated: number;
};

type EvaluatorPayload = {
  uuid: string;
  name: string;
  description: string;
  slug: string;
  is_default: boolean;
  evaluator_type: string;
  output_type: string;
  live_version: { variables: { name: string; description: string }[] };
  created_at: string;
  updated_at: string;
};

type TestPayload = {
  uuid: string;
  name: string;
  description: string;
  type: string;
  config: Record<string, unknown>;
  created_at: string;
  updated_at: string;
};

const ISO = "2026-07-16T00:00:00Z";

// Two LLM-reply evaluators: one "Correctness" (the default next-reply slug the
// dialog seeds), one "Reply Conciseness" (the second check the flow adds). Both are
// evaluator_type "llm" so they render the "LLM reply" pill AND actually grade a
// next-reply test — the exact property the tour's picker now depends on.
const LIBRARY_EVALUATORS: EvaluatorPayload[] = [
  {
    uuid: "ev-correct",
    name: "Correctness",
    description: "Is the answer right?",
    slug: "default-llm-next-reply",
    is_default: true,
    evaluator_type: "llm",
    output_type: "binary",
    live_version: {
      variables: [{ name: "criteria", description: "Success criteria" }],
    },
    created_at: ISO,
    updated_at: ISO,
  },
  {
    uuid: "ev-concise",
    name: "Reply Conciseness",
    description: "Is the reply concise?",
    slug: "reply-conciseness",
    is_default: true,
    evaluator_type: "llm",
    output_type: "binary",
    live_version: {
      variables: [{ name: "criteria", description: "Success criteria" }],
    },
    created_at: ISO,
    updated_at: ISO,
  },
  // A conversation-type evaluator that must NOT be picked as the second one:
  // it would be silently dropped from a next-reply test. Its presence proves the
  // picker skips it.
  {
    uuid: "ev-convo",
    name: "Conversation coherence",
    description: "Grades the whole conversation",
    slug: "default-conversation",
    is_default: true,
    evaluator_type: "conversation",
    output_type: "binary",
    live_version: {
      variables: [{ name: "criteria", description: "Success criteria" }],
    },
    created_at: ISO,
    updated_at: ISO,
  },
];

const RUN_EVALUATORS = [
  {
    uuid: "ev-correct",
    name: "Correctness",
    description: "Is the answer right?",
    output_type: "binary",
    version_number: 1,
  },
  {
    uuid: "ev-concise",
    name: "Reply Conciseness",
    description: "Is the reply concise?",
    output_type: "binary",
    version_number: 1,
  },
];

/** Per-case result for the run status payload. */
function caseResult(opts: {
  testUuid: string;
  name: string;
  userMessage: string;
  response: string;
  criteria: string;
  passed: boolean;
  reasoning: string;
}) {
  return {
    test_uuid: opts.testUuid,
    test_name: opts.name,
    name: opts.name,
    passed: opts.passed,
    status: opts.passed ? "passed" : "failed",
    reasoning: opts.reasoning,
    output: { response: opts.response },
    test_case: {
      name: opts.name,
      history: [{ role: "user", content: opts.userMessage }],
      evaluation: { type: "response", criteria: opts.criteria },
    },
    judge_results: [
      {
        evaluator_uuid: "ev-correct",
        match: opts.passed,
        value_name: opts.passed ? "Pass" : "Fail",
        reasoning: opts.reasoning,
        variable_values: { criteria: opts.criteria },
      },
      {
        evaluator_uuid: "ev-concise",
        match: true,
        value_name: "Pass",
        reasoning: "The reply is concise and to the point.",
        variable_values: {
          criteria: "The reply is concise and free of rambling or filler.",
        },
      },
    ],
    latency_ms: 820,
    cost: 0.0004,
    total_tokens: 210,
  };
}

/**
 * Run status payload. First run (`n === 1`): the phone-number test FAILS while
 * the clinic-hours test passes. Later runs (after the prompt fix): both pass.
 */
function runStatus(taskId: string, n: number) {
  const phonePass = n >= 2;
  const phone = caseResult({
    testUuid: "test-phone",
    name: "Demo · phone number it lacks",
    userMessage: "What is the clinic's phone number?",
    criteria: "Gives the caller the clinic's phone number.",
    passed: phonePass,
    response: phonePass
      ? "Our clinic helpline number is 1800-123-4567. Happy to help!"
      : "Happy to help with that.",
    reasoning: phonePass
      ? "The agent now provides the clinic's phone number, satisfying the criteria."
      : "The agent did not provide a phone number, so the answer is incorrect.",
  });
  const hours = caseResult({
    testUuid: "test-hours",
    name: "Demo · clinic hours",
    userMessage: "What time does the clinic open?",
    criteria: "States the clinic's opening hours clearly and kindly.",
    passed: true,
    response: "Our clinic is open from 9 am to 5 pm, Monday to Saturday.",
    reasoning: "States the opening hours clearly and kindly.",
  });
  const passed = phonePass ? 2 : 1;
  return {
    task_id: taskId,
    name: "Test run",
    status: "done",
    total_tests: 2,
    passed,
    failed: 2 - passed,
    evaluators: RUN_EVALUATORS,
    latency_ms: { p50: 820, p95: 1200, p99: 1300, count: 2 },
    cost: { mean: 0.0004, min: 0.0003, max: 0.0005, count: 2 },
    total_tokens: { mean: 210, min: 180, max: 240, count: 2 },
    // Failed group renders first, so the failing phone test is the first row on
    // run 1 — which is exactly the row the tour opens.
    results: phonePass ? [hours, phone] : [phone, hours],
  };
}

const slug = (s: string) =>
  s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");

/**
 * Install the fake backend on the page: intercept every cross-origin call (i.e.
 * everything not served by the app itself). Matching on ORIGIN, not hostname, is
 * deliberate — the real backend may live at `127.0.0.1:8000`, same hostname as
 * an app served on `localhost`, so only the origin (host + port) tells them
 * apart. App pages, `_next` assets, and NextAuth all share `appOrigin` and pass
 * straight through.
 */
async function installFakeBackend(page: Page, appOrigin: string): Promise<void> {
  const state: FakeState = {
    attachedEvaluators: [],
    tests: [],
    runsCreated: 0,
  };

  const json = (route: Route, body: unknown, status = 200) =>
    route.fulfill({
      status,
      contentType: "application/json",
      body: JSON.stringify(body),
    });

  await page.route(
    (url) => url.origin !== appOrigin,
    async (route) => {
      const req = route.request();
      const method = req.method();
      const { pathname } = new URL(req.url());

      // --- Boot ---
      if (method === "GET" && pathname === "/organizations") {
        return json(route, [
          { uuid: "org-1", name: "Personal", is_personal: true },
        ]);
      }
      if (method === "GET" && pathname === "/providers") {
        return json(route, { providers: [] });
      }

      // --- Agents ---
      if (method === "GET" && pathname === "/agents") {
        return json(route, []);
      }
      if (method === "POST" && pathname === "/agents") {
        return json(route, { uuid: AGENT_UUID });
      }
      if (method === "GET" && pathname === `/agents/${AGENT_UUID}`) {
        return json(route, {
          uuid: AGENT_UUID,
          name: "Community Clinic Helpline",
          type: "agent",
          config: { system_prompt: "" },
          created_at: ISO,
          updated_at: ISO,
        });
      }
      if (method === "PUT" && pathname === `/agents/${AGENT_UUID}`) {
        return json(route, {});
      }

      // --- Agent evaluators ---
      if (
        method === "GET" &&
        pathname === `/agents/${AGENT_UUID}/evaluators`
      ) {
        return json(route, state.attachedEvaluators);
      }
      if (
        method === "POST" &&
        pathname === `/agents/${AGENT_UUID}/evaluators`
      ) {
        const body = (req.postDataJSON() ?? {}) as { evaluator_ids?: string[] };
        const ids = body.evaluator_ids ?? [];
        state.attachedEvaluators = LIBRARY_EVALUATORS.filter((e) =>
          ids.includes(e.uuid),
        );
        return json(route, { linked: ids, already_linked: [] });
      }

      // --- Evaluator library ---
      if (method === "GET" && pathname === "/evaluators") {
        return json(route, LIBRARY_EVALUATORS);
      }

      // --- Tools (unused by the tour, but the pages fetch them) ---
      if (
        method === "GET" &&
        (pathname === "/tools" ||
          pathname === `/agent-tools/agent/${AGENT_UUID}/tools`)
      ) {
        return json(route, []);
      }

      // --- Tests ---
      if (
        method === "GET" &&
        pathname === `/agent-tests/agent/${AGENT_UUID}/tests`
      ) {
        return json(route, state.tests);
      }
      if (
        method === "GET" &&
        pathname === `/agent-tests/agent/${AGENT_UUID}/runs`
      ) {
        return json(route, []);
      }
      if (method === "GET" && pathname === "/tests") {
        return json(route, []);
      }
      if (method === "POST" && pathname === "/tests/bulk") {
        const body = (req.postDataJSON() ?? {}) as {
          tests?: { name?: string }[];
        };
        for (const t of body.tests ?? []) {
          const name = t.name ?? "Untitled test";
          state.tests.push({
            uuid: slug(name),
            name,
            description: "",
            type: "response",
            config: {},
            created_at: ISO,
            updated_at: ISO,
          });
        }
        return json(route, { warnings: [] });
      }

      // --- Run flow ---
      if (
        method === "POST" &&
        pathname === `/agent-tests/agent/${AGENT_UUID}/run`
      ) {
        state.runsCreated += 1;
        return json(route, {
          task_id: `run-${state.runsCreated}`,
          status: "queued",
        });
      }
      const runMatch = pathname.match(/\/agent-tests\/run\/run-(\d+)$/);
      if (method === "GET" && runMatch) {
        const n = Number(runMatch[1]);
        return json(route, runStatus(`run-${n}`, n));
      }

      // --- Everything else (openrouter, analytics, sentry, …) ---
      // Fail-open with an empty payload so nothing hits a real network.
      return json(route, pathname.includes("openrouter") ? [] : {});
    },
  );
}

// The ordered tour steps we drive through. `auto: true` marks the two "running"
// cards, which have no Next button and advance themselves once the (mocked) run
// resolves. Titles are asserted by substring so emoji/punctuation don't matter.
const STEPS: { title: string; auto?: boolean }[] = [
  { title: "Welcome to Calibrate" },
  { title: "Create an agent" },
  { title: "Build or connect" },
  { title: "Give it instructions" },
  { title: "Save your work" },
  { title: "Add an evaluator" },
  { title: "Choose what to check" },
  { title: "Add another check" },
  { title: "Add them to your agent" },
  { title: "Create your first test" },
  { title: "The scenario" },
  { title: "How your test is graded" },
  { title: "Add a test it should fail" },
  { title: "A scenario it cannot answer" },
  { title: "Require what it cannot give" },
  { title: "Run your tests" },
  { title: "Running your tests", auto: true },
  { title: "The results are ready" },
  { title: "See every answer" },
  { title: "Review your failed test" },
  { title: "Your agent's answer" },
  { title: "The evaluator's verdict" },
  { title: "See the reasoning" },
  { title: "Fix the gap it found" },
  { title: "Run the tests again" },
  { title: "Running again", auto: true },
  { title: "It passes now" },
  { title: "This is the big idea" },
  { title: "Keep adding tests" },
  { title: "That is the first walkthrough" },
];

test.describe("Onboarding flagship tour (fully mocked, no backend)", () => {
  test.beforeEach(async ({ page, context, baseURL }) => {
    const appOrigin = new URL(baseURL ?? "http://localhost:3100").origin;
    await installFakeBackend(page, appOrigin);
    // Fake auth: middleware only checks the access_token cookie's presence, and
    // the app reads the token + active org from localStorage.
    await context.addCookies([
      {
        name: "access_token",
        value: "fake-e2e-token",
        domain: "localhost",
        path: "/",
      },
    ]);
    await page.addInitScript(
      ([seenKey]) => {
        try {
          localStorage.setItem("access_token", "fake-e2e-token");
          localStorage.setItem(
            "user",
            JSON.stringify({ email: "demo@e2e.local", name: "Demo" }),
          );
          localStorage.setItem("activeOrgUuid", "org-1");
          // Mark the tour "seen" so it does NOT auto-start; we dispatch it.
          localStorage.setItem(seenKey, "completed");
        } catch {
          /* ignore */
        }
      },
      [SEEN_KEY],
    );
  });

  test("drives create → two evaluators → fail → fix → pass", async ({
    page,
  }) => {
    await page.goto("/agents");
    await expect(page.locator('[data-tour="new-agent"]')).toBeVisible({
      timeout: 30000,
    });

    // Start the tour explicitly (the "Product tour" button path).
    await page.evaluate(
      (evt) =>
        window.dispatchEvent(new CustomEvent(evt, { detail: "first-eval" })),
      START_EVENT,
    );

    for (let i = 0; i < STEPS.length; i++) {
      const step = STEPS[i];
      await expect(popoverTitle(page)).toContainText(step.title, {
        timeout: 30000,
      });

      // Milestone checks that prove the fail → fix → pass story.
      if (step.title === "Welcome to Calibrate") {
        await expect(page.locator(".driver-popover")).toHaveClass(
          /calibrate-tour/,
        );
        await expect(page.locator(".calibrate-tour-skip")).toBeVisible();
        // Backdrop click must NOT end the tour — only the X / Skip controls do.
        await page.mouse.click(4, 4);
        await expect(popoverTitle(page)).toContainText("Welcome to Calibrate");
      }
      if (step.title === "Give it instructions") {
        await expect(page).toHaveURL(new RegExp(`/agents/${AGENT_UUID}`), {
          timeout: 20000,
        });
        // Exactly one popover — no orphan left over from the create-navigation.
        await expect(page.locator(".driver-popover")).toHaveCount(1);
      }
      if (step.title === "Add another check") {
        // Correctness is ticked; the picker highlights the just-picked row.
        await expect(
          page.locator('[data-tour="add-evaluators-dialog"]'),
        ).toBeVisible();
      }
      if (step.title === "Review your failed test") {
        // The first (failed) result row is the phone-number test.
        const row = page.locator('[data-tour="run-result-row"]').first();
        await expect(row).toContainText(/phone number/i, { timeout: 15000 });
      }
      if (step.title === "See the reasoning") {
        await expect(
          page.locator("[data-reasoning-body]").first(),
        ).toBeVisible({ timeout: 10000 });
        await expect(
          page.locator("[data-reasoning-body]").first(),
        ).toContainText(/did not provide a phone number/i);
      }
      if (step.title === "It passes now") {
        // After the fix + re-run, the phone test now passes: its answer shows
        // the number we added to the prompt.
        await expect(
          page.locator('[data-tour="run-result-detail"]'),
        ).toContainText(/1800-123-4567/, { timeout: 20000 });
      }

      if (step.auto) continue; // engine advances the running cards itself
      await nextButton(page).click();
    }

    // Finishing the last step tears the popover down.
    await expect(popoverTitle(page)).toHaveCount(0, { timeout: 10000 });
  });
});
