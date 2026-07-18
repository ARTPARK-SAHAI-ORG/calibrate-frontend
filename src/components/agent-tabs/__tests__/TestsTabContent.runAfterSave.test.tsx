import React, { useEffect } from "react";
import { render, screen, setupUser, within } from "@/test-utils";
import { TestsTabContent } from "../TestsTabContent";
import type { EvaluatorData } from "@/lib/evaluatorApi";

const BACKEND = "http://test-backend";
const AGENT_UUID = "agent-1";

const TEST_CONFIG = {
  history: [{ role: "user" as const, content: "Hello" }],
  evaluation: { type: "response" as const },
};

const TEST_EVALUATORS = [
  { evaluator_uuid: "ev-attached", variable_values: {} },
  { evaluator_uuid: "ev-new", variable_values: {} },
];

const verifySavedAgentMock = jest.fn(async () => true);
jest.mock("../../../hooks", () => ({
  useAccessToken: () => "test-token",
  useMaxRowsPerEval: () => 100,
  useDialogUrlParam: () => ({ setParam: jest.fn() }),
  useVerifyConnection: () => ({
    isVerifying: false,
    verifyError: null,
    verifySampleResponse: null,
    verifySavedAgent: verifySavedAgentMock,
    verifyAdHoc: jest.fn(),
    dismiss: jest.fn(),
  }),
}));

jest.mock("../../../lib/reportError", () => ({
  reportError: jest.fn(),
}));

// Renders a marker only while open, listing the tests it was handed to run —
// lets the parent-side "save and run" flow be asserted end-to-end.
jest.mock("../../TestRunnerDialog", () => ({
  TestRunnerDialog: ({
    isOpen,
    tests,
  }: {
    isOpen: boolean;
    tests: Array<{ uuid: string; name: string }>;
  }) =>
    isOpen ? (
      <div data-testid="test-runner">
        {tests.map((t) => (
          <span key={t.uuid}>runner:{t.name}</span>
        ))}
      </div>
    ) : null,
}));
jest.mock("../../BenchmarkDialog", () => ({
  BenchmarkDialog: () => null,
}));
jest.mock("../../BenchmarkResultsDialog", () => ({
  BenchmarkResultsDialog: () => null,
}));
jest.mock("../../BulkUploadTestsModal", () => ({
  BulkUploadTestsModal: () => null,
}));
jest.mock("../CompareModelsButton", () => ({
  CompareModelsButton: () => null,
}));

// The dialog stub sets a name on open, forwards `showRunAfterSave` for
// assertion, and exposes two submit buttons: a plain save and a save-and-run
// that passes the `runAfterSave` intent through onSubmit.
jest.mock("../../AddTestDialog", () => ({
  AddTestDialog: ({
    isOpen,
    onSubmit,
    testName,
    setTestName,
    isEditing,
    showRunAfterSave,
    onRun,
  }: {
    isOpen: boolean;
    onSubmit: (
      config: typeof TEST_CONFIG,
      evaluators: typeof TEST_EVALUATORS,
      options?: { runAfterSave?: boolean },
    ) => void | Promise<void>;
    testName: string;
    setTestName: (name: string) => void;
    isEditing: boolean;
    showRunAfterSave?: boolean;
    onRun?: () => void;
  }) => {
    useEffect(() => {
      if (isOpen && !testName.trim()) {
        setTestName(isEditing ? "Refund test" : "Saved test");
      }
    }, [isOpen, isEditing, setTestName, testName]);

    if (!isOpen) return null;

    return (
      <div
        data-testid="add-test-dialog"
        data-editing={String(isEditing)}
        data-run={String(!!showRunAfterSave)}
      >
        <button
          type="button"
          onClick={() => onSubmit(TEST_CONFIG, TEST_EVALUATORS)}
        >
          Submit test
        </button>
        <button
          type="button"
          onClick={() =>
            onSubmit(TEST_CONFIG, TEST_EVALUATORS, { runAfterSave: true })
          }
        >
          Submit and run
        </button>
        <button type="button" onClick={() => onRun?.()}>
          Run directly
        </button>
      </div>
    );
  },
}));

const mockFetchAgentEvaluators = jest.fn();
const mockFetchAllEvaluators = jest.fn();
const mockAttachEvaluatorToAgent = jest.fn();

jest.mock("../../../lib/evaluatorApi", () => ({
  fetchAgentEvaluators: (...args: unknown[]) =>
    mockFetchAgentEvaluators(...args),
  fetchAllEvaluators: (...args: unknown[]) => mockFetchAllEvaluators(...args),
  addEvaluatorsToAgent: (...args: unknown[]) =>
    mockAttachEvaluatorToAgent(...args),
}));

const attachedEvaluator = (): EvaluatorData => ({
  uuid: "ev-attached",
  name: "Correctness",
  description: "Default correctness evaluator",
  created_at: "2026-01-01T00:00:00Z",
  updated_at: "2026-01-01T00:00:00Z",
  is_default: true,
  evaluator_type: "llm",
});

