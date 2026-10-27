import type { Locator, Page } from "@playwright/test";
import { expect } from "../fixtures";
import { chooseTestType } from "../helpers";
import type { Demo, Seeded } from "./seed";

/**
 * One docs picture: open `path`, optionally do `action`, wait until `waitFor`
 * is visible, then save `<file>.png`. A path starting with "/" is opened
 * signed in, under the workspace; `signedOut` opens it in a fresh browser.
 * `highlight` is the one element the docs step tells the reader to click; its
 * box is saved beside the picture.
 */
export type Shot = {
  file: string;
  path: string;
  waitFor: (page: Page) => Locator;
  action?: (page: Page) => Promise<void>;
  signedOut?: boolean;
  highlight?: (page: Page) => Locator;
};

/** A backend call as the signed-in user, for shots that need fresh data. */
type Call = <T>(path: string, body?: unknown, method?: string) => Promise<T>;

const text = (s: string) => (page: Page) => page.getByText(s, { exact: true }).first();
const heading = (s: string) => (page: Page) =>
  page.getByRole("heading", { name: s, exact: true }).first();
const button = (name: string | RegExp) => (page: Page) =>
  page.getByRole("button", { name, exact: typeof name === "string" }).first();
const click = (name: string | RegExp) => async (page: Page) => {
  await button(name)(page).click();
};
const openSwitcher = (page: Page) =>
  page.getByRole("complementary").locator("button[aria-expanded]").first().click();
/** Answer every visibility change as made public, so sharing changes nothing. */
const fakeShare = (page: Page) =>
  page.route("**/visibility", (r) =>
    r.request().method() === "PATCH"
      ? r.fulfill({ json: { is_public: true, share_token: "docs-example" } })
      : r.fallback(),
  );
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

async function openAddEvaluator(page: Page) {
  await click("Create evaluator")(page);
  await page.getByRole("button", { name: /^Conversation/ }).click();
  await click("Continue")(page);
  // The form fills in a default prompt and judge model a moment after it
  // opens, over anything typed before then.
  await expect(page.getByText("Select judge model")).toHaveCount(0, { timeout: 20_000 });
}

/** The model list comes from OpenRouter, which the test backend has no key
 * for; answer with the example's benchmark models. Reloads to use it. */
async function fakeModelCatalog(page: Page, models: string[]) {
  await page.route("**/openrouter/providers", (r) => r.fulfill({ json: { providers: "all" } }));
  await page.route("https://openrouter.ai/api/v1/models", (r) =>
    r.fulfill({ json: { data: models.map((id) => ({ id, name: id })) } }),
  );
  await page.reload();
}

