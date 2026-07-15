/**
 * Flagship onboarding tour: "Run your first evaluation".
 *
 * Auto-drives the real app end to end so a brand-new user watches a genuine
 * evaluation get built and run, in plain language:
 *   welcome → create a demo agent → give it instructions → save → add an
 *   evaluator → add + inspect two sample tests → run → read the results.
 *
 * Actions inject sample values and click the app's real controls silently; the
 * copy explains what the user sees rather than narrating the mechanics. It
 * creates a real, clearly-labelled "Demo agent" the user can delete later, and
 * degrades gracefully: if an anchor is missing the popover still shows and the
 * user can act by hand.
 */

import { getBackendUrl, getDefaultHeaders, unwrapList } from "@/lib/api";
import { WHATSAPP_INVITE_URL } from "@/constants/links";
import {
  clickByText,
  clickElement,
  delay,
  fillAllByPlaceholderPrefix,
  fillByPlaceholder,
  fillInput,
  waitForElement,
} from "../dom";
import type { Tour, TourStep } from "../engine";

export const FIRST_EVAL_TOUR_ID = "first-eval";

// The welcome card's help links (driver.js renders the description as HTML).
function welcomeDescription(): string {
  const docsUrl =
    process.env.NEXT_PUBLIC_DOCS_URL || "https://calibrate.artpark.ai/docs";
  // No underline (modern link style); the accent color + weight signal it.
  const link = (href: string, text: string) =>
    `<a href="${href}" target="_blank" rel="noopener noreferrer" style="color:var(--tour-link, #6366f1);font-weight:500;text-decoration:none;">${text}</a>`;
  const links = [
    link(WHATSAPP_INVITE_URL, "Talk to us"),
    link(docsUrl, "Read the docs"),
  ].join(" &nbsp;·&nbsp; ");
  return (
    "<div>Calibrate helps you <strong>check that your AI agent actually does its job</strong>, " +
    "whether it types or talks. Testing by hand is tedious and easy to get " +
    "wrong, so we do it for you.</div>" +
    '<div style="margin-top:0.6em;">Want to see how it works? Let us build a ' +
    "<strong>quick demo agent</strong> and put it through its paces together. " +
    "Takes about a " +
    "minute, and you can delete it after.</div>" +
    `<div style="margin-top:0.6em;font-size:0.8rem;">${links}</div>`
  );
}

const DEMO_AGENT_NAME = "Demo agent";

const DEMO_SYSTEM_PROMPT =
  "You are a friendly helpline assistant for a non-profit that runs free " +
  "community health clinics. Answer questions about clinic hours, services, and " +
  "appointments concisely and kindly. If you do not know an answer, offer to " +
  "connect the person to a staff member.";

type DemoTest = {
  name: string;
  userMessage: string;
  agentMessage: string;
  criteria: string;
};

const DEMO_TESTS: DemoTest[] = [
  {
    name: "Demo · clinic hours",
    userMessage: "What time does the clinic open?",
    agentMessage: "Our clinic is open from 9 am to 5 pm, Monday to Saturday.",
    criteria: "States the clinic's opening hours clearly and kindly.",
  },
  {
    name: "Demo · appointment needed",
    userMessage: "Do I need an appointment to visit?",
    agentMessage: "No appointment is needed. You can walk in anytime during opening hours.",
    criteria: "Explains the walk-in and appointment policy accurately.",
  },
];

