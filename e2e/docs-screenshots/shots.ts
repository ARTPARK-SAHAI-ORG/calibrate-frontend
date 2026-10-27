import type { Locator, Page } from "@playwright/test";
import { chooseTestType } from "../helpers";
import { type Demo, type Seeded } from "./seed";

/**
 * One docs picture: open `path`, optionally do `action`, wait until `waitFor`
 * is visible, then save `<file>.png`. A path starting with "/" is opened
 * signed in, under the workspace; `signedOut` opens it in a fresh browser.
 */
export type Shot = {
  file: string;
  path: string;
  waitFor: (page: Page) => Locator;
  action?: (page: Page) => Promise<void>;
  signedOut?: boolean;
};

const text = (s: string) => (page: Page) => page.getByText(s, { exact: true }).first();
const heading = (s: string) => (page: Page) =>
  page.getByRole("heading", { name: s, exact: true }).first();
const click = (name: string) => async (page: Page) => {
  await page.getByRole("button", { name, exact: true }).first().click();
};
/** The topmost dialog on the page. */
const dialog = (page: Page) => page.locator(".fixed.inset-0.z-50").last();

async function openNewAgent(page: Page, kind: "agent" | "connection") {
  await page.getByRole("button", { name: "New agent" }).first().click();
  await page.locator(`[data-agent-kind="${kind}"]`).click();
}

async function openNewTest(page: Page, type: "next-reply" | "tool-invocation") {
  await page.getByRole("button", { name: "Create test", exact: true }).first().click();
  await chooseTestType(page, type);
}

