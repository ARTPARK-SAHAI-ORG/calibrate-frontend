import { render, screen, waitFor, setupUser } from "@/test-utils";
import { EvaluatorLibraryPanel } from "../EvaluatorLibraryPanel";
import {
  fetchAllEvaluators,
  deleteEvaluator,
  type EvaluatorData,
} from "@/lib/evaluatorApi";

jest.mock("../../../hooks", () => ({
  useAccessToken: () => "test-token",
}));

jest.mock("../../../lib/evaluatorApi", () => ({
  ...jest.requireActual("../../../lib/evaluatorApi"),
  fetchAllEvaluators: jest.fn(),
  deleteEvaluator: jest.fn(),
}));

// The create flow is a whole multi-step sidebar of its own; here we only care
// that the panel opens it and re-reads the list once something is created.
jest.mock("../../evaluators/CreateEvaluatorFlow", () => ({
  CreateEvaluatorFlow: ({
    open,
    onCreated,
  }: {
    open: boolean;
    onCreated: (e: { uuid: string }) => void;
  }) =>
    open ? (
      <button
        data-testid="create-flow"
        onClick={() => onCreated({ uuid: "ev-new" })}
      >
        Finish create
      </button>
    ) : null,
}));

const mockFetch = fetchAllEvaluators as jest.MockedFunction<
  typeof fetchAllEvaluators
>;
const mockDelete = deleteEvaluator as jest.MockedFunction<
  typeof deleteEvaluator
>;

const evaluator = (
  uuid: string,
  name: string,
  evaluator_type: EvaluatorData["evaluator_type"],
): EvaluatorData => ({
  uuid,
  name,
  description: `${name} description`,
  created_at: "2026-01-01T00:00:00Z",
  updated_at: "2026-01-01T00:00:00Z",
  evaluator_type,
});

beforeEach(() => {
  jest.clearAllMocks();
});

test("lists only the evaluators of this kind", async () => {
  mockFetch.mockResolvedValue([
    evaluator("ev-1", "Word accuracy", "stt"),
    evaluator("ev-2", "Voice warmth", "tts"),
  ]);

  render(
    <EvaluatorLibraryPanel evaluatorType="stt" description="Score transcripts" />,
  );

  expect(await screen.findByText("Word accuracy")).toBeInTheDocument();
  expect(screen.queryByText("Voice warmth")).not.toBeInTheDocument();
  expect(screen.getByRole("link", { name: "View" })).toHaveAttribute(
    "href",
    "/evaluators/ev-1",
  );
});

test("shows the empty state with a create action when there are none", async () => {
  mockFetch.mockResolvedValue([evaluator("ev-2", "Voice warmth", "tts")]);

  const user = setupUser();
  render(
    <EvaluatorLibraryPanel evaluatorType="stt" description="Score transcripts" />,
  );

  expect(await screen.findByText("No evaluators yet")).toBeInTheDocument();
  await user.click(screen.getByRole("button", { name: "Create evaluator" }));
  expect(screen.getByTestId("create-flow")).toBeInTheDocument();
});

test("re-reads the list after an evaluator is created", async () => {
  mockFetch.mockResolvedValue([]);
  const user = setupUser();
  render(
    <EvaluatorLibraryPanel evaluatorType="stt" description="Score transcripts" />,
  );

  await screen.findByText("No evaluators yet");
  await user.click(screen.getByRole("button", { name: "Create evaluator" }));
  await user.click(screen.getByTestId("create-flow"));

  await waitFor(() => expect(mockFetch).toHaveBeenCalledTimes(2));
});

test("deletes an evaluator after confirmation", async () => {
  mockFetch.mockResolvedValue([evaluator("ev-1", "Word accuracy", "stt")]);
  mockDelete.mockResolvedValue(undefined as never);

  const user = setupUser();
  render(
    <EvaluatorLibraryPanel evaluatorType="stt" description="Score transcripts" />,
  );

  await user.click(await screen.findByRole("button", { name: "Delete" }));
  // The card and the confirmation dialog both have a "Delete" button; the
  // dialog's is the one added last.
  const deleteButtons = screen.getAllByRole("button", { name: "Delete" });
  await user.click(deleteButtons[deleteButtons.length - 1]);

  await waitFor(() =>
    expect(mockDelete).toHaveBeenCalledWith("ev-1", "test-token"),
  );
  await waitFor(() =>
    expect(screen.queryByText("Word accuracy")).not.toBeInTheDocument(),
  );
});

test("keeps the dialog open and says what failed when a delete fails", async () => {
  mockFetch.mockResolvedValue([evaluator("ev-1", "Word accuracy", "stt")]);
  mockDelete.mockRejectedValue(new Error("Evaluator is in use"));

  const user = setupUser();
  render(
    <EvaluatorLibraryPanel evaluatorType="stt" description="Score transcripts" />,
  );

  await user.click(await screen.findByRole("button", { name: "Delete" }));
  // The card and the confirmation dialog both have a "Delete" button; the
  // dialog's is the one added last.
  const deleteButtons = screen.getAllByRole("button", { name: "Delete" });
  await user.click(deleteButtons[deleteButtons.length - 1]);

  expect(await screen.findByText("Evaluator is in use")).toBeInTheDocument();
  expect(screen.getByText("Word accuracy")).toBeInTheDocument();
});

test("offers a retry when the list cannot be loaded", async () => {
  mockFetch.mockRejectedValueOnce(new Error("Network down"));
  mockFetch.mockResolvedValueOnce([evaluator("ev-1", "Word accuracy", "stt")]);

  const user = setupUser();
  render(
    <EvaluatorLibraryPanel evaluatorType="stt" description="Score transcripts" />,
  );

  expect(await screen.findByText("Network down")).toBeInTheDocument();
  await user.click(screen.getByRole("button", { name: "Retry" }));
  expect(await screen.findByText("Word accuracy")).toBeInTheDocument();
});