// Anchors (kept here so component `data-tour` attributes and steps stay in sync).
export const A = {
  newAgent: '[data-tour="new-agent"]',
  agentNameInput: '[data-tour="agent-name-input"]',
  agentCreateSubmit: '[data-tour="agent-create-submit"]',
  systemPrompt: '[data-tour="agent-system-prompt"]',
  save: '[data-tour="agent-save"]',
  tabEvaluators: '[data-tour="agent-tab-evaluators"]',
  evaluatorsAdd: '[data-tour="evaluators-add"]',
  addEvaluatorsDialog: '[data-tour="add-evaluators-dialog"]',
  evaluatorsAddConfirm: '[data-tour="evaluators-add-confirm"]',
  agentTypeOptions: '[data-tour="agent-type-options"]',
  tabTests: '[data-tour="agent-tab-tests"]',
  testsCreate: '[data-tour="tests-create"]',
  testRowFirst: '[data-tour="test-row-first"]',
  testConversation: '[data-tour="test-conversation"]',
  testEvaluatorsArea: '[data-tour="test-evaluators-area"]',
  testEditorClose: '[data-tour="test-editor-close"]',
  testsRunAll: '[data-tour="tests-run-all"]',
  runSummary: '[data-tour="test-run-summary"]',
  runTabOutputs: '[data-tour="run-tab-outputs"]',
  runOutputsList: '[data-tour="run-outputs-list"]',
  runResultRow: '[data-tour="run-result-row"]',
  runResultDetail: '[data-tour="run-result-detail"]',
  runResultVerdict: '[data-tour="run-result-verdict"]',
} as const;

export type FirstEvalDeps = {
  // A getter, not a snapshot: the tour is built once but its API calls fire
  // seconds later, so it must read the token fresh (it may still be hydrating
  // when the tour starts).
  getAccessToken: () => string | null;
};

/**
 * Fill the sample scenario (conversation) into the already-open Create Test
 * editor: every seeded user turn gets the person's question, every agent turn
 * a sample reply.
 */
function fillTestScenario(test: DemoTest): void {
  fillAllByPlaceholderPrefix("Enter user message", test.userMessage);
  fillAllByPlaceholderPrefix("Enter agent message", test.agentMessage);
}

/**
 * Open the Create Test dialog and pick "Next reply", which seeds a conversation
 * and the default evaluator. Leaves the editor open for the scenario/criteria
 * to be filled in.
 */
async function openCreateTestEditor(
  baseName: string,
  deps: FirstEvalDeps,
): Promise<void> {
  await clickElement(A.testsCreate, { timeout: 10000 });
  await clickByText("Next reply test", { timeout: 8000 });
  await delay(300);
  // Avoid "A test with this name already exists" on re-runs.
  const name = await resolveFreeName(baseName, "/tests", deps.getAccessToken());
  await fillByPlaceholder("Your test name", name, { timeout: 8000 });
}

/** Submit the open Create Test editor and dismiss the "add to defaults" prompt. */
async function submitCreateTest(): Promise<void> {
  await clickByText("Create", { timeout: 8000 });
  // "Update default evaluators?" only appears when the test references an
  // evaluator not already on the agent — the tour's isn't, so this usually
  // doesn't show. Use a short timeout so we dismiss it if present without
  // stalling the tour when it never appears.
  await clickByText("Not now", { timeout: 1200 });
  await delay(300);
}

/** Create one demo test end to end through the real dialog. */
async function createOneTest(test: DemoTest, deps: FirstEvalDeps): Promise<void> {
  await openCreateTestEditor(test.name, deps);
  fillTestScenario(test);
  await fillByPlaceholder(
    "Criteria that the agent's response should satisfy",
    test.criteria,
    { timeout: 8000 },
  );
  await delay(150);
  await submitCreateTest();
}

/** Return `base`, or the first free "base (N)" variant not in `taken`. */
function pickFreeName(base: string, taken: Set<string>): string {
  if (!taken.has(base.toLowerCase())) return base;
  for (let i = 2; i < 1000; i++) {
    const candidate = `${base} (${i})`;
    if (!taken.has(candidate.toLowerCase())) return candidate;
  }
  return base;
}

/**
 * Pick a name not already taken by items at `listEndpoint` (a `{ name }` list),
 * so re-running the tour never hits "already exists": "Demo …", then
 * "Demo … (2)", "(3)", and so on. Falls back to `base` if the lookup fails.
 */
