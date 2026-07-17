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
import { isDefaultLLMNextReplyEvaluator } from "@/lib/defaultEvaluators";
import { WHATSAPP_INVITE_URL } from "@/constants/links";
import {
  clickByText,
  clickElement,
  delay,
  fillAllByPlaceholderPrefix,
  fillByPlaceholder,
  fillInput,
  setNativeValue,
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
  const bodyStyle = 'style="line-height:1.55;"';
  const gapStyle = 'style="margin-top:0.75em;line-height:1.55;"';
  return (
    `<div ${bodyStyle}>Calibrate checks that your AI agent <strong>performs as intended</strong>.</div>` +
    `<div ${gapStyle}><strong>Manual</strong> testing is tedious, <strong>doesn't scale</strong>, and lets mistakes slip through.</div>` +
    `<div ${gapStyle}>With Calibrate, you run structured, repeatable evals that <strong>catch issues before deploy</strong> so you can ship with confidence and find the <strong>best model for every component</strong> of your agent, tailored to your use case.</div>` +
    `<div ${gapStyle}>Want to see how it works? Let us build a ` +
    "<strong>quick demo agent</strong> and test it together.</div>" +
    `<div style="margin-top:0.75em;font-size:0.8rem;">${links}</div>`
  );
}

const DEMO_AGENT_NAME = "Community Clinic Helpline";

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
    // Designed to fail: the agent was never given a phone number, so it cannot
    // provide one (and a good model will not invent one). That obvious gap is
    // the point: it shows evaluations catching real problems.
    name: "Demo · phone number it lacks",
    userMessage: "What is the clinic's phone number?",
    agentMessage: "Happy to help with that.",
    criteria: "Gives the caller the clinic's phone number.",
  },
];

// Criteria the tour writes into the SECOND evaluator's field so the tour
// controls what that check grades. It is a mild "conciseness" bar every demo
// answer clears (the short clinic-hours reply, the pre-fix "Happy to help", and
// the post-fix phone number are all concise), so the second check always passes
// and the failing-then-passing story is driven solely by Correctness. Without
// this, a picked evaluator's own baked criteria (e.g. "exactly one question")
// could fail the demo answers and break the walkthrough.
const DEMO_SECOND_CRITERIA =
  "The reply is concise and free of rambling or filler.";

// The fix appended to the system prompt to close the gap the failing test
// found: the agent was never given a phone number, so it could not answer.
const DEMO_PROMPT_FIX = " Our clinic helpline number is 1800-123-4567.";

// The built-in next-reply Correctness default's name — used both as a fallback
// when the library lookup fails and as the name to recreate it under if a
// workspace has deleted it.
const CORRECTNESS_NAME = "Correctness";
const CORRECTNESS_DESCRIPTION = "Does the answer get it right?";
// Its single criteria variable (the tour sets its value per test).
const CORRECTNESS_CRITERIA_VARIABLE = {
  name: "criteria",
  description: "Criteria that the agent's response should satisfy",
};
// Fallback judge prompt (mirrors the seeded default) if the backend's
// default-prompt endpoint is unavailable when recreating Correctness.
const CORRECTNESS_FALLBACK_PROMPT =
  "You are a highly accurate evaluator evaluating the response of an agent to a " +
  "user's message.\n\nYou will be given a conversation between a user and an " +
  "agent along with the response of the agent to the final user message.\n\nYou " +
  "need to evaluate if the response adheres to the evaluation criteria:\n\n" +
  "{{criteria}}";

// The evaluator name goes into a card's description HTML, so escape it (names are
// user-authored). driver.js renders the description as raw HTML.
function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

// Anchors (kept here so component `data-tour` attributes and steps stay in sync).
export const A = {
  newAgent: '[data-tour="new-agent"]',
  agentNameInput: '[data-tour="agent-name-input"]',
  agentCreateSubmit: '[data-tour="agent-create-submit"]',
  systemPrompt: '[data-tour="agent-system-prompt"]',
  save: '[data-tour="agent-save"]',
  tabAgent: '[data-tour="agent-tab-agent"]',
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
  runClose: '[data-tour="run-close"]',
  startTour: '[data-tour="start-tour"]',
  runSummary: '[data-tour="test-run-summary"]',
  runTabOutputs: '[data-tour="run-tab-outputs"]',
  runOutputsList: '[data-tour="run-outputs-list"]',
  runResultRow: '[data-tour="run-result-row"]',
  runResultDetail: '[data-tour="run-result-detail"]',
  runResultVerdict: '[data-tour="run-result-verdict"]',
  // The expanded reasoning body (shared verdict-card attribute, not a data-tour).
  runReasoningBody: "[data-reasoning-body]",
} as const;