export function shots(d: Demo, s: Seeded): Shot[] {
  const agent = `/agents/${s.agentId}`;
  const task = `/human-alignment/tasks/${s.taskId}`;
  const failed = d.tests.find((t) => !t.demo.passed)!;
  return [
    // get-started
    {
      file: "get-started-sign-up",
      path: "/signup",
      signedOut: true,
      waitFor: heading("Create your account"),
    },
    {
      file: "get-started-check-email",
      path: "/signup",
      signedOut: true,
      action: async (page) => {
        await page.route("**/auth/signup", (route) =>
          route.fulfill({
            status: 202,
            json: {
              status: "verification_sent",
              email: "asha@example.com",
              already_pending: false,
            },
          }),
        );
        await page.getByPlaceholder("John", { exact: true }).fill("Asha");
        await page.getByPlaceholder("Doe", { exact: true }).fill("Rao");
        await page.getByPlaceholder("john@example.com").fill("asha@example.com");
        await page.getByPlaceholder("Create a strong password").fill("Tutor-2026!");
        await page.getByPlaceholder("Confirm your password").fill("Tutor-2026!");
        await page.getByRole("button", { name: "Create account" }).click();
      },
      waitFor: heading("Check your email"),
    },
    {
      file: "get-started-product-tour",
      path: "/agents",
      action: async (page) => {
        await page.locator('[data-tour="new-agent"]').first().waitFor();
        await page.evaluate(() =>
          window.dispatchEvent(
            new CustomEvent("calibrate:start-tour", { detail: "first-eval" }),
          ),
        );
      },
      waitFor: (page) => page.locator(".driver-popover-title"),
    },
    {
      file: "get-started-tutorials",
      path: "/learn",
      signedOut: true,
      waitFor: heading("Learning resources"),
    },

    // agents
    { file: "agents-list", path: "/agents", waitFor: text(d.agent.name) },
    {
      file: "agents-new-agent-build",
      path: "/agents",
      action: (page) => openNewAgent(page, "agent"),
      waitFor: heading("New agent"),
    },
    {
      file: "agents-new-agent-connect",
      path: "/agents",
      action: (page) => openNewAgent(page, "connection"),
      waitFor: heading("New agent"),
    },
    {
      file: "agents-agent-tab",
      path: `${agent}?tab=agent`,
      waitFor: (page) => page.locator('[data-tour="agent-system-prompt"]'),
    },
    {
      file: "agents-tools-tab",
      path: `${agent}?tab=tools`,
      waitFor: text(d.tools[1].name),
    },
    {
      file: "agents-add-tool-structured-output",
      path: "/tools",
      action: click("Add structured output tool"),
      waitFor: heading("Add structured output tool"),
    },
    {
      file: "agents-add-tool-webhook",
      path: "/tools",
      action: click("Add webhook tool"),
      waitFor: heading("Add webhook tool"),
    },
    {
      file: "agents-connection-verified",
      path: `/agents/${s.connectionAgentId}?tab=connection`,
      waitFor: (page) => page.getByPlaceholder("https://your-agent.example.com/chat"),
    },
    { file: "agents-tests-tab", path: `${agent}?tab=tests`, waitFor: text(d.tests[0].name) },
    {
      file: "agents-new-test-response",
      path: `${agent}?tab=tests`,
      action: async (page) => {
        const t = d.tests.find((x) => x.kind === "response")!;
        await openNewTest(page, "next-reply");
        await page.getByPlaceholder(/Your .* name/i).first().fill(t.name);
        await page.getByPlaceholder("Criteria that the agent's response should satisfy").fill(t.criteria!);
        // The editor opens on a three-turn sample; keep only the last user turn.
        await page.getByLabel("Remove message").first().click();
        await page.getByLabel("Remove message").first().click();
        await page.getByPlaceholder(/Enter user message/).first().fill(t.user_message);
      },
      waitFor: (page) => page.getByPlaceholder(/Your .* name/i).first(),
    },
    {
      file: "agents-new-test-tool-call",
      path: `${agent}?tab=tests`,
      action: async (page) => {
        const t = d.tests.find((x) => x.kind === "tool_call")!;
        await openNewTest(page, "tool-invocation");
        await page.getByPlaceholder(/Your .* name/i).first().fill(t.name);
        await page.getByPlaceholder(/Enter user message/).first().fill(t.user_message);
        await click("Add tool")(page);
        await page.getByText(t.expected_tool_call!.name, { exact: true }).last().click();
        for (const [name, value] of Object.entries(t.expected_tool_call!.arguments)) {
          const param = page
            .locator("div.rounded-xl.p-4")
            .filter({ has: page.getByText(name, { exact: true }) })
            .last();
          if (typeof value === "boolean") await param.locator("select").last().selectOption(String(value));
          else await param.getByPlaceholder("Expected value").fill(String(value));
        }
      },
      waitFor: (page) => page.getByPlaceholder(/Your .* name/i).first(),
    },
    {
      file: "agents-bulk-upload",
      path: `${agent}?tab=tests`,
      action: click("Bulk upload"),
      waitFor: heading("Bulk upload tests"),
    },
    {
      file: "agents-test-run-results",
      path: `${agent}?tab=runs&runId=${s.testRunId}`,
      action: async (page) => {
        await dialog(page).getByRole("button", { name: "Tests", exact: true }).click();
        await dialog(page).getByText(failed.name, { exact: true }).first().click();
        await dialog(page).getByRole("button", { name: "See reasoning" }).first().click();
      },
      waitFor: (page) => dialog(page).getByText(failed.demo.reasoning).first(),
    },
    {
      file: "agents-compare-models",
      path: `${agent}?tab=runs&runId=${s.benchmarkId}`,
      action: async (page) => {
        await dialog(page).getByRole("button", { name: "Results", exact: true }).click();
      },
      waitFor: (page) => dialog(page).locator("table").first(),
    },
    {
      file: "agents-monitoring",
      path: `${agent}?tab=monitoring`,
      action: click("Conversations"),
      waitFor: text(d.tests[0].user_message),
    },
    { file: "agents-settings", path: `${agent}?tab=settings`, waitFor: text("Agent speaks first") },

    // evaluators
    { file: "evaluators-list", path: "/agent-evaluators", waitFor: text(d.evaluators[0].reply_name) },
    {
      file: "evaluators-create",
      path: "/agent-evaluators",
      action: click("Create evaluator"),
      waitFor: (page) =>
        page.getByRole("heading", { name: /^(What is this evaluator for\?|Add evaluator)$/ }).first(),
    },
    {
      file: "evaluators-detail-versions",
      path: `/evaluators/${s.evaluatorIds[0]}`,
      waitFor: heading(d.evaluators[0].name),
    },

    // human-alignment
    { file: "human-alignment-overview", path: "/human-alignment?tab=overview", waitFor: text(d.human_alignment.evaluator) },
    { file: "human-alignment-tasks", path: "/human-alignment?tab=tasks", waitFor: text(d.human_alignment.task_name) },
    { file: "human-alignment-task-overview", path: `${task}?tab=overview`, waitFor: text(d.human_alignment.evaluator) },
    { file: "human-alignment-dataset", path: `${task}?tab=items`, waitFor: text(d.tests[0].name) },
    { file: "human-alignment-labelling-jobs", path: `${task}?tab=jobs`, waitFor: text(d.human_alignment.annotators[0]) },
    {
      file: "human-alignment-annotator-view",
      // Annotators open their link without signing in.
      path: `/annotate-job/${s.jobTokens[0]}`,
      signedOut: true,
      waitFor: text(d.human_alignment.task_name),
    },
    {
      file: "human-alignment-evaluation-run",
      path: `${task}/evaluator-runs/${s.evaluatorRunId}`,
      waitFor: text(d.human_alignment.task_name),
    },
    {
      file: "human-alignment-annotators",
      path: "/human-alignment?tab=annotators",
      waitFor: text(d.human_alignment.annotators[1]),
    },

    // simulations
    { file: "simulations-personas", path: "/personas", waitFor: text(d.personas[0].name) },
    {
      file: "simulations-persona-edit",
      path: "/personas",
      action: async (page) => {
        await page.getByText(d.personas[0].name, { exact: true }).first().click();
      },
      waitFor: heading("Edit persona"),
    },
    { file: "simulations-scenarios", path: "/scenarios", waitFor: text(d.scenarios[0].name) },
    {
      file: "simulations-scenario-edit",
      path: "/scenarios",
      action: async (page) => {
        await page.getByText(d.scenarios[0].name, { exact: true }).first().click();
      },
      waitFor: heading("Edit scenario"),
    },
    {
      file: "simulations-evaluators",
      path: "/simulation-evaluators",
      waitFor: text(d.evaluators[0].name),
    },
    {
      file: "simulations-config",
      path: `/simulations/${s.simulationId}?tab=config`,
      waitFor: text(d.personas[1].name),
    },
    {
      file: "simulations-text-run",
      path: `/simulations/${s.simulationId}/runs/${s.textRunId}`,
      waitFor: text(d.personas[0].name),
    },
    {
      file: "simulations-transcript",
      path: `/simulations/${s.simulationId}/runs/${s.textRunId}`,
      action: async (page) => {
        await page.getByLabel("View transcript").first().click();
      },
      waitFor: (page) => dialog(page).getByText("Agent").first(),
    },
    {
      file: "simulations-voice-run",
      path: `/simulations/${s.simulationId}/runs/${s.voiceRunId}`,
      waitFor: text(d.personas[0].name),
    },

    // stt
    { file: "stt-datasets", path: "/stt?tab=datasets", waitFor: text(d.stt_dataset.name) },
    {
      file: "stt-new-evaluation",
      path: "/stt/new",
      waitFor: (page) => page.getByRole("button", { name: "Evaluate" }).first(),
    },
    { file: "stt-results", path: `/stt/${s.sttTaskId}?tab=leaderboard`, waitFor: text("Sarvam") },

    // tts
    { file: "tts-datasets", path: "/tts?tab=datasets", waitFor: text(d.tts_dataset.name) },
    {
      file: "tts-new-evaluation",
      path: "/tts/new",
      waitFor: (page) => page.getByRole("button", { name: "Evaluate" }).first(),
    },
    { file: "tts-results", path: `/tts/${s.ttsTaskId}?tab=leaderboard`, waitFor: text("Sarvam") },

    // workspace-settings
    { file: "workspace-settings-members", path: "/workspace-settings?tab=members", waitFor: text("Invite") },
    { file: "workspace-settings-general", path: "/workspace-settings?tab=general", waitFor: (page) => page.locator("#workspace-name") },
    { file: "workspace-settings-api-keys", path: "/workspace-settings?tab=api-keys", waitFor: text("Create key") },
    {
      file: "workspace-settings-byok",
      path: "/workspace-settings?tab=provider-keys",
      waitFor: text("Bring your own keys (BYOK)"),
    },
  ];
}
