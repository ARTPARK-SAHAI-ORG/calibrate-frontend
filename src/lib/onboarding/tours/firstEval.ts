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

import { getBackendUrl, getDefaultHeaders } from "@/lib/api";
import { fetchAgentEvaluators } from "@/lib/evaluatorApi";
import { reportError } from "@/lib/reportError";
import { WHATSAPP_INVITE_URL } from "@/constants/links";
import { clickElement, delay, fillInput, waitForElement } from "../dom";
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
    "<div>Calibrate helps you check that your AI agent actually does its job, " +
    "whether it types or talks. Testing by hand is tedious and easy to get " +
    "wrong, so we do it for you.</div>" +
    '<div style="margin-top:0.6em;">Want to see how it works? Let us build a ' +
    "quick demo agent and put it through its paces together. Takes about a " +
    "minute, and you can delete it after.</div>" +
    `<div style="margin-top:0.6em;font-size:0.8rem;">${links}</div>`
  );
}

const DEMO_AGENT_NAME = "Demo agent";

const DEMO_SYSTEM_PROMPT =
  "You are a friendly customer-support assistant for an online bookstore. " +
  "Answer questions about orders, shipping, and returns concisely and politely. " +
  "If you do not know an answer, offer to connect the customer to a human.";

const DEMO_TESTS: { name: string; userMessage: string }[] = [
  { name: "Demo · shipping time", userMessage: "How long does standard shipping take?" },
  { name: "Demo · return policy", userMessage: "Can I return a book I already opened?" },
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

// Kept in sync with AGENT_TESTS_UPDATED_EVENT in ../index (inlined to avoid a
// circular import back into the registry).
const AGENT_TESTS_UPDATED_EVENT = "calibrate:agent-tests-updated";

/**
 * Seed two sample response-type tests for the demo agent via `POST /tests/bulk`,
 * grading them with the evaluator already attached to the agent (step 7). Using
 * the agent's evaluator (the org's own copy) avoids referencing a global
 * default the workspace cannot use, which the backend rejects with 403.
 */
async function seedDemoTests(agentUuid: string, deps: FirstEvalDeps): Promise<void> {
  const backendUrl = getBackendUrl();
  const accessToken = deps.getAccessToken();

  let evaluatorRefs: { evaluator_uuid: string }[] = [];
  if (accessToken) {
    try {
      const agentEvaluators = await fetchAgentEvaluators(agentUuid, accessToken);
      const grader =
        agentEvaluators.find((e) => e.evaluator_type === "llm") ??
        agentEvaluators[0];
      if (grader) evaluatorRefs = [{ evaluator_uuid: grader.uuid }];
    } catch (err) {
      reportError("Demo test seeding: could not load agent evaluators", err);
    }
  }

  const res = await fetch(`${backendUrl}/tests/bulk`, {
    method: "POST",
    headers: {
      ...getDefaultHeaders(accessToken),
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      type: "response",
      agent_uuids: [agentUuid],
      tests: DEMO_TESTS.map((t) => ({
        name: t.name,
        conversation_history: [{ role: "user", content: t.userMessage }],
        evaluators: evaluatorRefs,
      })),
    }),
  });
  if (!res.ok) throw new Error(`Seeding demo tests failed (${res.status})`);
  window.dispatchEvent(new Event(AGENT_TESTS_UPDATED_EVENT));
}

/** Read the current agent uuid from the `/agents/[uuid]` route, if we are on it. */
function currentAgentUuid(): string | null {
  const m = window.location.pathname.match(/\/agents\/([0-9a-fA-F-]{8,})/);
  return m ? m[1] : null;
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
      description: "First, let us create an agent to test",
      side: "bottom",
      align: "end",
      actionLabel: "Next",
      action: async () => {
        await clickElement(A.newAgent);
        await fillInput(A.agentNameInput, DEMO_AGENT_NAME, { timeout: 8000 });
      },
    },
    {
      anchor: A.agentTypeOptions,
      title: "Build or connect",
      description:
        "You can build a new agent right here, or connect one you already run. We will build one for this demo.",
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
        "This is where you tell your agent how to behave. We have popped in a sample for a customer-support assistant so you can see the idea.",
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
      description: "Whenever you make changes, save them here",
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
        "To grade your agent automatically, Calibrate uses a strong LLM as a judge, called an evaluator. It scores each answer against a criteria you set, for example whether the answer is correct or stays polite. Let us add one.",
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
        "We will start with Correctness, which simply checks whether your agent got the answer right",
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
        "This is where the real work happens. A test is simply a situation you want your agent to handle well, paired with a check on whether it nailed it. Let us add a couple to see.",
      side: "bottom",
      actionLabel: "Next",
      prepare: async () => {
        await clickElement(A.tabTests);
        const uuid = currentAgentUuid();
        if (uuid) {
          try {
            await seedDemoTests(uuid, deps);
            await delay(400);
          } catch (err) {
            reportError("Onboarding: demo test seeding failed", err);
          }
        }
      },
    },
    {
      anchor: A.testRowFirst,
      title: "Your two sample tests",
      description:
        "Here they are: one asks about shipping, the other about returns. Let us open one up and look inside.",
      side: "bottom",
      actionLabel: "Open one",
      timeout: 12000,
      action: async () => {
        await clickElement(A.testRowFirst);
      },
    },
    {
      anchor: A.testConversation,
      title: "The customer's message",
      description:
        "This is what the customer says. When you run the test, your agent will reply to exactly this.",
      side: "right",
      actionLabel: "Next",
      timeout: 15000,
    },
    {
      anchor: A.testEvaluatorsArea,
      title: "How it is graded",
      description:
        "And here is the evaluator doing the grading, our Correctness judge from earlier. It decides whether the reply was right.",
      side: "left",
      actionLabel: "Got it",
      action: async () => {
        await clickElement(A.testEditorClose);
      },
    },
    {
      anchor: A.testsRunAll,
      title: "Run your tests",
      description:
        "That is a test: a situation in, a graded answer out. You have two ready, so let us run them and see how your agent does.",
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
        "And there it is, your first evaluation! Up top is your pass rate, plus speed, cost, and a score from each evaluator.",
      side: "top",
      actionLabel: "Next",
      timeout: 90000,
    },
    {
      anchor: A.runTabOutputs,
      title: "See every answer",
      description:
        "The Summary is the big picture. The Outputs tab shows each test your agent ran, one by one.",
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
        "Your tests are grouped by whether they passed. Both of ours passed. Let us open one and look closer.",
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
        "This is exactly what your agent replied. It is generated fresh each time the test runs.",
      side: "left",
      actionLabel: "Next",
      timeout: 10000,
    },
    {
      anchor: A.runResultVerdict,
      title: "The evaluator's verdict",
      description:
        "And here is the evaluator's call: pass or fail, with the reason why. That reasoning is how you spot problems and keep improving your agent. The demo agent is yours to delete anytime.",
      side: "left",
      actionLabel: "Done",
      timeout: 10000,
    },
  ];

  return { id: FIRST_EVAL_TOUR_ID, steps };
}