/**
 * What the flow adapts to, resolved from the workspace's evaluator library once,
 * before the tour is built:
 *  - `correctnessName`: the CURRENT display name of the built-in next-reply
 *    Correctness default, found by its stable slug (so a user renaming it does
 *    not break the flow), or `null` if the user has deleted it — in which case
 *    the flow silently recreates it before proceeding.
 *  - `secondEvaluatorName`: the exact name of a second LLM-reply evaluator to add
 *    alongside Correctness (a "conciseness"-style check), or null if none exists
 *    — in which case the flow uses Correctness alone and never invents a second.
 */
export type EvaluatorPlan = {
  correctnessName: string | null;
  secondEvaluatorName: string | null;
};

type EvaluatorLike = {
  name?: string;
  evaluator_type?: string;
  slug?: string | null;
  source_default_slug?: string | null;
};

// The second check must be a genuine "Conciseness" evaluator. Match the WHOLE
// word (so "Reply Conciseness" or "Conciseness" qualify) but NOT names that
// merely contain the letters — e.g. a throwaway "Conciseness2" or "Concise" must
// be ignored, otherwise the tour would grade against an evaluator the user did
// not mean.
const CONCISENESS_NAME = /\bconciseness\b/i;

/**
 * Decide the evaluator plan from the library list. Pure, so it is unit-testable.
 * Correctness is identified by its stable origin slug — NOT its display name — so
 * a renamed default is still found. The second evaluator must be an LLM-reply
 * evaluator (only those grade a next-reply test) whose name contains the whole
 * word "Conciseness", and must not be the Correctness default itself.
 */
export function planFromEvaluators(list: EvaluatorLike[]): EvaluatorPlan {
  const llm = list.filter((e) => e.evaluator_type === "llm");
  const correctness = llm.find((e) => isDefaultLLMNextReplyEvaluator(e));
  const second = llm.find(
    (e) =>
      CONCISENESS_NAME.test(e.name ?? "") && !isDefaultLLMNextReplyEvaluator(e),
  );
  return {
    correctnessName: correctness?.name ?? null,
    secondEvaluatorName: second?.name ?? null,
  };
}

/**
 * Fetch the workspace evaluators and resolve the plan. Falls back to the built-in
 * "Correctness" default, second-check-free (the safe path — one reliable,
 * tour-controlled check) if the token is missing or the request fails, so the
 * tour never blocks on the lookup.
 */
export async function resolveEvaluatorPlan(
  accessToken: string | null,
): Promise<EvaluatorPlan> {
  const fallback: EvaluatorPlan = {
    correctnessName: CORRECTNESS_NAME,
    secondEvaluatorName: null,
  };
  if (!accessToken) return fallback;
  try {
    const res = await fetch(
      `${getBackendUrl()}/evaluators?include_defaults=true`,
      { method: "GET", headers: getDefaultHeaders(accessToken) },
    );
    if (!res.ok) return fallback;
    return planFromEvaluators(unwrapList<EvaluatorLike>(await res.json()));
  } catch {
    return fallback;
  }
}

/** What the backend's default-prompt endpoint returns for a purpose. */
type DefaultPrompt = {
  system_prompt?: string;
  judge_model?: string;
  output_type?: "binary" | "rating";
};

/**
 * Ensure the judge prompt actually references the `{{criteria}}` VARIABLE. The
 * backend's default-prompt endpoint returns a human placeholder instead (e.g.
 * "<ENTER EVALUATION CRITERIA HERE>"), which would leave the criteria variable
 * declared-but-unused — so the tour's per-test criterion would never reach the
 * judge. Wire that placeholder to `{{criteria}}`; if we cannot, use the
 * hard-coded fallback that already contains it. Exported for unit testing.
 */
