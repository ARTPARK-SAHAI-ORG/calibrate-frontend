import { render, screen, setupUser, waitFor } from "@/test-utils";
import { AddEvaluatorsDialog } from "../AddEvaluatorsDialog";
import { deleteEvaluator } from "@/lib/evaluatorApi";
import type { EvaluatorData } from "@/lib/evaluatorApi";

// The prompt column asks the backend for the evaluator it is showing, which is
// not what these tests are about. Stand in for it with the one control they do
// need: the Delete button it offers on the evaluator being previewed.
jest.mock("../../evaluators/EvaluatorPromptPreview", () => ({
  EvaluatorPromptPreview: ({
    evaluatorUuid,
    onDelete,
  }: {
    evaluatorUuid: string | null;
    onDelete?: (uuid: string) => void;
  }) =>
    onDelete && evaluatorUuid ? (
      <button onClick={() => onDelete(evaluatorUuid)}>Delete previewed</button>
    ) : (
      <div />
    ),
}));

jest.mock("../../DeleteConfirmationDialog", () => ({
  DeleteConfirmationDialog: ({
    isOpen,
    message,
    onConfirm,
    extraContent,
  }: {
    isOpen: boolean;
    message: string;
    onConfirm: () => void;
    extraContent?: React.ReactNode;
  }) =>
    isOpen ? (
      <div>
        <p>{message}</p>
        <button onClick={onConfirm}>Confirm delete</button>
        {extraContent}
      </div>
    ) : null,
}));

jest.mock("../../../lib/evaluatorApi", () => ({
  ...jest.requireActual("../../../lib/evaluatorApi"),
  deleteEvaluator: jest.fn(),
}));

jest.mock("../../../lib/reportError", () => ({ reportError: jest.fn() }));

const deleteEvaluatorMock = deleteEvaluator as jest.Mock;

beforeEach(() => {
  jest.clearAllMocks();
  deleteEvaluatorMock.mockResolvedValue(undefined);
  localStorage.setItem("access_token", "test-token");
});

afterEach(() => {
  localStorage.clear();
});

const evaluator = (over: Partial<EvaluatorData> = {}): EvaluatorData => ({
  uuid: over.uuid ?? "ev-1",
  name: over.name ?? "Evaluator",
  description: over.description ?? "Description",
  created_at: "2026-01-01T00:00:00Z",
  updated_at: "2026-01-01T00:00:00Z",
  owner_user_id: over.owner_user_id ?? "user-1",
  // Defaults are distinguished by is_default only (every evaluator has an owner).
  is_default: over.is_default ?? false,
  output_type: "binary",
  evaluator_type: "llm",
  ...over,
});

