import { render, screen, waitFor, setupUser } from "@/test-utils";
import { EvaluatorsTabContent } from "../EvaluatorsTabContent";
import { fetchEvaluatorDetail } from "@/lib/evaluatorApi";
import type { EvaluatorData } from "@/lib/evaluatorApi";

// jsdom has no ResizeObserver; EvaluatorPreviewModal's prompt card measures
// its own overflow.
class MockResizeObserver {
  observe() {}
  disconnect() {}
}

beforeAll(() => {
  (
    global as unknown as { ResizeObserver: typeof MockResizeObserver }
  ).ResizeObserver = MockResizeObserver;
});

// The tab only needs a stable access token to kick off its loads.
jest.mock("../../../hooks", () => ({
  ...jest.requireActual("../../../hooks"),
  useAccessToken: () => "test-token",
}));

// Stub the sub-flows so this test focuses on the tab's own behaviour (list,
// empty state, header actions). Each stub renders a marker only when open.
jest.mock("../AddEvaluatorsDialog", () => ({
  AddEvaluatorsDialog: ({
    isOpen,
    onAdd,
    availableEvaluators,
    onEvaluatorDeleted,
  }: {
    isOpen: boolean;
    onAdd: (ids: string[]) => Promise<void> | void;
    availableEvaluators: EvaluatorData[];
    onEvaluatorDeleted?: (uuid: string) => void;
  }) =>
    isOpen ? (
      <div data-testid="add-dialog">
        <span data-testid="available-evaluator-types">
          {availableEvaluators.map((e) => e.evaluator_type).join(",")}
        </span>
        <span data-testid="available-evaluator-names">
          {availableEvaluators.map((e) => e.name).join(",")}
        </span>
        <button type="button" onClick={() => onAdd(["ev-2"])}>
          Confirm add
        </button>
        <button type="button" onClick={() => onEvaluatorDeleted?.("ev-2")}>
          Report deleted
        </button>
      </div>
    ) : null,
}));
jest.mock("../../evaluators/CreateEvaluatorFlow", () => ({
  CreateEvaluatorFlow: ({
    open,
    useCaseTypes,
  }: {
    open: boolean;
    useCaseTypes: string[];
  }) =>
    open ? (
      <div data-testid="create-flow">
        <span data-testid="use-case-types">{useCaseTypes.join(",")}</span>
      </div>
    ) : null,
}));

const mockFetchAgentEvaluators = jest.fn();
const mockFetchAllEvaluators = jest.fn();
const mockDetach = jest.fn();
const mockDelete = jest.fn();
const mockAttach = jest.fn();
jest.mock("../../../lib/evaluatorApi", () => ({
  fetchAgentEvaluators: (...args: unknown[]) =>
    mockFetchAgentEvaluators(...args),
  fetchAllEvaluators: (...args: unknown[]) => mockFetchAllEvaluators(...args),
  addEvaluatorsToAgent: (...args: unknown[]) => mockAttach(...args),
  detachEvaluatorFromAgent: (...args: unknown[]) => mockDetach(...args),
  deleteEvaluator: (...args: unknown[]) => mockDelete(...args),
  // Mirror the real helpers: owned unless flagged as a built-in default.
  isOwnedEvaluator: (e: EvaluatorData) =>
    typeof e.is_default === "boolean" ? !e.is_default : !!e.owner_user_id,
  isDefaultEvaluator: (e: EvaluatorData) =>
    typeof e.is_default === "boolean" ? e.is_default : !e.owner_user_id,
  canDeleteEvaluator: (e: EvaluatorData) => !e.is_protected,
  // EvaluatorPreviewModal -> EvaluatorPromptPreview reads this directly.
  fetchEvaluatorDetail: jest.fn(),
}));

const mockFetchEvaluatorDetail = fetchEvaluatorDetail as jest.Mock;

const evaluator = (over: Partial<EvaluatorData> = {}): EvaluatorData => ({
  uuid: "ev-1",
  name: "Follows Refund Policy",
  description: "Checks the agent honours the refund policy",
  created_at: "2026-01-01T00:00:00Z",
  updated_at: "2026-01-01T00:00:00Z",
  owner_user_id: "user-1",
  output_type: "binary",
  evaluator_type: "llm",
  ...over,
});

beforeEach(() => {
  jest.clearAllMocks();
});