export function ensureCriteriaVariable(prompt: string | undefined): string {
  const p = (prompt ?? "").trim();
  if (!p) return CORRECTNESS_FALLBACK_PROMPT;
  if (p.includes("{{criteria}}")) return p;
  const wired = p.replace(/<[^>]*criteria[^>]*>/i, "{{criteria}}");
  return wired.includes("{{criteria}}") ? wired : CORRECTNESS_FALLBACK_PROMPT;
}

/**
 * Build the `POST /evaluators` body for recreating the Correctness default,
 * mirroring what the Create Evaluator flow sends. Pure, so it is unit-testable.
 * Uses the backend's canonical judge model when available and a prompt that is
 * guaranteed to reference the single `{{criteria}}` variable the tour fills per
 * test. `name` lets the caller avoid colliding with an existing evaluator.
 */
export function buildCorrectnessPayload(
  dp: DefaultPrompt | null,
  name: string = CORRECTNESS_NAME,
): {
  name: string;
  description: string;
  evaluator_type: "llm";
  data_type: "text";
  kind: "single";
  output_type: "binary" | "rating";
  version: {
    judge_model?: string;
    system_prompt: string;
    variables: { name: string; description: string }[];
  };
} {
  return {
    name,
    description: CORRECTNESS_DESCRIPTION,
    evaluator_type: "llm",
    data_type: "text",
    kind: "single",
    output_type: dp?.output_type ?? "binary",
    version: {
      ...(dp?.judge_model ? { judge_model: dp.judge_model } : {}),
      system_prompt: ensureCriteriaVariable(dp?.system_prompt),
      variables: [CORRECTNESS_CRITERIA_VARIABLE],
    },
  };
}

/**
 * Recreate a proper Correctness evaluator when the workspace has no built-in one
 * — either it was deleted, OR the user replaced it with a custom evaluator that
 * does not carry the default slug (so the plan cannot find it). In both cases the
 * tour needs a check whose `{{criteria}}` it controls, so it creates its own.
 *
 * Crucially it picks a FREE name (the backend rejects duplicate names, and a
 * user's own "Correctness" would otherwise both collide and, if we reused the
 * name, get picked instead of ours). Returns the name actually created so the
 * tour picks THAT exact evaluator — or null on any failure (best-effort; the
 * tour then degrades gracefully).
 */
async function createCorrectnessEvaluator(
  accessToken: string | null,
): Promise<string | null> {
  if (!accessToken) return null;
  try {
    let dp: DefaultPrompt | null = null;
    const dpRes = await fetch(
      `${getBackendUrl()}/evaluators/default-prompt?purpose=llm`,
      { method: "GET", headers: getDefaultHeaders(accessToken) },
    );
    if (dpRes.ok) dp = (await dpRes.json()) as DefaultPrompt;
    // Without a judge model the backend rejects the create, so only proceed when
    // the default-prompt lookup gave us one.
    if (!dp?.judge_model) return null;
    // Avoid colliding with an existing evaluator named "Correctness" (e.g. the
    // user's own custom one). Pick a free name and create under it.
    const name = await resolveFreeName(
      CORRECTNESS_NAME,
      "/evaluators",
      accessToken,
    );
    const res = await fetch(`${getBackendUrl()}/evaluators`, {
      method: "POST",
      headers: {
        ...getDefaultHeaders(accessToken),
        "Content-Type": "application/json",
      },
      body: JSON.stringify(buildCorrectnessPayload(dp, name)),
    });
    return res.ok ? name : null;
  } catch {
    /* best-effort: the tour proceeds without it */
    return null;
  }
}

