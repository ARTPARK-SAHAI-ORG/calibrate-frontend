/**
 * Flagship onboarding tour: "Run your first evaluation".
 *
 * Auto-drives the real app end to end, injecting sample values at each step so a
 * brand-new user watches a genuine evaluation get built and run:
 *   new agent → sample system prompt → save → Evaluators tab → Tests tab →
 *   seed two sample tests → run → read the results.
 *
 * It creates a real, clearly-labelled "Demo agent" the user can delete later.
 * Every step degrades gracefully: if an injected action fails (e.g. offline),
 * the popover still explains the step and the user can do it by hand.
 */

import { getBackendUrl, getDefaultHeaders } from "@/lib/api";
import { fetchAllEvaluators } from "@/lib/evaluatorApi";
import { reportError } from "@/lib/reportError";
import { WHATSAPP_INVITE_URL } from "@/constants/links";
import { clickElement, delay, fillInput } from "../dom";
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
    "Calibrate is an open-source evaluation platform for AI agents, text or " +
    "voice. Testing agents manually is slow and inconsistent, so Calibrate helps " +
    "you continuously improve your agent, ensure a bug never repeats itself, and " +
    "deploy with confidence." +
    "<br><br>New here? Let's run your first evaluation together. I'll spin up a " +
    'sample "Demo agent" and run it end to end, then you can delete it.' +
    `<br><br><span style="font-size:0.8rem;">${links}</span>`
  );
}

const DEMO_AGENT_NAME = "Demo agent";

const DEMO_SYSTEM_PROMPT =
  "You are a friendly customer-support assistant for an online bookstore. " +
  "Answer questions about orders, shipping, and returns concisely and politely. " +
  "If you don't know an answer, offer to connect the customer to a human.";

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
  tabTests: '[data-tour="agent-tab-tests"]',
  testsCreate: '[data-tour="tests-create"]',
  testsRunAll: '[data-tour="tests-run-all"]',
  runSummary: '[data-tour="test-run-summary"]',
} as const;

export type FirstEvalDeps = {
  accessToken: string | null;
};

// Kept in sync with AGENT_TESTS_UPDATED_EVENT in ../index (inlined to avoid a
// circular import back into the registry).
const AGENT_TESTS_UPDATED_EVENT = "calibrate:agent-tests-updated";

/**
 * Seed two sample response-type tests for the demo agent via `POST /tests/bulk`,
 * attaching the default "Correctness" next-reply evaluator when available.
 */
async function seedDemoTests(agentUuid: string, deps: FirstEvalDeps): Promise<void> {
  const backendUrl = getBackendUrl();

  let evaluatorRefs: { evaluator_uuid: string }[] = [];
  if (deps.accessToken) {
    try {
      const evaluators = await fetchAllEvaluators(deps.accessToken);
      // Prefer a built-in "Correctness" next-reply judge; fall back to any
      // built-in LLM evaluator so the sample tests are always graded.
      const builtInLlm = evaluators.filter(
        (e) => e.evaluator_type === "llm" && !e.owner_user_id,
      );
      const correctness =
        builtInLlm.find((e) => /correct/i.test(e.name)) ?? builtInLlm[0];
      if (correctness) evaluatorRefs = [{ evaluator_uuid: correctness.uuid }];
    } catch (err) {
      reportError("Demo test seeding: could not load evaluators", err);
    }
  }

  const res = await fetch(`${backendUrl}/tests/bulk`, {
    method: "POST",
    headers: {
      ...getDefaultHeaders(deps.accessToken),
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

/** Read the current agent uuid from the `/agents/[uuid]` route, if we're on it. */
function currentAgentUuid(): string | null {
  const m = window.location.pathname.match(/\/agents\/([0-9a-fA-F-]{8,})/);
  return m ? m[1] : null;
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
      description: "An agent is the assistant you want to test. Let's make one.",
      side: "bottom",
      align: "end",
      actionLabel: "New agent",
      action: async () => {
        await clickElement(A.newAgent);
      },
    },
    {
      anchor: A.agentNameInput,
      title: "Name it",
      description: `I'll name it "${DEMO_AGENT_NAME}" and create it.`,
      side: "bottom",
      actionLabel: "Create agent",
      action: async () => {
        await fillInput(A.agentNameInput, DEMO_AGENT_NAME);
        await delay(150);
        await clickElement(A.agentCreateSubmit);
        // The app navigates to /agents/[uuid]; later steps wait for that page.
      },
    },
    {
      anchor: A.systemPrompt,
      title: "Give it a system prompt",
      description:
        "The system prompt tells your agent how to behave. I'll add a sample one.",
      side: "top",
      actionLabel: "Add prompt",
      timeout: 15000,
      action: async () => {
        await fillInput(A.systemPrompt, DEMO_SYSTEM_PROMPT, { timeout: 15000 });
      },
    },
    {
      anchor: A.save,
      title: "Save the agent",
      description: "Now let's save your agent.",
      side: "bottom",
      align: "end",
      actionLabel: "Save",
      action: async () => {
        await clickElement(A.save);
      },
    },
    {
      anchor: A.tabEvaluators,
      title: "Evaluators score conversations",
      description:
        "Evaluators are the judges that score each reply. Your tests use them automatically.",
      side: "bottom",
      actionLabel: "Next",
      action: async () => {
        await clickElement(A.tabEvaluators);
      },
    },
    {
      anchor: A.tabTests,
      title: "Now let's add tests",
      description:
        "Tests are the situations your agent should handle. I'll add two samples.",
      side: "bottom",
      actionLabel: "Add tests",
      action: async () => {
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
      anchor: A.testsRunAll,
      title: "Run the evaluation",
      description: "Now let's run them and see how your agent does.",
      side: "bottom",
      align: "end",
      actionLabel: "Run tests",
      timeout: 12000,
      action: async () => {
        await clickElement(A.testsRunAll);
      },
    },
    {
      anchor: A.runSummary,
      title: "Read the results",
      description:
        "Here's how your agent did: the pass rate, plus speed, cost, and a score from each evaluator. Open any test to see why it passed or failed. You can delete the demo agent anytime.",
      side: "top",
      actionLabel: "Done",
      timeout: 90000,
    },
  ];

  return { id: FIRST_EVAL_TOUR_ID, steps };
}
