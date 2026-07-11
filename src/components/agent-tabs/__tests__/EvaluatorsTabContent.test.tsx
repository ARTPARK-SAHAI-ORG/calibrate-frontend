import { render, screen, waitFor, setupUser } from "@/test-utils";
import { EvaluatorsTabContent } from "../EvaluatorsTabContent";
import type { EvaluatorData } from "@/lib/evaluatorApi";

// The tab only needs a stable access token to kick off its loads.
jest.mock("../../../hooks", () => ({
  useAccessToken: () => "test-token",
}));

// Stub the sub-flows so this test focuses on the tab's own behaviour (list,
// empty state, header actions). Each stub renders a marker only when open.
jest.mock("../AddEvaluatorsDialog", () => ({
  AddEvaluatorsDialog: ({
    isOpen,
    onAdd,
  }: {
    isOpen: boolean;
    onAdd: (ids: string[]) => Promise<void> | void;
  }) =>
    isOpen ? (
      <div data-testid="add-dialog">
        <button type="button" onClick={() => onAdd(["ev-2"])}>
          Confirm add
        </button>
      </div>
    ) : null,
}));
jest.mock("../../evaluators/CreateEvaluatorFlow", () => ({
  CreateEvaluatorFlow: ({ open }: { open: boolean }) =>
    open ? <div data-testid="create-flow" /> : null,
}));
jest.mock("../../evaluators/DuplicateEvaluatorDialog", () => ({
  DuplicateEvaluatorDialog: ({ onClose }: { onClose: () => void }) => (
    <div data-testid="duplicate-dialog">
      <button type="button" onClick={onClose}>
        Close duplicate
      </button>
    </div>
  ),
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
  // Mirror the real helper: owned unless flagged as a built-in default.
  isOwnedEvaluator: (e: EvaluatorData) =>
    typeof e.is_default === "boolean" ? !e.is_default : !!e.owner_user_id,
}));

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
    expect(screen.getByRole("link", { name: "View" })).toHaveAttribute(
      "href",
      "/evaluators/ev-1",
    );
    expect(
      screen.getByRole("button", { name: "Remove" }),
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

  it("does not offer permanent delete for default evaluators", async () => {
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
      screen.queryByText(
        /Also delete this evaluator permanently from my evaluator library/,
      ),
    ).not.toBeInTheDocument();
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

  it("opens the create flow from the header", async () => {
    mockFetchAgentEvaluators.mockResolvedValue([evaluator()]);
    mockFetchAllEvaluators.mockResolvedValue([evaluator()]);
    const user = setupUser();

    render(<EvaluatorsTabContent agentUuid="agent-1" />);

    await screen.findByText("Follows Refund Policy");
    await user.click(screen.getByRole("button", { name: "Create evaluator" }));
    expect(screen.getByTestId("create-flow")).toBeInTheDocument();
  });

  it("opens the duplicate dialog from a card action", async () => {
    mockFetchAgentEvaluators.mockResolvedValue([evaluator()]);
    mockFetchAllEvaluators.mockResolvedValue([evaluator()]);
    const user = setupUser();

    render(<EvaluatorsTabContent agentUuid="agent-1" />);

    await screen.findByText("Follows Refund Policy");
    await user.click(screen.getByRole("button", { name: "Duplicate" }));
    expect(screen.getByTestId("duplicate-dialog")).toBeInTheDocument();
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
});