describe("EvaluatorsTabContent", () => {
  it("shows the empty state with add + create actions when nothing is attached", async () => {
    mockFetchAgentEvaluators.mockResolvedValue([]);
    mockFetchAllEvaluators.mockResolvedValue([]);

    render(<EvaluatorsTabContent agentUuid="agent-1" />);

    expect(
      await screen.findByText("No evaluators added yet"),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Add evaluators" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Create evaluator" }),
    ).toBeInTheDocument();
  });

  it("renders attached evaluators as cards", async () => {
    mockFetchAgentEvaluators.mockResolvedValue([evaluator()]);
    mockFetchAllEvaluators.mockResolvedValue([evaluator()]);

    render(<EvaluatorsTabContent agentUuid="agent-1" />);

    expect(
      await screen.findByText("Follows Refund Policy"),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "View" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Remove" }),
    ).toBeInTheDocument();
  });

  it("opens the evaluator preview from the View button, and closes it", async () => {
    mockFetchAgentEvaluators.mockResolvedValue([evaluator()]);
    mockFetchAllEvaluators.mockResolvedValue([evaluator()]);
    mockFetchEvaluatorDetail.mockResolvedValue({
      uuid: "ev-1",
      name: "Follows Refund Policy",
      description: "Checks the agent honours the refund policy",
      output_type: "binary",
      evaluator_type: "llm",
      live_version_index: 0,
      versions: [
        {
          uuid: "v1",
          version_number: 1,
          judge_model: "google/gemini-2.5-flash",
          system_prompt: "Judge whether the refund policy was followed.",
          output_config: null,
          variables: null,
        },
      ],
    });
    const user = setupUser();

    render(<EvaluatorsTabContent agentUuid="agent-1" />);

    await screen.findByText("Follows Refund Policy");
    await user.click(screen.getByRole("button", { name: "View" }));

    expect(
      await screen.findByRole("heading", { name: "Follows Refund Policy", level: 2 }),
    ).toBeInTheDocument();
    expect(
      await screen.findByText("Judge whether the refund policy was followed."),
    ).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Close preview" }));
    expect(
      screen.queryByRole("heading", { name: "Follows Refund Policy", level: 2 }),
    ).not.toBeInTheDocument();
  });

  it("opens the evaluator preview from clicking the card itself", async () => {
    mockFetchAgentEvaluators.mockResolvedValue([evaluator()]);
    mockFetchAllEvaluators.mockResolvedValue([evaluator()]);
    mockFetchEvaluatorDetail.mockResolvedValue({
      uuid: "ev-1",
      name: "Follows Refund Policy",
      description: "Checks the agent honours the refund policy",
      output_type: "binary",
      evaluator_type: "llm",
      live_version_index: 0,
      versions: [
        {
          uuid: "v1",
          version_number: 1,
          judge_model: "google/gemini-2.5-flash",
          system_prompt: "Judge whether the refund policy was followed.",
          output_config: null,
          variables: null,
        },
      ],
    });
    const user = setupUser();

    render(<EvaluatorsTabContent agentUuid="agent-1" />);

    await screen.findByText("Follows Refund Policy");
    await user.click(
      screen.getByRole("button", { name: "Open Follows Refund Policy" }),
    );

    expect(
      await screen.findByRole("heading", { name: "Follows Refund Policy", level: 2 }),
    ).toBeInTheDocument();
  });

  it("opens the add dialog from the empty-state button", async () => {
    mockFetchAgentEvaluators.mockResolvedValue([]);
    mockFetchAllEvaluators.mockResolvedValue([]);
    const user = setupUser();

    render(<EvaluatorsTabContent agentUuid="agent-1" />);

    await screen.findByText("No evaluators added yet");
    await user.click(screen.getByRole("button", { name: "Add evaluators" }));
    expect(screen.getByTestId("add-dialog")).toBeInTheDocument();
  });

  it("drops an evaluator deleted from the picker out of the list it offers", async () => {
    mockFetchAgentEvaluators.mockResolvedValue([]);
    mockFetchAllEvaluators.mockResolvedValue([
      evaluator({ uuid: "ev-2", name: "Tone check" }),
      evaluator({ uuid: "ev-3", name: "Policy fit" }),
    ]);
    const user = setupUser();

    render(<EvaluatorsTabContent agentUuid="agent-1" />);
    await screen.findByText("No evaluators added yet");
    await user.click(screen.getByRole("button", { name: "Add evaluators" }));
    expect(screen.getByTestId("available-evaluator-names").textContent).toBe(
      "Tone check,Policy fit",
    );

    // Deleted from the workspace: it must not still be on offer, or its row
    // would open nothing and adding it would fail.
    await user.click(screen.getByRole("button", { name: "Report deleted" }));
    expect(screen.getByTestId("available-evaluator-names").textContent).toBe(
      "Policy fit",
    );
  });

  it("detaches an evaluator after confirming the remove dialog", async () => {
    mockFetchAgentEvaluators.mockResolvedValue([evaluator()]);
    mockFetchAllEvaluators.mockResolvedValue([evaluator()]);
    mockDetach.mockResolvedValue(undefined);
    const user = setupUser();

    render(<EvaluatorsTabContent agentUuid="agent-1" />);

    await screen.findByText("Follows Refund Policy");
    await user.click(screen.getByRole("button", { name: "Remove" }));

    expect(await screen.findByText("Remove evaluator")).toBeInTheDocument();
    expect(
      screen.getByText(
        /Also delete this evaluator permanently from my evaluator library/,
      ),
    ).toBeInTheDocument();
    const removeButtons = screen.getAllByRole("button", { name: "Remove" });
    await user.click(removeButtons[removeButtons.length - 1]);

    await waitFor(() =>
      expect(mockDetach).toHaveBeenCalledWith("agent-1", "ev-1", "test-token"),
    );
    expect(mockDelete).not.toHaveBeenCalled();
  });

  it("keeps the remove dialog open and shows the error when detach fails", async () => {
    mockFetchAgentEvaluators.mockResolvedValue([evaluator()]);
    mockFetchAllEvaluators.mockResolvedValue([evaluator()]);
    mockDetach.mockRejectedValue(new Error("Server unavailable"));
    const user = setupUser();

    render(<EvaluatorsTabContent agentUuid="agent-1" />);

    await screen.findByText("Follows Refund Policy");
    await user.click(screen.getByRole("button", { name: "Remove" }));
    await screen.findByText("Remove evaluator");

    const removeButtons = screen.getAllByRole("button", { name: "Remove" });
    await user.click(removeButtons[removeButtons.length - 1]);

    // Error is surfaced; the card is still present (dialog didn't close/apply).
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Server unavailable",
    );
    expect(screen.getByText("Follows Refund Policy")).toBeInTheDocument();
  });

  it("offers permanent delete for default (forked) evaluators", async () => {
    // Org defaults are now editable/deletable forks, so the permanent-delete
    // option must be available on them too.
    mockFetchAgentEvaluators.mockResolvedValue([
      evaluator({ owner_user_id: null, is_default: true, name: "Correctness" }),
    ]);
    mockFetchAllEvaluators.mockResolvedValue([
      evaluator({ owner_user_id: null, is_default: true, name: "Correctness" }),
    ]);
    const user = setupUser();

    render(<EvaluatorsTabContent agentUuid="agent-1" />);

    await screen.findByText("Correctness");
    await user.click(screen.getByRole("button", { name: "Remove" }));

    expect(await screen.findByText("Remove evaluator")).toBeInTheDocument();
    expect(
      screen.getByText(
        /Also delete this evaluator permanently from my evaluator library/,
      ),
    ).toBeInTheDocument();
  });

  it("permanently deletes an owned evaluator when the checkbox is checked", async () => {
    mockFetchAgentEvaluators.mockResolvedValue([evaluator()]);
    mockFetchAllEvaluators.mockResolvedValue([evaluator()]);
    mockDelete.mockResolvedValue(undefined);
    const user = setupUser();

    render(<EvaluatorsTabContent agentUuid="agent-1" />);

    await screen.findByText("Follows Refund Policy");
    await user.click(screen.getByRole("button", { name: "Remove" }));
    await user.click(
      screen.getByRole("checkbox", {
        name: /Also delete this evaluator permanently from my evaluator library/,
      }),
    );
    expect(await screen.findByText("Delete evaluator")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Delete" }));

    await waitFor(() =>
      expect(mockDelete).toHaveBeenCalledWith("ev-1", "test-token"),
    );
    expect(mockDetach).not.toHaveBeenCalled();
  });

  it("offers no permanent delete on an evaluator that cannot be deleted", async () => {
    const locked = evaluator({ is_protected: true });
    mockFetchAgentEvaluators.mockResolvedValue([locked]);
    mockFetchAllEvaluators.mockResolvedValue([locked]);
    const user = setupUser();

    render(<EvaluatorsTabContent agentUuid="agent-1" />);

    await screen.findByText("Follows Refund Policy");
    await user.click(screen.getByRole("button", { name: "Remove" }));
    // Taking it off this agent is still fine, deleting it is not.
    expect(
      screen.queryByRole("checkbox", {
        name: /Also delete this evaluator permanently from my evaluator library/,
      }),
    ).not.toBeInTheDocument();
  });

  it("opens the create flow from the header", async () => {
    mockFetchAgentEvaluators.mockResolvedValue([evaluator()]);
    mockFetchAllEvaluators.mockResolvedValue([evaluator()]);
    const user = setupUser();

    render(<EvaluatorsTabContent agentUuid="agent-1" />);

    await screen.findByText("Follows Refund Policy");
    await user.click(screen.getByRole("button", { name: "Create evaluator" }));
    expect(screen.getByTestId("create-flow")).toBeInTheDocument();
  });

  it("shows a load error with retry when fetching evaluators fails", async () => {
    mockFetchAgentEvaluators.mockRejectedValue(new Error("Network down"));
    mockFetchAllEvaluators.mockResolvedValue([]);

    render(<EvaluatorsTabContent agentUuid="agent-1" />);

    expect(await screen.findByText("Network down")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Retry" })).toBeInTheDocument();
  });

  it("adds selected evaluators via a single POST (add-only)", async () => {
    mockFetchAgentEvaluators.mockResolvedValue([evaluator({ uuid: "ev-1" })]);
    mockFetchAllEvaluators.mockResolvedValue([
      evaluator({ uuid: "ev-1" }),
      evaluator({ uuid: "ev-2", name: "Tone check" }),
    ]);
    mockAttach.mockResolvedValue({ linked: ["ev-2"], already_linked: [] });

    const user = setupUser();
    render(<EvaluatorsTabContent agentUuid="agent-1" />);

    await screen.findByText("Follows Refund Policy");
    await user.click(screen.getByRole("button", { name: "Add evaluators" }));
    await user.click(screen.getByRole("button", { name: "Confirm add" }));

    await waitFor(() =>
      expect(mockAttach).toHaveBeenCalledWith(
        "agent-1",
        ["ev-2"],
        "test-token",
      ),
    );
  });

  it("swaps 'responses' for 'output' in copy for a general agent", async () => {
    mockFetchAgentEvaluators.mockResolvedValue([evaluator()]);
    mockFetchAllEvaluators.mockResolvedValue([evaluator()]);

    render(
      <EvaluatorsTabContent agentUuid="agent-1" agentNature="general" />,
    );

    await screen.findByText("Follows Refund Policy");
    expect(
      screen.getByText("LLM judges for evaluating the agent’s output"),
    ).toBeInTheDocument();
    expect(
      screen.queryByText(/evaluating the agent.s responses/),
    ).not.toBeInTheDocument();
  });

  it("uses the llm-general use-case type for a general agent", async () => {
    mockFetchAgentEvaluators.mockResolvedValue([evaluator()]);
    mockFetchAllEvaluators.mockResolvedValue([
      evaluator({ uuid: "ev-1" }),
      evaluator({
        uuid: "ev-2",
        name: "Output check",
        evaluator_type: "llm-general",
      }),
    ]);
    const user = setupUser();

    render(
      <EvaluatorsTabContent agentUuid="agent-1" agentNature="general" />,
    );

    await screen.findByText("Follows Refund Policy");

    await user.click(screen.getByRole("button", { name: "Create evaluator" }));
    expect(screen.getByTestId("use-case-types")).toHaveTextContent(
      "llm-general",
    );

    await user.click(screen.getByRole("button", { name: "Add evaluators" }));
    // ev-1 is already attached (filtered out); ev-2 is llm-general so it's
    // the only one offered.
    expect(screen.getByTestId("available-evaluator-types")).toHaveTextContent(
      "llm-general",
    );
  });

  it("keeps the default (llm) use-case type when agentNature is omitted", async () => {
    mockFetchAgentEvaluators.mockResolvedValue([evaluator()]);
    mockFetchAllEvaluators.mockResolvedValue([evaluator({ uuid: "ev-1" })]);
    const user = setupUser();

    render(<EvaluatorsTabContent agentUuid="agent-1" />);

    await screen.findByText("Follows Refund Policy");
    expect(
      screen.getByText("LLM judges for evaluating the agent’s responses"),
    ).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Create evaluator" }));
    expect(screen.getByTestId("use-case-types")).toHaveTextContent("llm");
  });
});