export type FirstEvalDeps = {
  // A getter, not a snapshot: the tour is built once but its API calls fire
  // seconds later, so it must read the token fresh (it may still be hydrating
  // when the tour starts).
  getAccessToken: () => string | null;
  // The evaluator plan, resolved before the tour is built (see resolveEvaluatorPlan).
  plan: EvaluatorPlan;
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
 * Fill the system prompt with the sample and KEEP it filled for a short window.
 * A freshly created agent's detail page loads its own default prompt ("You are a
 * helpful assistant.") asynchronously; if that GET resolves AFTER we fill, it
 * clobbers our sample (AgentDetail sets `systemPrompt` from the response). We
 * fill immediately so the card shows the sample right away, then re-apply on a
 * background interval so a late load is corrected without blocking the step.
 * Exported for unit testing. Returns after the initial fill; the guard runs on.
 */
export async function fillSystemPromptResilient(
  value: string,
  { checks = 25, intervalMs = 100 } = {},
): Promise<void> {
  const ok = await fillInput(A.systemPrompt, value, { timeout: 15000 });
  if (!ok) return;
  let n = 0;
  const id = window.setInterval(() => {
    const el = document.querySelector<HTMLElement>(A.systemPrompt);
    if (
      (el instanceof HTMLTextAreaElement || el instanceof HTMLInputElement) &&
      el.value.trim() !== value.trim()
    ) {
      el.focus();
      setNativeValue(el, value);
    }
    if (++n >= checks) window.clearInterval(id);
  }, intervalMs);
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

/** Submit the open Create Test editor. */
async function submitCreateTest(): Promise<void> {
  await clickByText("Create", { timeout: 8000 });
  // No "Update default evaluators?" prompt to handle: the tour already attached
  // Correctness to the agent (step 7) and the demo tests reference only that
  // evaluator, so every evaluator the test uses is already a default.
  await delay(300);
}

/** Return `base`, or the first free "base (N)" variant not in `taken`. */
export function pickFreeName(base: string, taken: Set<string>): string {
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

// Only "LLM reply" evaluators (the pill label for `evaluator_type === "llm"`)
// actually grade a next-reply test: the test dialog seeds evaluators filtered to
// that type and silently drops "Full conversation" / "LLM output" ones. So the
// second pick MUST be an LLM-reply evaluator, otherwise the card's claim that
// both checks grade the test would be false — one would be ignored at run time.
const LLM_REPLY_TYPE_LABEL = /LLM\s*reply/i;

/** True if a picker row is an LLM-reply evaluator (grades a next-reply test). */
export function isLlmReplyRow(row: HTMLLabelElement): boolean {
  return LLM_REPLY_TYPE_LABEL.test(row.textContent ?? "");
}

/** True if a picker row's checkbox is currently unticked. */
function isRowUnchecked(row: HTMLLabelElement): boolean {
  const cb = row.querySelector<HTMLInputElement>('input[type="checkbox"]');
  return !!cb && !cb.checked;
}

/**
 * Choose the evaluator row to tick by its EXACT name (the name resolved into the
 * plan), restricted to unticked LLM-reply rows so it actually grades the
 * next-reply test. The match is on the row's name element being exactly `name` —
 * NOT merely containing it — so "Conciseness" never ticks a "Conciseness2" row,
 * and so the tour never ticks an unrelated evaluator whose criteria it cannot
 * control. Pure; returns the row or undefined.
 */
export function chooseRowByName(
  rows: HTMLLabelElement[],
  name: string,
): HTMLLabelElement | undefined {
  const target = name.trim().toLowerCase();
  if (!target) return undefined;
  // A row's name lives in its own element; match that element's text exactly
  // rather than the whole row (which also holds the type pill + description).
  const hasExactName = (row: HTMLLabelElement): boolean =>
    Array.from(row.querySelectorAll<HTMLElement>("*")).some(
      (el) => (el.textContent ?? "").trim().toLowerCase() === target,
    );
  return rows
    .filter((r) => isRowUnchecked(r) && isLlmReplyRow(r))
    .find(hasExactName);
}

/**
 * Scroll a picker row into view, tick its checkbox, and light the row up clearly
 * (green "selected" tint + ring) so it is obvious which evaluator was just
 * picked. The highlight goes away when the dialog closes, so no cleanup needed.
 */
function tickRow(row: HTMLLabelElement | undefined): void {
  if (!row) return;
  row.scrollIntoView({ block: "center" });
  const checkbox = row.querySelector<HTMLInputElement>('input[type="checkbox"]');
  if (checkbox && !checkbox.checked) checkbox.click();
  row.style.borderRadius = "8px";
  row.style.transition = "background-color 0.15s ease";
  row.style.backgroundColor = "color-mix(in srgb, #22c55e 20%, transparent)";
  row.style.boxShadow = "inset 0 0 0 2px color-mix(in srgb, #22c55e 60%, transparent)";
}

/**
 * Tick the Correctness evaluator. Falls back to the first LLM-reply row (not just
 * any row) so the pick always grades the next-reply demo test — see
 * `LLM_REPLY_TYPE_LABEL`.
 */
/** Tick an evaluator in the picker, matched by the exact name from the plan. */
async function pickEvaluatorByName(name: string): Promise<void> {
  const dialog = await waitForElement(A.addEvaluatorsDialog, { timeout: 10000 });
  if (!dialog) return;
  const rows = Array.from(dialog.querySelectorAll<HTMLLabelElement>("label"));
  tickRow(chooseRowByName(rows, name));
}

/**
 * Fill the success-criteria fields inside the open Create Test editor, per
 * evaluator card (each attached evaluator renders as one card holding its name
 * and its criteria field). Correctness gets the scenario's own criterion; any
 * other evaluator gets the tour's benign second criterion — OVERWRITING whatever
 * that evaluator shipped with, so the tour controls what the second check grades
 * and it passes on every demo answer. Setting by card identity (not field order)
 * keeps this correct however the editor lays the cards out.
 */
function fillEvaluatorCriteria(primary: string, correctnessName: string): void {
  const area = document.querySelector<HTMLElement>(A.testEvaluatorsArea);
  if (!area) return;
  const target = correctnessName.trim().toLowerCase();
  const cards = Array.from(area.children) as HTMLElement[];
  cards.forEach((card) => {
    const field = card.querySelector<HTMLTextAreaElement | HTMLInputElement>(
      "textarea, input[type='text']",
    );
    if (!field) return;
    // Identify Correctness by its resolved name (rename-safe), not the literal
    // word "correct".
    const isCorrectness = (card.textContent ?? "")
      .toLowerCase()
      .includes(target);
    setNativeValue(field, isCorrectness ? primary : DEMO_SECOND_CRITERIA);
  });
}

/**
 * Expand the reasoning on the failed evaluator's verdict card (falling back to
 * the first one) so the tour can highlight it. Prefers the card that shows a
 * "Fail" verdict, since that is the one the walkthrough is talking about.
 */
function expandFailedReasoning(): void {
  const panel = document.querySelector<HTMLElement>(A.runResultVerdict);
  if (!panel) return;
  const toggles = Array.from(
    panel.querySelectorAll<HTMLButtonElement>("button"),
  ).filter((b) => /see reasoning/i.test(b.textContent ?? ""));
  if (toggles.length === 0) return;
  const failToggle =
    toggles.find((b) => {
      // Walk up a few levels to the evaluator card and check its verdict.
      let el: HTMLElement | null = b;
      for (let i = 0; i < 4 && el; i++) {
        if (/\bfail\b/i.test(el.textContent ?? "")) return true;
        el = el.parentElement;
      }
      return false;
    }) ?? toggles[0];
  failToggle.click();
}

/** Open the previously-failing phone-number test result in the outputs list. */
function openPhoneNumberResult(): void {
  const rows = Array.from(
    document.querySelectorAll<HTMLButtonElement>('[data-tour="run-result-row"]'),
  );
  const target =
    rows.find((r) => /phone number/i.test(r.textContent ?? "")) ?? rows[0];
  target?.click();
}

/**
 * Append the fix to the system prompt and select the added text so the user can
 * see exactly what changed.
 */
async function appendPromptFix(): Promise<void> {
  const el = await waitForElement(A.systemPrompt, { timeout: 12000 });
  if (
    !(el instanceof HTMLTextAreaElement) &&
    !(el instanceof HTMLInputElement)
  ) {
    return;
  }
  const base = el.value.replace(/\s+$/, "");
  const next = `${base}${DEMO_PROMPT_FIX}`;
  setNativeValue(el, next);
  // Let React's re-render from the input event settle first, otherwise it resets
  // the caret and the selection of the new line is lost.
  await delay(80);
  const selectNewLine = () => {
    el.focus();
    try {
      // Select only the appended line so the user sees exactly what changed.
      el.setSelectionRange(base.length, next.length);
    } catch {
      /* selection not supported on this element */
    }
  };
  selectNewLine();
  // Re-apply after the popover renders and steals focus, so the highlighted
  // selection of the new line stays visible rather than graying out.
  window.setTimeout(selectNewLine, 300);
}

export function buildFirstEvalTour(deps: FirstEvalDeps): Tour {
  // The flow adapts to the workspace: add a second check only when a suitable
  // (conciseness) evaluator exists; otherwise use Correctness alone.
  const secondName = deps.plan.secondEvaluatorName;
  // Correctness is identified by its CURRENT name (rename-safe). If the workspace
  // deleted it (null), recreate it under its default name before the picker opens.
  const needsCorrectness = deps.plan.correctnessName === null;
  const correctnessName = deps.plan.correctnessName ?? CORRECTNESS_NAME;
  // Mutable: when Correctness is recreated we may create it under a free,
  // non-colliding name; the later pick + criteria steps must target whatever we
  // actually created, not the placeholder name.
  const correctness = { name: correctnessName };
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
        "You can <strong>build</strong> a new agent right here, or <strong>connect</strong> one you already run. We will build one for this demo.",
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
        "Our demo agent is a <strong>community health clinic</strong> helpline: it answers callers' questions about hours, services, and appointments. This is where you tell it <strong>how to behave</strong>, and we have added a sample so you can see how it works.",
      side: "top",
      actionLabel: "Next",
      timeout: 15000,
      prepare: async () => {
        // Resilient fill: the freshly created agent's default prompt loads
        // asynchronously and would otherwise clobber our sample (see the helper).
        await fillSystemPromptResilient(DEMO_SYSTEM_PROMPT);
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
        "To <strong>grade</strong> your agent automatically, Calibrate uses a strong LLM as a judge, called an evaluator. It <strong>scores each answer</strong> against a criteria you set, for example whether the answer is correct or stays polite. Let us add one.",
      side: "bottom",
      actionLabel: "Next",
      prepare: async () => {
        // If the workspace has no built-in Correctness (deleted, or replaced by a
        // custom evaluator without the default slug), silently recreate a proper
        // one now — under a free name — so it is in the picker the next click
        // opens, and remember that name so the pick + criteria target it.
        if (needsCorrectness) {
          const created = await createCorrectnessEvaluator(deps.getAccessToken());
          if (created) correctness.name = created;
        }
      },
      action: async () => {
        await clickElement(A.tabEvaluators);
        await clickElement(A.evaluatorsAdd, { timeout: 8000 });
      },
    },
    {
      anchor: A.addEvaluatorsDialog,
      title: "Choose what to check",
      description: secondName
        ? `These are the checks you can grade your agent with. First, <strong>${escapeHtml(
            correctnessName,
          )}</strong>: does the answer get it right?`
        : `These are the checks you can grade your agent with. We will use <strong>${escapeHtml(
            correctnessName,
          )}</strong>: does the answer get it right?`,
      side: "left",
      actionLabel: "Pick it",
      action: async () => {
        await pickEvaluatorByName(correctness.name);
      },
    },
    // Only add a second check when the workspace actually has one to add.
    ...(secondName
      ? [
          {
            anchor: A.addEvaluatorsDialog,
            title: "Add another check",
            description: `${escapeHtml(
              correctnessName,
            )} is ticked. Now add <strong>${escapeHtml(
              secondName,
            )}</strong> as a second, independent check, so you grade more than one aspect of the reply.`,
            side: "left" as const,
            actionLabel: "Pick it",
            action: async () => {
              await pickEvaluatorByName(secondName);
            },
          },
        ]
      : []),
    {
      anchor: A.addEvaluatorsDialog,
      title: secondName ? "Add them to your agent" : "Add it to your agent",
      description: secondName
        ? "Both checks are ticked. Let us <strong>add them</strong> so every test grades the reply on both."
        : `${escapeHtml(
            correctnessName,
          )} is ticked. Let us <strong>add it</strong> so every test grades the reply. You can <strong>add more checks</strong> anytime.`,
      side: "left",
      actionLabel: secondName ? "Add them" : "Add it",
      action: async () => {
        await clickElement(A.evaluatorsAddConfirm);
      },
    },
    {
      anchor: A.tabTests,
      title: "Create your first test",
      description:
        "A test is made of two things: a <strong>scenario</strong> your agent may face, and the <strong>success criteria</strong> for a good response. Let us build one together.",
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
      title: "How your test is graded",
      description: secondName
        ? "Your evaluators grade this reply, each against its own <strong>success criterion</strong>. You can <strong>add more checks</strong> anytime to cover other aspects. Let us save this test."
        : "Your evaluator grades this reply against a <strong>success criterion</strong>. You can <strong>add more checks</strong> anytime to cover other aspects. Let us save this test.",
      side: "left",
      actionLabel: "Create test",
      timeout: 12000,
      prepare: async () => {
        await fillByPlaceholder(
          "Criteria that the agent's response should satisfy",
          DEMO_TESTS[0].criteria,
          { timeout: 8000 },
        );
        fillEvaluatorCriteria(DEMO_TESTS[0].criteria, correctness.name);
      },
      action: async () => {
        await submitCreateTest();
      },
    },
    {
      anchor: A.testRowFirst,
      title: "Add a test it should fail",
      description:
        "Tests are most useful when they <strong>catch problems</strong>. Let us add a second test we expect the agent to <strong>fail</strong>, and build it the same way.",
      side: "bottom",
      actionLabel: "Add it",
      timeout: 12000,
      action: async () => {
        await openCreateTestEditor(DEMO_TESTS[1].name, deps);
      },
    },
    {
      anchor: A.testConversation,
      title: "A scenario it cannot answer",
      description:
        "Here the caller asks for the <strong>clinic's phone number</strong>, something the agent was never given. Let us see how it responds to a question it cannot answer.",
      side: "right",
      actionLabel: "Next",
      timeout: 15000,
      prepare: () => {
        fillTestScenario(DEMO_TESTS[1]);
      },
    },
    {
      anchor: A.testEvaluatorsArea,
      title: "Require what it cannot give",
      description:
        "The criteria asks it to give the <strong>phone number</strong>. The agent was never given one, so this test should <strong>fail</strong>. That is exactly the kind of gap an evaluation is meant to surface. Let us save it.",
      side: "left",
      actionLabel: "Create test",
      timeout: 12000,
      prepare: async () => {
        await fillByPlaceholder(
          "Criteria that the agent's response should satisfy",
          DEMO_TESTS[1].criteria,
          { timeout: 8000 },
        );
        fillEvaluatorCriteria(DEMO_TESTS[1].criteria, correctness.name);
      },
      action: async () => {
        await submitCreateTest();
      },
    },
    {
      anchor: A.testsRunAll,
      title: "Run your tests",
      description:
        "Both tests are ready, one your agent should <strong>pass</strong> and one it should <strong>fail</strong>. Let us run them and see how it does.",
      side: "bottom",
      align: "end",
      actionLabel: "Run",
      timeout: 12000,
      action: async () => {
        await clickElement(A.testsRunAll);
      },
    },
    {
      // No anchor: pinned over the run dialog's centre spinner via
      // `calibrate-tour-running`. Auto-advances to the results once the run
      // finishes (no button while there is nothing to show yet).
      title: "Running your tests",
      description:
        "Each test is running now. For every one, the scenario goes to <strong>your agent</strong> and its reply is checked by the <strong>evaluators</strong>. This will only take a moment.",
      popoverClass: "calibrate-tour-running",
      autoAdvance: true,
      action: async () => {
        await waitForElement(A.runSummary, { timeout: 90000 });
      },
    },
    {
      anchor: A.runSummary,
      title: "The results are ready 🎉",
      description:
        "Your first evaluation is done! 🥳 This test summary shows your overall <strong>pass rate</strong>, along with speed and cost. One test passed and one failed, so you can already see where the agent needs work.",
      side: "top",
      actionLabel: "Next",
      timeout: 90000,
    },
    {
      anchor: A.runTabOutputs,
      title: "See every answer",
      description:
        "That was the overview. The <strong>Outputs</strong> tab shows <strong>each test</strong> your agent ran, one by one.",
      side: "bottom",
      align: "start",
      actionLabel: "Next",
      prepare: async () => {
        // Open the Outputs tab now so it is the active tab while this card
        // describes it (rather than only switching on the next click).
        await clickElement(A.runTabOutputs);
      },
    },
    {
      // The Failed group renders first, so the first result row is the failing
      // test. Anchor to it directly so the failed case itself is highlighted.
      anchor: A.runResultRow,
      title: "Review your failed test",
      description:
        "Your tests are <strong>grouped</strong> by whether they passed. Here is the <strong>failed</strong> one. Let us open it and see exactly why.",
      side: "right",
      align: "start",
      actionLabel: "Open it",
      timeout: 10000,
      action: async () => {
        await clickElement(A.runResultRow);
      },
    },
    {
      anchor: A.runResultDetail,
      title: "Your agent's answer",
      description:
        "This is exactly what your <strong>agent replied</strong>. It is generated fresh each time the test runs.",
      side: "left",
      actionLabel: "Next",
      timeout: 10000,
    },
    {
      anchor: A.runResultVerdict,
      title: "The evaluator's verdict",
      description:
        "Each evaluator gives its verdict here: <strong>pass or fail</strong>. To see why it decided that, open its reasoning.",
      side: "left",
      actionLabel: "See reasoning",
      timeout: 10000,
      action: async () => {
        // Expand the failed evaluator's reasoning now so the next card can
        // anchor to it immediately (rather than waiting for an anchor that does
        // not exist yet).
        expandFailedReasoning();
        await waitForElement(A.runReasoningBody, { timeout: 4000 });
      },
    },
    {
      anchor: A.runReasoningBody,
      title: "See the reasoning",
      description:
        "This is the evaluator's <strong>full reasoning</strong> for its verdict. Reading it is how you understand a failure and decide what to fix.",
      side: "left",
      actionLabel: "Next",
      timeout: 8000,
    },
    {
      anchor: A.systemPrompt,
      title: "Fix the gap it found",
      description:
        "Back on your agent. The failing test showed it had <strong>no phone number</strong> to give. We are adding one line of instruction, highlighted here, so it can answer. Fixing the exact gap a test finds is how you improve.",
      side: "top",
      actionLabel: "Save",
      timeout: 12000,
      prepare: async () => {
        await clickElement(A.runClose, { timeout: 8000 });
        await clickElement(A.tabAgent, { timeout: 8000 });
        await appendPromptFix();
      },
      action: async () => {
        await clickElement(A.save);
      },
    },
    {
      anchor: A.testsRunAll,
      title: "Run the tests again",
      description:
        "Now run the same tests again with the fix in place, and see whether the failure turns into a pass.",
      side: "bottom",
      align: "end",
      actionLabel: "Run",
      timeout: 12000,
      prepare: async () => {
        await clickElement(A.tabTests);
      },
      action: async () => {
        await clickElement(A.testsRunAll);
      },
    },
    {
      // Pinned over the centre spinner like the first run; auto-advances to the
      // results once the run finishes.
      title: "Running again",
      description:
        "Running the same tests with the fix in place. This will only take a moment.",
      popoverClass: "calibrate-tour-running",
      autoAdvance: true,
      action: async () => {
        await waitForElement(A.runSummary, { timeout: 90000 });
      },
    },
    {
      anchor: A.runResultDetail,
      title: "It passes now ✅",
      description:
        "Here is the same test that failed before. With the fix in place, the agent now gives the phone number, so it <strong>passes</strong>. See for yourself.",
      side: "left",
      actionLabel: "Next",
      timeout: 90000,
      prepare: async () => {
        // Open the Outputs tab and the previously-failing test so the pass is
        // shown on the exact case, not just the summary.
        await clickElement(A.runTabOutputs, { timeout: 10000 });
        await waitForElement(A.runResultRow, { timeout: 8000 });
        openPhoneNumberResult();
        await waitForElement(A.runResultDetail, { timeout: 8000 });
      },
    },
    {
      // The biggest takeaway, on its own card (centered).
      title: "This is the big idea 💪",
      description:
        "You just made your agent better, and you have proof. <strong>Run tests, find mistakes, fix, and repeat</strong>. Keep doing this and your agent gets stronger over time, and never breaks in the same way twice.",
      actionLabel: "Next",
    },
    {
      anchor: A.testsCreate,
      title: "Keep adding tests",
      description:
        "Real users will ask things you did not expect. Each time you find a question your agent gets wrong, <strong>save it as a test</strong> here. Over time these tests add up, so your agent keeps improving and never makes the same mistake twice.",
      side: "bottom",
      align: "end",
      actionLabel: "Next",
      timeout: 10000,
      prepare: async () => {
        await clickElement(A.runClose, { timeout: 8000 });
        await waitForElement(A.testsCreate, { timeout: 8000 });
      },
    },
    {
      anchor: A.startTour,
      title: "That is the first walkthrough 🎉",
      description:
        "You built an agent, tested it, read a verdict, and fixed a problem it found. You can <strong>replay anytime</strong> from Product tour here.",
      side: "right",
      align: "center",
      actionLabel: "Finish",
      timeout: 8000,
    },
  ];

  return { id: FIRST_EVAL_TOUR_ID, steps };
}