async function resolveFreeName(
  base: string,
  listEndpoint: string,
  accessToken: string | null,
): Promise<string> {
  if (!accessToken) return base;
  try {
    const res = await fetch(`${getBackendUrl()}${listEndpoint}`, {
      method: "GET",
      headers: getDefaultHeaders(accessToken),
    });
    if (!res.ok) return base;
    const taken = new Set(
      unwrapList<{ name?: string }>(await res.json()).map((x) =>
        (x.name ?? "").trim().toLowerCase(),
      ),
    );
    return pickFreeName(base, taken);
  } catch {
    return base;
  }
}

/** Tick the Correctness evaluator in the picker and confirm. */
async function selectAndAddCorrectness(): Promise<void> {
  const dialog = await waitForElement(A.addEvaluatorsDialog, { timeout: 10000 });
  if (!dialog) return;
  const rows = Array.from(dialog.querySelectorAll<HTMLLabelElement>("label"));
  const target =
    rows.find((r) => /correct/i.test(r.textContent ?? "")) ?? rows[0];
  const checkbox = target?.querySelector<HTMLInputElement>(
    'input[type="checkbox"]',
  );
  if (checkbox && !checkbox.checked) checkbox.click();
  await delay(200);
  await clickElement(A.evaluatorsAddConfirm);
}