const newEvaluator = (): EvaluatorData => ({
  uuid: "ev-new",
  name: "Tone check",
  description: "Checks tone",
  created_at: "2026-01-01T00:00:00Z",
  updated_at: "2026-01-01T00:00:00Z",
  owner_user_id: "user-1",
  evaluator_type: "llm",
});

const existingAgentTest = {
  uuid: "test-1",
  name: "Refund test",
  description: "",
  type: "response" as const,
  config: {
    history: [{ role: "user", content: "I need a refund" }],
    evaluation: { type: "response" },
  },
  created_at: "2026-01-01T00:00:00Z",
  updated_at: "2026-01-01T00:00:00Z",
};

function jsonResponse(data: unknown, ok = true, status = 200) {
  return { ok, status, json: async () => data };
}

function setupFetch({
  agentTests = [] as Array<typeof existingAgentTest>,
  bulkUuids = ["test-saved"] as string[],
}: {
  agentTests?: Array<typeof existingAgentTest>;
  bulkUuids?: string[];
} = {}) {
  global.fetch = jest.fn(async (url: string, init?: RequestInit) => {
    if (url.includes(`/agent-tests/agent/${AGENT_UUID}/tests`)) {
      return jsonResponse({ items: agentTests, total: agentTests.length });
    }
    if (url.includes(`/agent-tests/agent/${AGENT_UUID}/runs`)) {
      return jsonResponse({ items: [], total: 0 });
    }
    // The caller starts the run and hands the uuid to the runner dialog.
    if (url.includes(`/agent-tests/agent/${AGENT_UUID}/run`)) {
      return jsonResponse({ task_id: "run-1" });
    }
    if (url === `${BACKEND}/tests`) {
      return jsonResponse({ items: [], total: 0 });
    }
    if (init?.method === "POST" && url.includes("/tests/bulk")) {
      // POST /tests/bulk returns the created uuids.
      return jsonResponse({ uuids: bulkUuids, count: bulkUuids.length, warnings: null });
    }
    if (init?.method === "PUT" && url.includes("/tests/test-1")) {
      return jsonResponse({});
    }
    if (url.includes("/tests/test-1") && init?.method !== "PUT") {
      return jsonResponse({
        ...existingAgentTest,
        evaluators: [
          {
            uuid: "ev-attached",
            name: "Correctness",
            slug: "default-llm-next-reply",
            variables: [],
          },
        ],
      });
    }
    return jsonResponse({}, false, 404);
  }) as jest.Mock;
}

beforeEach(() => {
  jest.clearAllMocks();
  process.env.NEXT_PUBLIC_BACKEND_URL = BACKEND;
  mockFetchAgentEvaluators.mockResolvedValue([attachedEvaluator()]);
  mockFetchAllEvaluators.mockResolvedValue([
    attachedEvaluator(),
    newEvaluator(),
  ]);
  mockAttachEvaluatorToAgent.mockResolvedValue(undefined);
  setupFetch();
});