describe("AddEvaluatorsDialog", () => {
  it("shows section headers when both default and custom evaluators are available", () => {
    render(
      <AddEvaluatorsDialog
        isOpen
        onClose={jest.fn()}
        onAdd={jest.fn()}
        availableEvaluators={[
          evaluator({
            uuid: "ev-default",
            name: "Correctness",
            is_default: true,
          }),
          evaluator({
            uuid: "ev-custom",
            name: "Tone check",
            owner_user_id: "user-1",
          }),
        ]}
      />,
    );

    expect(screen.getByText("Default")).toBeInTheDocument();
    expect(screen.getByText("My evaluators")).toBeInTheDocument();
    expect(screen.getByText("Correctness")).toBeInTheDocument();
    expect(screen.getByText("Tone check")).toBeInTheDocument();
  });

  it("hides section headers when only default evaluators are available", () => {
    render(
      <AddEvaluatorsDialog
        isOpen
        onClose={jest.fn()}
        onAdd={jest.fn()}
        availableEvaluators={[
          evaluator({
            uuid: "ev-default",
            name: "Correctness",
            is_default: true,
          }),
        ]}
      />,
    );

    expect(screen.getByText("Correctness")).toBeInTheDocument();
    expect(screen.queryByText("Default")).not.toBeInTheDocument();
    expect(screen.queryByText("My evaluators")).not.toBeInTheDocument();
  });

  it("hides section headers when only custom evaluators are available", () => {
    render(
      <AddEvaluatorsDialog
        isOpen
        onClose={jest.fn()}
        onAdd={jest.fn()}
        availableEvaluators={[
          evaluator({
            uuid: "ev-custom",
            name: "Tone check",
            owner_user_id: "user-1",
          }),
        ]}
      />,
    );

    expect(screen.getByText("Tone check")).toBeInTheDocument();
    expect(screen.queryByText("Default")).not.toBeInTheDocument();
    expect(screen.queryByText("My evaluators")).not.toBeInTheDocument();
  });

  it("unchecks a selected evaluator before adding", async () => {
    const user = setupUser();
    const onAdd = jest.fn();

    render(
      <AddEvaluatorsDialog
        isOpen
        onClose={jest.fn()}
        onAdd={onAdd}
        availableEvaluators={[evaluator({ uuid: "ev-a", name: "Tone check" })]}
      />,
    );

    const checkbox = screen.getByRole("checkbox");
    await user.click(checkbox);
    expect(screen.getByRole("button", { name: "Add (1)" })).toBeEnabled();
    await user.click(checkbox);
    expect(screen.getByRole("button", { name: "Add" })).toBeDisabled();
    expect(onAdd).not.toHaveBeenCalled();
  });

  it("filters evaluators by search and adds the selected ones", async () => {
    const user = setupUser();
    const onAdd = jest.fn().mockResolvedValue(undefined);
    const onClose = jest.fn();

    render(
      <AddEvaluatorsDialog
        isOpen
        onClose={onClose}
        onAdd={onAdd}
        availableEvaluators={[
          evaluator({
            uuid: "ev-a",
            name: "Tone check",
            owner_user_id: "user-1",
          }),
          evaluator({
            uuid: "ev-b",
            name: "Policy fit",
            owner_user_id: "user-1",
          }),
        ]}
      />,
    );

    await user.type(screen.getByPlaceholderText("Search evaluators"), "tone");
    expect(screen.getByText("Tone check")).toBeInTheDocument();
    expect(screen.queryByText("Policy fit")).not.toBeInTheDocument();

    await user.click(screen.getByRole("checkbox"));
    await user.click(screen.getByRole("button", { name: "Add (1)" }));

    await waitFor(() => expect(onAdd).toHaveBeenCalledWith(["ev-a"]));
    expect(onClose).toHaveBeenCalled();
  });

  it("shows an empty-search message when nothing matches", async () => {
    const user = setupUser();

    render(
      <AddEvaluatorsDialog
        isOpen
        onClose={jest.fn()}
        onAdd={jest.fn()}
        availableEvaluators={[evaluator({ uuid: "ev-a", name: "Tone check" })]}
      />,
    );

    await user.type(
      screen.getByPlaceholderText("Search evaluators"),
      "missing",
    );
    expect(screen.getByText("No matching evaluators.")).toBeInTheDocument();
  });

  it("shows the all-added empty state when the library list is empty", () => {
    render(
      <AddEvaluatorsDialog
        isOpen
        onClose={jest.fn()}
        onAdd={jest.fn()}
        availableEvaluators={[]}
      />,
    );

    expect(
      screen.getByText("Every evaluator in your library is already added"),
    ).toBeInTheDocument();
    // One block, not a search box and an empty prompt column beside it.
    expect(
      screen.queryByPlaceholderText("Search evaluators"),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByText("Select an evaluator to see its details"),
    ).not.toBeInTheDocument();
    // Nothing to tick, so nothing to confirm or cancel either.
    expect(
      screen.queryByRole("button", { name: "Add" }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Cancel" }),
    ).not.toBeInTheDocument();
  });

  it("keeps the dialog open and shows the error when adding fails", async () => {
    const user = setupUser();
    const onAdd = jest.fn().mockRejectedValue(new Error("Backend is down"));
    const onClose = jest.fn();

    render(
      <AddEvaluatorsDialog
        isOpen
        onClose={onClose}
        onAdd={onAdd}
        availableEvaluators={[
          evaluator({ uuid: "ev-a", name: "Tone check", owner_user_id: "u" }),
        ]}
      />,
    );

    await user.click(screen.getByRole("checkbox"));
    await user.click(screen.getByRole("button", { name: "Add (1)" }));

    // The failure is surfaced and the dialog stays open (onClose not called).
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Backend is down",
    );
    expect(onClose).not.toHaveBeenCalled();
  });
});

