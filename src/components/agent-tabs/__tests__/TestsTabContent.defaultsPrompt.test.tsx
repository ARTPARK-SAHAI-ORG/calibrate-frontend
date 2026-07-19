import React, { useEffect } from "react";
import { render, screen, waitFor, setupUser, within } from "@/test-utils";
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

jest.mock("../../../hooks", () => ({
  useAccessToken: () => "test-token",
  useMaxRowsPerEval: () => 100,
  useDialogUrlParam: () => ({ setParam: jest.fn() }),
  useVerifyConnection: () => ({
    isVerifying: false,
    verifyError: null,
    verifySampleResponse: null,
    verifySavedAgent: jest.fn(async () => true),
    verifyAdHoc: jest.fn(),
    dismiss: jest.fn(),
  }),
  // Keep the real start-run hook so a run still goes through the fetch router.
  useStartTestRun: () =>
    jest.requireActual("../../../hooks/useStartTestRun").useStartTestRun(),
}));

jest.mock("../../../lib/reportError", () => ({
  reportError: jest.fn(),
}));

jest.mock("../../TestRunnerDialog", () => ({
  TestRunnerDialog: () => null,
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

jest.mock("../../AddTestDialog", () => ({
  AddTestDialog: ({
    isOpen,
    onSubmit,
    testName,
    setTestName,
    isEditing,
  }: {
    isOpen: boolean;
    onSubmit: (
      config: typeof TEST_CONFIG,
      evaluators: typeof TEST_EVALUATORS,
    ) => void | Promise<void>;
    testName: string;
    setTestName: (name: string) => void;
    isEditing: boolean;
  }) => {
    useEffect(() => {
      if (isOpen && !testName.trim()) {
        setTestName(isEditing ? "Edited test" : "Saved test");
      }
    }, [isOpen, isEditing, setTestName, testName]);

    if (!isOpen) return null;

    return (
      <div data-testid="add-test-dialog" data-editing={String(isEditing)}>
        <button
          type="button"
          onClick={() => onSubmit(TEST_CONFIG, TEST_EVALUATORS)}
        >
          Submit test
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
  return {
    ok,
    status,
    json: async () => data,
  };
}

function setupFetch({
  agentTests = [] as typeof existingAgentTest[],
  bulkOk = true,
  putOk = true,
}: {
  agentTests?: typeof existingAgentTest[];
  bulkOk?: boolean;
  putOk?: boolean;
} = {}) {
  global.fetch = jest.fn(async (url: string, init?: RequestInit) => {
    if (url.includes(`/agent-tests/agent/${AGENT_UUID}/tests`)) {
      return jsonResponse({ items: agentTests, total: agentTests.length });
    }
    if (url.includes(`/agent-tests/agent/${AGENT_UUID}/runs`)) {
      return jsonResponse({ items: [], total: 0 });
    }
    if (url === `${BACKEND}/tests`) {
      return jsonResponse({ items: [], total: 0 });
    }
    if (init?.method === "POST" && url.includes("/tests/bulk")) {
      if (!bulkOk) {
        return jsonResponse({ detail: "Bulk failed" }, false, 500);
      }
      return jsonResponse({});
    }
    if (init?.method === "PUT" && url.includes("/tests/test-1")) {
      if (!putOk) {
        return jsonResponse({ detail: "Update failed" }, false, 500);
      }
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

async function createTestWithPrompt(user: ReturnType<typeof setupUser>) {
  await screen.findByRole("button", { name: "Create test" });
  await user.click(screen.getByRole("button", { name: "Create test" }));
  expect(screen.getByTestId("add-test-dialog")).toBeInTheDocument();
  await user.click(screen.getByRole("button", { name: "Submit test" }));
  expect(
    await screen.findByRole("heading", { name: "Update default evaluators?" }),
  ).toBeInTheDocument();
  expect(screen.getByText("Tone check")).toBeInTheDocument();
  expect(screen.getByTestId("add-test-dialog")).toBeInTheDocument();
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

describe("TestsTabContent agent defaults prompt", () => {
  it("shows the prompt after create when the test uses evaluators not on the agent", async () => {
    const user = setupUser();
    render(<TestsTabContent agentUuid={AGENT_UUID} />);

    await createTestWithPrompt(user);
  });

  it("dismisses the prompt without updating defaults and closes the test dialog", async () => {
    const user = setupUser();
    render(<TestsTabContent agentUuid={AGENT_UUID} />);

    await createTestWithPrompt(user);
    await user.click(screen.getByRole("button", { name: "Not now" }));

    await waitFor(() => {
      expect(
        screen.queryByRole("heading", { name: "Update default evaluators?" }),
      ).not.toBeInTheDocument();
    });
    expect(screen.queryByTestId("add-test-dialog")).not.toBeInTheDocument();
    expect(mockAttachEvaluatorToAgent).not.toHaveBeenCalled();
  });

  it("updates agent defaults and closes both dialogs on Update", async () => {
    const user = setupUser();
    render(<TestsTabContent agentUuid={AGENT_UUID} />);

    await createTestWithPrompt(user);
    await user.click(screen.getByRole("button", { name: "Update" }));

    await waitFor(() => {
      // Add-only: POST just the evaluators not already on the agent.
      expect(mockAttachEvaluatorToAgent).toHaveBeenCalledWith(
        AGENT_UUID,
        ["ev-new"],
        "test-token",
      );
    });
    expect(
      screen.queryByRole("heading", { name: "Update default evaluators?" }),
    ).not.toBeInTheDocument();
    expect(screen.queryByTestId("add-test-dialog")).not.toBeInTheDocument();
  });

  it("closes the test dialog without a prompt when all evaluators are already on the agent", async () => {
    mockFetchAgentEvaluators.mockResolvedValue([
      attachedEvaluator(),
      newEvaluator(),
    ]);
    const user = setupUser();
    render(<TestsTabContent agentUuid={AGENT_UUID} />);

    await screen.findByRole("button", { name: "Create test" });
    await user.click(screen.getByRole("button", { name: "Create test" }));
    await user.click(screen.getByRole("button", { name: "Submit test" }));

    await waitFor(() => {
      expect(screen.queryByTestId("add-test-dialog")).not.toBeInTheDocument();
    });
    expect(
      screen.queryByRole("heading", { name: "Update default evaluators?" }),
    ).not.toBeInTheDocument();
    expect(mockAttachEvaluatorToAgent).not.toHaveBeenCalled();
  });

  it("shows the prompt after editing a test save", async () => {
    setupFetch({ agentTests: [existingAgentTest] });
    const user = setupUser();
    render(<TestsTabContent agentUuid={AGENT_UUID} />);

    const matches = await screen.findAllByText("Refund test");
    await user.click(matches[0]);

    const dialog = await screen.findByTestId("add-test-dialog");
    expect(dialog).toHaveAttribute("data-editing", "true");
    await user.click(within(dialog).getByRole("button", { name: "Submit test" }));

    expect(
      await screen.findByRole("heading", { name: "Update default evaluators?" }),
    ).toBeInTheDocument();
    expect(screen.getByTestId("add-test-dialog")).toBeInTheDocument();
  });

  it("shows a visible error and allows retry when updating defaults fails", async () => {
    mockAttachEvaluatorToAgent
      .mockRejectedValueOnce(new Error("Network error"))
      .mockResolvedValueOnce(undefined);

    const user = setupUser();
    render(<TestsTabContent agentUuid={AGENT_UUID} />);

    await createTestWithPrompt(user);
    await user.click(screen.getByRole("button", { name: "Update" }));

    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent("Could not update default evaluators");
    expect(alert).toHaveTextContent("Network error");
    expect(screen.getByTestId("add-test-dialog")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Try again" }));

    await waitFor(() => {
      expect(mockAttachEvaluatorToAgent).toHaveBeenCalledTimes(2);
    });
    expect(
      screen.queryByRole("heading", { name: "Update default evaluators?" }),
    ).not.toBeInTheDocument();
  });
});