export function buildFirstEvalTour(deps: FirstEvalDeps): Tour {
  const steps: TourStep[] = [
    {
      title: "Welcome to Calibrate 👋",
      description: welcomeDescription(),
      actionLabel: "Start",
    },
    {
      anchor: A.newAgent,
      title: "Create an agent",
      description: "First, let us <strong>create an agent</strong> to test",
      side: "bottom",
      align: "end",
      actionLabel: "Next",
      action: async () => {
        await clickElement(A.newAgent);
        const name = await resolveFreeName(
          DEMO_AGENT_NAME,
          "/agents",
          deps.getAccessToken(),
        );
        await fillInput(A.agentNameInput, name, { timeout: 8000 });
      },
    },
    {
      anchor: A.agentTypeOptions,
      title: "Build or connect",
      description:
        "You can <strong>build a new agent</strong> right here, or <strong>connect one you already run</strong>. We will build one for this demo.",
      side: "right",
      align: "center",
      actionLabel: "Create",
      timeout: 10000,
      action: async () => {
        await clickElement(A.agentCreateSubmit);
        // The app navigates to /agents/[uuid]; later steps wait for that page.
      },
    },
    {
      anchor: A.systemPrompt,
      title: "Give it instructions",
      description:
        "This is where you <strong>tell your agent how to behave</strong>. We have popped in a sample for a community health helpline so you can see the idea.",
      side: "top",
      actionLabel: "Next",
      timeout: 15000,
      prepare: async () => {
        await fillInput(A.systemPrompt, DEMO_SYSTEM_PROMPT, { timeout: 15000 });
      },
    },
    {
      anchor: A.save,
      title: "Save your work",
      description: "Whenever you make changes, <strong>save them here</strong>",
      side: "bottom",
      align: "end",
      actionLabel: "Save",
      action: async () => {
        await clickElement(A.save);
      },
    },
    {
      anchor: A.tabEvaluators,
      title: "Add an evaluator",
      description:
        "To <strong>grade</strong> your agent automatically, Calibrate uses <strong>a strong LLM as a judge</strong>, called an evaluator. It <strong>scores each answer against a criteria</strong> you set, for example whether the answer is correct or stays polite. Let us add one.",
      side: "bottom",
      actionLabel: "Next",
      action: async () => {
        await clickElement(A.tabEvaluators);
        await clickElement(A.evaluatorsAdd, { timeout: 8000 });
      },
    },
    {
      anchor: A.addEvaluatorsDialog,
      title: "Choose what to check",
      description:
        "We will start with <strong>Correctness</strong>, which simply checks whether your agent got the answer right",
      side: "left",
      actionLabel: "Add it",
      action: async () => {
        await selectAndAddCorrectness();
      },
    },
    {
      anchor: A.tabTests,
      title: "Meet your tests",
      description:
        "This is where the real work happens. A test contains a <strong>scenario</strong> your agent can face in <strong>production</strong> and the <strong>success criteria</strong> for a good response. Let us build one together.",
      side: "bottom",
      actionLabel: "Add a test",
      prepare: async () => {
        await clickElement(A.tabTests);
      },
      action: async () => {
        await openCreateTestEditor(DEMO_TESTS[0].name, deps);
      },
    },
    {
      anchor: A.testConversation,
      title: "The scenario",
      description:
        "The <strong>scenario</strong> is the conversation your agent has to handle. Here someone is asking when the clinic opens.",
      side: "right",
      actionLabel: "Next",
      timeout: 15000,
      prepare: () => {
        fillTestScenario(DEMO_TESTS[0]);
      },
    },
    {
      anchor: A.testEvaluatorsArea,
      title: "The success criteria",
      description:
        "This is <strong>what a good answer must do</strong>. Your evaluator scores the reply against it. Let us save this test.",
      side: "left",
      actionLabel: "Create test",
      timeout: 12000,
      prepare: async () => {
        await fillByPlaceholder(
          "Criteria that the agent's response should satisfy",
          DEMO_TESTS[0].criteria,
          { timeout: 8000 },
        );
      },
      action: async () => {
        await submitCreateTest();
      },
    },
    {
      anchor: A.testRowFirst,
      title: "Add one more",
      description:
        "That is one test. Let us <strong>add a second</strong> the same way, so your agent has a couple to handle.",
      side: "bottom",
      actionLabel: "Add it",
      timeout: 12000,
      action: async () => {
        await createOneTest(DEMO_TESTS[1], deps);
      },
    },
    {
      anchor: A.testsRunAll,
      title: "Run your tests",
      description:
        "That is a test: <strong>a situation in, a graded answer out</strong>. You have two ready, so let us run them and see how your agent does.",
      side: "bottom",
      align: "end",
      actionLabel: "Run",
      timeout: 12000,
      action: async () => {
        await clickElement(A.testsRunAll);
      },
    },
    {
      anchor: A.runSummary,
      title: "Your results",
      description:
        "And there it is, your first evaluation! Up top is your <strong>pass rate</strong>, plus speed, cost, and a score from each evaluator.",
      side: "top",
      actionLabel: "Next",
      timeout: 90000,
    },
    {
      anchor: A.runTabOutputs,
      title: "See every answer",
      description:
        "The Summary is the big picture. The Outputs tab shows <strong>each test your agent ran</strong>, one by one.",
      side: "bottom",
      align: "start",
      actionLabel: "Next",
      action: async () => {
        await clickElement(A.runTabOutputs);
      },
    },
    {
      anchor: A.runOutputsList,
      title: "Passed and failed",
      description:
        "Your tests are <strong>grouped by whether they passed</strong>. Both of ours passed. Let us open one and look closer.",
      side: "right",
      align: "start",
      actionLabel: "Open one",
      timeout: 10000,
      action: async () => {
        await clickElement(A.runResultRow);
      },
    },
    {
      anchor: A.runResultDetail,
      title: "Your agent's answer",
      description:
        "This is exactly <strong>what your agent replied</strong>. It is generated fresh each time the test runs.",
      side: "left",
      actionLabel: "Next",
      timeout: 10000,
    },
    {
      anchor: A.runResultVerdict,
      title: "The evaluator's verdict",
      description:
        "And here is the evaluator's call: <strong>pass or fail, with the reason why</strong>. That reasoning is how you spot problems and keep improving your agent. The demo agent is yours to delete anytime.",
      side: "left",
      actionLabel: "Done",
      timeout: 10000,
    },
  ];

  return { id: FIRST_EVAL_TOUR_ID, steps };
}