describe("deleting an evaluator from the preview panel", () => {
  const renderWithTwo = (props: Record<string, unknown> = {}) =>
    render(
      <AddEvaluatorsDialog
        isOpen
        onClose={jest.fn()}
        onAdd={jest.fn()}
        availableEvaluators={[
          evaluator({ uuid: "ev-a", name: "Tone check" }),
          evaluator({ uuid: "ev-b", name: "Policy fit" }),
        ]}
        {...props}
      />,
    );

  it("asks first, naming the evaluator and saying it goes from the workspace", async () => {
    const user = setupUser();
    renderWithTwo();

    await user.click(screen.getByRole("button", { name: "Delete previewed" }));

    expect(
      screen.getByText(
        'Are you sure you want to permanently delete "Tone check"? This removes it from the whole workspace, not just this agent.',
      ),
    ).toBeInTheDocument();
    expect(deleteEvaluatorMock).not.toHaveBeenCalled();
  });

  it("deletes it, unticks it, and tells the parent", async () => {
    const user = setupUser();
    const onEvaluatorDeleted = jest.fn();
    renderWithTwo({ onEvaluatorDeleted });

    await user.click(screen.getByLabelText("Select Tone check"));
    expect(screen.getByRole("button", { name: "Add (1)" })).toBeEnabled();

    await user.click(screen.getByRole("button", { name: "Delete previewed" }));
    await user.click(screen.getByRole("button", { name: "Confirm delete" }));

    await waitFor(() =>
      expect(deleteEvaluatorMock).toHaveBeenCalledWith("ev-a", "test-token"),
    );
    expect(onEvaluatorDeleted).toHaveBeenCalledWith("ev-a");
    // The count drops back: a deleted evaluator cannot still be on its way in.
    await waitFor(() =>
      expect(screen.getByRole("button", { name: "Add" })).toBeDisabled(),
    );
  });

  it("reports a failed delete and keeps the dialog open", async () => {
    const user = setupUser();
    const onEvaluatorDeleted = jest.fn();
    deleteEvaluatorMock.mockRejectedValue(new Error("Backend is down"));
    renderWithTwo({ onEvaluatorDeleted });

    await user.click(screen.getByRole("button", { name: "Delete previewed" }));
    await user.click(screen.getByRole("button", { name: "Confirm delete" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Backend is down",
    );
    expect(onEvaluatorDeleted).not.toHaveBeenCalled();
    expect(screen.getByLabelText("Select Tone check")).toBeInTheDocument();
  });
});

describe("AddEvaluatorsDialog with nothing left to add", () => {
  it("offers to create one, and hands the reader to the create flow", async () => {
    const user = setupUser();
    const onClose = jest.fn();
    const onCreateEvaluator = jest.fn();
    render(
      <AddEvaluatorsDialog
        isOpen
        availableEvaluators={[]}
        onClose={onClose}
        onAdd={jest.fn()}
        onCreateEvaluator={onCreateEvaluator}
      />,
    );

    expect(
      screen.getByText("Every evaluator in your library is already added"),
    ).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Create evaluator" }));
    // The dialog gets out of the way first, then the create flow opens.
    expect(onClose).toHaveBeenCalled();
    expect(onCreateEvaluator).toHaveBeenCalled();
  });

  it("shows no create button when the caller offers no create flow", () => {
    render(
      <AddEvaluatorsDialog
        isOpen
        availableEvaluators={[]}
        onClose={jest.fn()}
        onAdd={jest.fn()}
      />,
    );
    expect(
      screen.queryByRole("button", { name: "Create evaluator" }),
    ).not.toBeInTheDocument();
  });
});