describe("TestsTabContent save-and-run shortcut", () => {
  it("passes showRunAfterSave to the dialog for a verified agent", async () => {
    const user = setupUser();
    render(<TestsTabContent agentUuid={AGENT_UUID} />);

    await screen.findByRole("button", { name: "Create test" });
    await user.click(screen.getByRole("button", { name: "Create test" }));
    expect(screen.getByTestId("add-test-dialog")).toHaveAttribute(
      "data-run",
      "true",
    );
  });

  it("offers the shortcut for an unverified connection agent and diverts it to the verify gate", async () => {
    const user = setupUser();
    render(
      <TestsTabContent
        agentUuid={AGENT_UUID}
        agentType="connection"
        connectionVerified={false}
      />,
    );

    await screen.findByRole("button", { name: "Create test" });
    await user.click(screen.getByRole("button", { name: "Create test" }));
    // The shortcut is now always offered; the verify gate handles unverified.
    expect(screen.getByTestId("add-test-dialog")).toHaveAttribute(
      "data-run",
      "true",
    );

    await user.click(screen.getByRole("button", { name: "Submit and run" }));

    // Instead of the runner, the verify-to-run gate opens.
    expect(await screen.findByText("Verify connection to run")).toBeInTheDocument();
    expect(screen.queryByTestId("test-runner")).not.toBeInTheDocument();
  });

  it("runs the just-created test and skips the defaults prompt on 'Create and run'", async () => {
    // The create POST returns the new test's uuid, so the run keys off that
    // directly (no list lookup by name).
    setupFetch({ bulkUuids: ["test-saved"] });
    const user = setupUser();
    render(<TestsTabContent agentUuid={AGENT_UUID} />);

    await screen.findByRole("button", { name: "Create test" });
    await user.click(screen.getByRole("button", { name: "Create test" }));
    await user.click(screen.getByRole("button", { name: "Submit and run" }));

    // The runner opens with the created test; the defaults prompt never shows.
    expect(await screen.findByTestId("test-runner")).toHaveTextContent(
      "runner:Saved test",
    );
    expect(
      screen.queryByRole("heading", { name: "Update default evaluators?" }),
    ).not.toBeInTheDocument();
    expect(screen.queryByTestId("add-test-dialog")).not.toBeInTheDocument();
  });

  it("runs the just-edited test and skips the defaults prompt on 'Save and run'", async () => {
    setupFetch({ agentTests: [existingAgentTest] });
    const user = setupUser();
    render(<TestsTabContent agentUuid={AGENT_UUID} />);

    const matches = await screen.findAllByText("Refund test");
    await user.click(matches[0]);

    const dialog = await screen.findByTestId("add-test-dialog");
    expect(dialog).toHaveAttribute("data-editing", "true");
    await user.click(
      within(dialog).getByRole("button", { name: "Submit and run" }),
    );

    expect(await screen.findByTestId("test-runner")).toHaveTextContent(
      "runner:Refund test",
    );
    expect(
      screen.queryByRole("heading", { name: "Update default evaluators?" }),
    ).not.toBeInTheDocument();
    expect(screen.queryByTestId("add-test-dialog")).not.toBeInTheDocument();
  });

  it("runs the already-saved test via onRun without saving (the run-directly / discard path)", async () => {
    setupFetch({ agentTests: [existingAgentTest] });
    const user = setupUser();
    render(<TestsTabContent agentUuid={AGENT_UUID} />);

    const matches = await screen.findAllByText("Refund test");
    await user.click(matches[0]);
    const dialog = await screen.findByTestId("add-test-dialog");
    await user.click(within(dialog).getByRole("button", { name: "Run directly" }));

    // The runner opens with the saved test; no PUT was issued (no save).
    expect(await screen.findByTestId("test-runner")).toHaveTextContent(
      "runner:Refund test",
    );
    const puts = (global.fetch as jest.Mock).mock.calls.filter(
      ([, init]) => init?.method === "PUT",
    );
    expect(puts).toHaveLength(0);
    expect(screen.queryByTestId("add-test-dialog")).not.toBeInTheDocument();
  });

  it("runs the edited test by its own uuid even when the refetch returns it empty", async () => {
    // The list is present for the initial render (so the row is clickable) but
    // the refresh after the PUT returns empty. The edit run keys off the open
    // test's uuid, not the list, so it still runs.
    let testsCalls = 0;
    global.fetch = jest.fn(async (url: string, init?: RequestInit) => {
      if (url.includes(`/agent-tests/agent/${AGENT_UUID}/tests`)) {
        testsCalls += 1;
        const items = testsCalls === 1 ? [existingAgentTest] : [];
        return jsonResponse({ items, total: items.length });
      }
      if (url.includes(`/agent-tests/agent/${AGENT_UUID}/runs`)) {
        return jsonResponse({ items: [], total: 0 });
      }
      if (url.includes(`/agent-tests/agent/${AGENT_UUID}/run`)) {
        return jsonResponse({ task_id: "run-1" });
      }
      if (init?.method === "PUT" && url.includes("/tests/test-1")) {
        return jsonResponse({});
      }
      if (url.includes("/tests/test-1") && init?.method !== "PUT") {
        return jsonResponse({
          ...existingAgentTest,
          evaluators: [
            {
              uuid: "ev-attached",
              name: "Correctness",
              slug: "default-llm-next-reply",
              variables: [],
            },
          ],
        });
      }
      return jsonResponse({}, false, 404);
    }) as jest.Mock;

    const user = setupUser();
    render(<TestsTabContent agentUuid={AGENT_UUID} />);

    const matches = await screen.findAllByText("Refund test");
    await user.click(matches[0]);
    const dialog = await screen.findByTestId("add-test-dialog");
    await user.click(
      within(dialog).getByRole("button", { name: "Submit and run" }),
    );

    expect(await screen.findByTestId("test-runner")).toHaveTextContent(
      "runner:Refund test",
    );
  });

  it("falls back to the defaults prompt when the create response has no uuid", async () => {
    // Without a uuid in the create response there's nothing to run, so the
    // flow continues to the normal defaults prompt.
    setupFetch({ bulkUuids: [] });
    const user = setupUser();
    render(<TestsTabContent agentUuid={AGENT_UUID} />);

    await screen.findByRole("button", { name: "Create test" });
    await user.click(screen.getByRole("button", { name: "Create test" }));
    await user.click(screen.getByRole("button", { name: "Submit and run" }));

    expect(
      await screen.findByRole("heading", { name: "Update default evaluators?" }),
    ).toBeInTheDocument();
    expect(screen.queryByTestId("test-runner")).not.toBeInTheDocument();
  });
});