export function shots(d: Demo, s: Seeded, call: Call): Shot[] {
  const ws = (path: string) => `/${s.workspaceId}${path}`;
  const ev = `/evaluators/${s.evaluatorIds[0]}`;
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
    { file: "agents-list", path: "/agents", waitFor: text(d.agent.name), highlight: button("New agent") },
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
    {
      file: "workspace-settings-members",
      path: "/workspace-settings?tab=members",
      waitFor: button("Remove"),
      highlight: button("Remove"),
    },
    {
      file: "workspace-settings-invite-email",
      path: "/workspace-settings?tab=members",
      action: async (page) => {
        await click("Invite")(page);
        await page.getByLabel("Email address").fill("meena@example.org");
      },
      waitFor: heading("Add team members"),
      highlight: button("Add"),
    },
    {
      file: "workspace-settings-invite-link",
      path: "/workspace-settings?tab=members",
      action: async (page) => {
        await click("Invite")(page);
        await click("Invite with a link")(page);
        await click("Create an invite link")(page);
      },
      waitFor: (page) => page.getByText("/invite/").first(),
    },
    {
      file: "workspace-settings-remove",
      path: "/workspace-settings?tab=members",
      action: click("Remove"),
      waitFor: heading("Remove member"),
      highlight: (page) => dialog(page).getByRole("button", { name: "Remove", exact: true }),
    },
    {
      file: "workspace-settings-create-workspace",
      path: "/workspace-settings?tab=members",
      action: async (page) => {
        await openSwitcher(page);
        await click("Create workspace")(page);
        await page.getByPlaceholder("e.g. Acme Health").fill("Science tutor team");
      },
      waitFor: (page) => page.getByPlaceholder("e.g. Acme Health"),
      highlight: (page) => dialog(page).getByRole("button", { name: "Create workspace", exact: true }),
    },
    {
      file: "workspace-settings-switcher",
      path: "/workspace-settings?tab=members",
      action: openSwitcher,
      waitFor: text("English tutor team"),
      highlight: button("Create workspace"),
    },
    { file: "workspace-settings-general", path: "/workspace-settings?tab=general", waitFor: (page) => page.locator("#workspace-name") },
    { file: "workspace-settings-api-keys", path: "/workspace-settings?tab=api-keys", waitFor: text("Create key") },
    {
      file: "workspace-settings-byok",
      path: "/workspace-settings?tab=provider-keys",
      waitFor: text("Bring your own keys (BYOK)"),
    },
    {
      file: "workspace-settings-menu",
      path: "/workspace-settings?tab=members",
      action: openSwitcher,
      waitFor: (page) => page.getByRole("link", { name: "API keys" }).first(),
      highlight: (page) => page.getByRole("link", { name: "Workspace settings" }).first(),
    },
    {
      file: "profile-menu-api-keys",
      path: "/agents",
      action: click("Open profile menu"),
      waitFor: (page) => page.getByRole("link", { name: "API keys" }).first(),
      highlight: (page) => page.getByRole("link", { name: "API keys" }).first(),
    },

    // Shots below change data or fake answers, so they come after the ones
    // above that show the same pages untouched.

    // get-started
    {
      file: "get-started-sign-in",
      path: "/login",
      signedOut: true,
      waitFor: heading("Welcome back"),
      highlight: button("Continue with Google"),
    },
    {
      file: "get-started-forgot-password",
      path: "/forgot-password",
      signedOut: true,
      action: (page) => page.getByPlaceholder("Enter your email").fill("priya@example.org"),
      waitFor: heading("Forgot password"),
      highlight: button("Send reset link"),
    },
    {
      file: "get-started-reset-password",
      path: "/learn",
      signedOut: true,
      action: async (page) => {
        // The page checks the emailed link first; answer that the link is good.
        await page.route("**/auth/check-reset-link", (r) => r.fulfill({ json: {} }));
        await page.goto("/reset-password?token=docs-example");
      },
      waitFor: (page) => page.getByPlaceholder("Create a strong password"),
      highlight: button("Save new password"),
    },
    {
      file: "get-started-invite",
      path: "/agents",
      action: async (page) => {
        const { token } = await call<{ token: string }>(`/organizations/${s.workspaceId}/invite-link`, {});
        await page.goto(`/invite/${token}`);
      },
      waitFor: button("Join"),
      highlight: button("Join"),
    },

    // agents
    {
      file: "agents-verify-connection",
      path: `/agents/${s.connectionAgentId}?tab=connection`,
      action: click("Re-verify"),
      waitFor: text("Request body preview"),
      highlight: button("Send & Verify"),
    },
    {
      file: "agents-run-tests-confirm",
      path: `${agent}?tab=tests`,
      action: async (page) => {
        const boxes = page.getByRole("button", { name: "Select test" }).filter({ visible: true });
        await boxes.nth(0).click();
        await boxes.nth(1).click();
        await click(/^Run \d+ tests?$/)(page);
      },
      waitFor: text("Run the selected tests"),
      highlight: button("Start the run"),
    },
    {
      file: "agents-evaluations-tab",
      path: `${agent}?tab=runs`,
      waitFor: text("Model comparison 1"),
    },
    {
      file: "agents-run-export",
      path: `${agent}?tab=runs&runId=${s.testRunId}`,
      waitFor: (page) => dialog(page).getByRole("button", { name: "Export results" }),
      highlight: (page) => dialog(page).getByRole("button", { name: "Export results" }),
    },
    {
      file: "agents-run-share",
      path: `${agent}?tab=runs&runId=${s.testRunId}`,
      action: async (page) => {
        await fakeShare(page);
        await dialog(page).getByRole("button", { name: "Share", exact: true }).click();
      },
      waitFor: button("Copy link"),
      highlight: button("Copy link"),
    },
    {
      file: "agents-submit-for-labelling",
      path: `${agent}?tab=runs&runId=${s.testRunId}`,
      action: async (page) => {
        await dialog(page).getByRole("button", { name: "Tests", exact: true }).click();
        await dialog(page).getByRole("button", { name: "Select all" }).first().click();
        await dialog(page).getByRole("button", { name: "Submit for labelling" }).click();
      },
      waitFor: (page) => page.getByRole("heading", { name: /^Submit \d+ test results? for labelling$/ }),
    },
    {
      file: "agents-compare-dialog",
      path: `${agent}?tab=runs`,
      action: async (page) => {
        await fakeModelCatalog(page, d.benchmark_models.map((m) => m.model));
        await page.goto(ws(`${agent}?tab=runs&runId=${s.benchmarkId}`));
        // Rerun opens the compare window with the same three models picked.
        await dialog(page).getByRole("button", { name: "Rerun" }).click();
      },
      waitFor: (page) => page.getByRole("button", { name: "Remove model" }).nth(2),
      highlight: button("Run comparison"),
    },
    {
      file: "agents-compare-connected",
      path: `/agents/${s.connectionAgentId}?tab=tests`,
      action: click(/Compare models/),
      waitFor: text("Which provider does your agent use for models?"),
      highlight: button("Continue"),
    },
    {
      file: "agents-monitoring-setup",
      path: `/agents/${s.connectionAgentId}?tab=monitoring`,
      action: click(/Send your first trace/),
      waitFor: button("Python"),
    },
    {
      file: "agents-monitoring-scoring",
      path: `${agent}?tab=monitoring`,
      action: async (page) => {
        const chip = button(/^Continuous monitoring (on|off)$/)(page);
        await expect(chip).toBeEnabled();
        await chip.click();
      },
      waitFor: (page) => page.getByText(/^Turn (on|off) continuous monitoring$/).first(),
    },
    {
      file: "agents-traces-to-tests",
      path: `${agent}?tab=monitoring`,
      action: async (page) => {
        await page.getByLabel("Select trace").nth(0).click();
        await page.getByLabel("Select trace").nth(1).click();
      },
      waitFor: button(/^Add to tests \(\d+\)$/),
      highlight: button(/^Add to tests \(\d+\)$/),
    },

    // evaluators
    {
      file: "evaluators-review-type-binary",
      path: "/agent-evaluators",
      action: async (page) => {
        await openAddEvaluator(page);
        await page.getByPlaceholder("e.g. Gives the correct vaccination schedule").fill(d.evaluators[0].name);
      },
      waitFor: text("Set the labels shown for Yes/No across the task"),
    },
    {
      file: "evaluators-review-type-rating",
      path: "/agent-evaluators",
      action: async (page) => {
        await openAddEvaluator(page);
        await page.getByPlaceholder("e.g. Gives the correct vaccination schedule").fill(d.evaluators[1].name);
        await page.getByRole("button", { name: /^rating$/i }).click();
      },
      waitFor: button("Add row"),
    },
    {
      file: "evaluators-judge-model",
      path: "/agent-evaluators",
      action: async (page) => {
        await fakeModelCatalog(page, d.benchmark_models.map((m) => m.model));
        await openAddEvaluator(page);
        await page.locator("label:has-text('Judge model') + button").click();
      },
      waitFor: (page) => page.getByPlaceholder("Search LLM"),
    },
    {
      file: "evaluators-judge-prompt",
      path: "/agent-evaluators",
      action: async (page) => {
        await openAddEvaluator(page);
        await page
          .getByPlaceholder(/Use \{\{variable\}\} to mark values/)
          .fill(`${d.evaluators[0].prompt} Judge it against this goal: {{criteria}}`);
        await page.getByPlaceholder("Short description explaining the purpose of the variable").scrollIntoViewIfNeeded();
      },
      waitFor: (page) => page.getByPlaceholder("Short description explaining the purpose of the variable"),
    },
    {
      file: "evaluators-required-field",
      path: "/agent-evaluators",
      action: async (page) => {
        await openAddEvaluator(page);
        await page.getByPlaceholder(/Use \{\{variable\}\} to mark values/).fill("");
        await dialog(page).getByRole("button", { name: "Create evaluator", exact: true }).click();
      },
      waitFor: text("Name is required"),
    },
    {
      file: "evaluators-edit",
      path: ev,
      action: async (page) => {
        await page.getByLabel("Edit name and description").click();
      },
      waitFor: heading("Edit evaluator"),
    },
    {
      file: "evaluators-new-version",
      path: ev,
      action: click("Edit"),
      waitFor: (page) => page.getByRole("checkbox", { name: /Mark the new version as the live version/ }),
    },
    {
      file: "evaluators-mark-current",
      path: ev,
      action: (page) => page.getByLabel("Mark as current").first().hover(),
      waitFor: text("Mark as current"),
      highlight: (page) => page.getByLabel("Mark as current").first(),
    },
    {
      file: "evaluators-delete-version",
      path: ev,
      action: (page) => page.getByLabel("Delete v1").click(),
      waitFor: heading("Delete version"),
    },
    {
      file: "evaluators-duplicate",
      path: ev,
      action: click("Duplicate"),
      waitFor: heading("Add evaluator"),
    },
    {
      file: "evaluators-delete",
      path: ev,
      action: (page) => page.getByLabel("Delete evaluator").click(),
      waitFor: heading("Delete evaluator"),
    },

    // human-alignment
    {
      file: "human-alignment-create-task",
      path: "/human-alignment?tab=tasks",
      action: async (page) => {
        await click("Create new labelling task")(page);
        await page.getByPlaceholder("e.g. Maternal health helpline, June calls").fill(d.human_alignment.task_name);
      },
      waitFor: heading("Create labelling task"),
      highlight: button("Next"),
    },
    {
      file: "human-alignment-add-item",
      path: `${task}?tab=items`,
      action: async (page) => {
        const t = d.tests[1];
        await click("Add item")(page);
        await page.getByPlaceholder("Your item name").fill(t.name);
        // The window opens on a four-turn sample; keep one exchange.
        await page.getByLabel("Remove message").first().click();
        await page.getByLabel("Remove message").first().click();
        await page.getByPlaceholder(/Enter user message/).first().fill(t.user_message);
        await page.getByPlaceholder(/Enter agent message/).first().fill(t.demo.reply);
      },
      waitFor: (page) => page.getByPlaceholder("Your item name"),
    },
    {
      file: "human-alignment-bulk-upload",
      path: `${task}?tab=items`,
      action: click("Bulk upload"),
      waitFor: heading("Bulk upload items"),
    },
    {
      file: "human-alignment-assign-annotators",
      path: `${task}?tab=items`,
      action: async (page) => {
        await page.getByLabel("Select all").first().check();
        await click("Label selected")(page);
      },
      waitFor: heading("Assign annotators"),
    },
    {
      file: "human-alignment-run-evaluators",
      path: `${task}?tab=items`,
      action: async (page) => {
        await page.getByLabel("Select all").first().check();
        await click("Evaluate selected")(page);
      },
      waitFor: heading("Run evaluators"),
      highlight: (page) => dialog(page).getByRole("button", { name: "Run", exact: true }),
    },
    {
      file: "human-alignment-agreement-trend",
      path: `${ev}?tab=agreement`,
      waitFor: (page) => page.getByTestId("trend-dot").nth(1),
    },
    {
      file: "human-alignment-update-answer",
      path: `/annotate-job/${s.jobTokens[0]}`,
      signedOut: true,
      waitFor: button("Update"),
      highlight: button("Update"),
    },
    {
      // Last in this group: it adds a new labelling job.
      file: "human-alignment-label-item",
      path: `/annotate-job/${s.jobTokens[0]}`,
      signedOut: true,
      action: async (page) => {
        const { jobs } = await call<{ jobs: { public_token: string }[] }>(
          `/annotation-tasks/${s.taskId}/jobs`,
          { annotator_ids: [s.annotatorIds[0]], select_all: true },
        );
        await page.goto(`/annotate-job/${jobs[0].public_token}`);
      },
      waitFor: button("Submit & Next"),
      highlight: button("Submit & Next"),
    },

    // simulations
    {
      file: "simulations-create-evaluator",
      path: "/simulation-evaluators",
      action: click("Create evaluator"),
      waitFor: heading("Add evaluator"),
    },
    {
      file: "simulations-add-simulation",
      path: "/simulations",
      action: async (page) => {
        await click("Add simulation")(page);
        await page.getByPlaceholder("Enter simulation name").fill(d.simulation.name);
      },
      waitFor: heading("Create your simulation"),
      highlight: button("Create Simulation"),
    },
    {
      file: "simulations-launch-menu",
      path: `/simulations/${s.simulationId}?tab=config`,
      action: click("Launch"),
      waitFor: button("Voice Simulation"),
      highlight: button("Text Simulation"),
    },
    {
      file: "simulations-runs-tab",
      path: `/simulations/${s.simulationId}?tab=runs`,
      waitFor: text("2 runs"),
    },
    {
      file: "simulations-run-share",
      path: `/simulations/${s.simulationId}/runs/${s.textRunId}`,
      action: async (page) => {
        await fakeShare(page);
        await click("Share")(page);
      },
      waitFor: button("Copy link"),
      highlight: button("Copy link"),
    },
    {
      // Last in this group: it adds a simulation. A configured simulation
      // shows its evaluators read-only, so this one has only a name.
      file: "simulations-add-evaluators",
      path: "/simulations",
      action: async (page) => {
        const { uuid } = await call<{ uuid: string }>("/simulations", { name: `${d.simulation.name} (draft)` });
        await page.goto(ws(`/simulations/${uuid}?tab=config`));
        await click("Add evaluators")(page);
      },
      waitFor: heading("Add evaluators"),
    },

    // stt and tts
    ...(["stt", "tts"] as const).flatMap((p): Shot[] => {
      const taskId = p === "stt" ? s.sttTaskId : s.ttsTaskId;
      const datasetId = p === "stt" ? s.sttDatasetId : s.ttsDatasetId;
      const { name: datasetName, rows, language: lang } = p === "stt" ? d.stt_dataset : d.tts_dataset;
      return [
        {
          file: `${p}-start`,
          path: `/${p}`,
          waitFor: button("New evaluation"),
          highlight: button("New evaluation"),
        },
        {
          file: `${p}-models`,
          path: `/${p}/new?dataset=${datasetId}`,
          action: async (page) => {
            // Show the workspace as using its own keys with only Sarvam's saved,
            // so the other providers say a key is needed.
            await page.route("**/org-limits/me", (r) =>
              r.fulfill({ json: { max_rows_per_eval: null, uses_own_provider_keys: true } }),
            );
            await page.route(/\/providers(\?.*)?$/, (r) => r.fulfill({ json: { providers: ["sarvam"] } }));
            await page.reload();
            await page.locator("select").first().selectOption(lang);
          },
          waitFor: (page) => page.getByText("API key needed").first(),
        },
        {
          file: `${p}-evaluators-tab`,
          path: `/${p}/new`,
          action: click("Evaluators"),
          waitFor: button("Add evaluators"),
          highlight: button("Add evaluators"),
        },
        {
          file: `${p}-running`,
          path: `/${p}/${taskId}`,
          action: async (page) => {
            // The test backend finishes at once; show the run as still going.
            await page.route(new RegExp(`/${p}/evaluate/${taskId}(\\?.*)?$`), async (r) => {
              const res = await r.fetch();
              await r.fulfill({ response: res, json: { ...(await res.json()), status: "in_progress", leaderboard_summary: null } });
            });
            await page.reload();
          },
          waitFor: text("Running"),
        },
        {
          file: `${p}-share`,
          path: `/${p}/${taskId}?tab=leaderboard`,
          action: async (page) => {
            await fakeShare(page);
            await click("Share")(page);
          },
          waitFor: button("Copy link"),
          highlight: button("Copy link"),
        },
        {
          file: `${p}-dataset-create`,
          path: `/${p}/new`,
          action: async (page) => {
            await page
              .getByPlaceholder(p === "stt" ? "e.g. English customer calls" : "e.g. English TTS test set")
              .fill(datasetName);
            await page
              .getByPlaceholder(p === "stt" ? "Enter reference transcription" : "Enter text to synthesize")
              .first()
              .fill(rows[0]);
          },
          waitFor: text(p === "stt" ? "Upload ZIP" : "Upload CSV"),
        },
        {
          file: `${p}-dataset-edit`,
          path: `/datasets/${datasetId}`,
          waitFor: heading(datasetName),
        },
        {
          file: `${p}-dataset-delete`,
          path: `/${p}?tab=datasets`,
          action: (page) => page.getByLabel(`Delete ${datasetName}`).click(),
          waitFor: heading("Delete dataset"),
        },
      ];
    }),
  ];
}
