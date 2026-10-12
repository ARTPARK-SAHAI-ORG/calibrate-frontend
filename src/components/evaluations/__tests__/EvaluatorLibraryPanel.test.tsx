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
  // EvaluatorPreviewModal -> EvaluatorPromptPreview reads this directly.
  fetchEvaluatorDetail: jest.fn(),
}));

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

// Duplicate reads the evaluator and opens the create form on its own; here we
// only care that every card offers it and that a finished copy re-reads the
// list.
jest.mock("../../evaluators/DuplicateEvaluatorButton", () => ({
  ...jest.requireActual("../../evaluators/DuplicateEvaluatorButton"),
  DuplicateEvaluatorButton: ({
    evaluator,
    onCreated,
  }: {
    evaluator: { name: string };
    onCreated?: (e: { uuid: string }) => void;
  }) => (
    <button onClick={() => onCreated?.({ uuid: "ev-copy" })}>
      Duplicate {evaluator.name}
    </button>
  ),
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

test("offers no Delete on an evaluator that cannot be deleted", async () => {
  mockFetch.mockResolvedValue([
    { ...evaluator("ev-1", "Word accuracy", "stt"), is_protected: true },
    evaluator("ev-2", "Clarity", "stt"),
  ]);

  render(
    <EvaluatorLibraryPanel
      evaluatorTypes={["stt"]}
      description="Score transcripts"
    />,
  );

  await screen.findByText("Word accuracy");
  // One Delete for Clarity, none for the protected one.
  expect(screen.getAllByRole("button", { name: "Delete" })).toHaveLength(1);
  const protectedRow = screen.getByText("Word accuracy").closest("div");
  expect(protectedRow).not.toBeNull();
});

test("lists only the evaluators of this kind", async () => {
  mockFetch.mockResolvedValue([
    evaluator("ev-1", "Word accuracy", "stt"),
    evaluator("ev-2", "Voice warmth", "tts"),
  ]);

  render(
    <EvaluatorLibraryPanel
      evaluatorTypes={["stt"]}
      description="Score transcripts"
    />,
  );

  expect(await screen.findByText("Word accuracy")).toBeInTheDocument();
  expect(screen.queryByText("Voice warmth")).not.toBeInTheDocument();
  // View and Delete already say what they do, so neither repeats itself in a
  // hover popup.
  expect(screen.getByRole("button", { name: "View" })).not.toHaveAttribute(
    "title",
  );
  expect(screen.getByRole("button", { name: "Delete" })).not.toHaveAttribute(
    "title",
  );
});

test("shows the empty state with a create action when there are none", async () => {
  mockFetch.mockResolvedValue([evaluator("ev-2", "Voice warmth", "tts")]);

  const user = setupUser();
  render(
    <EvaluatorLibraryPanel
      evaluatorTypes={["stt"]}
      description="Score transcripts"
    />,
  );

  expect(await screen.findByText("No evaluators yet")).toBeInTheDocument();
  // The create action lives in the header row, which is on screen whether or
  // not there are any evaluators.
  await user.click(screen.getByRole("button", { name: "Create evaluator" }));
  expect(screen.getByTestId("create-flow")).toBeInTheDocument();
});

test("re-reads the list after an evaluator is created", async () => {
  mockFetch.mockResolvedValue([]);
  const user = setupUser();
  render(
    <EvaluatorLibraryPanel
      evaluatorTypes={["stt"]}
      description="Score transcripts"
    />,
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
    <EvaluatorLibraryPanel
      evaluatorTypes={["stt"]}
      description="Score transcripts"
    />,
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
    <EvaluatorLibraryPanel
      evaluatorTypes={["stt"]}
      description="Score transcripts"
    />,
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
    <EvaluatorLibraryPanel
      evaluatorTypes={["stt"]}
      description="Score transcripts"
    />,
  );

  expect(await screen.findByText("Network down")).toBeInTheDocument();
  await user.click(screen.getByRole("button", { name: "Retry" }));
  expect(await screen.findByText("Word accuracy")).toBeInTheDocument();
});

test("lists every kind it is given", async () => {
  mockFetch.mockResolvedValue([
    evaluator("ev-1", "Reply correctness", "llm"),
    evaluator("ev-2", "Output correctness", "llm-general"),
    evaluator("ev-3", "Voice warmth", "tts"),
  ]);

  render(
    <EvaluatorLibraryPanel
      evaluatorTypes={["llm", "llm-general"]}
      description="Judge replies"
    />,
  );

  expect(await screen.findByText("Reply correctness")).toBeInTheDocument();
  expect(screen.getByText("Output correctness")).toBeInTheDocument();
  expect(screen.queryByText("Voice warmth")).not.toBeInTheDocument();
});

test("narrows the list by the search box", async () => {
  mockFetch.mockResolvedValue([
    evaluator("ev-1", "Word accuracy", "stt"),
    evaluator("ev-2", "Number reading", "stt"),
  ]);

  const user = setupUser();
  render(
    <EvaluatorLibraryPanel
      evaluatorTypes={["stt"]}
      description="Score transcripts"
    />,
  );

  await screen.findByText("Word accuracy");
  await user.type(screen.getByPlaceholderText("Search evaluators"), "number");

  expect(screen.queryByText("Word accuracy")).not.toBeInTheDocument();
  expect(screen.getByText("Number reading")).toBeInTheDocument();

  await user.clear(screen.getByPlaceholderText("Search evaluators"));
  await user.type(screen.getByPlaceholderText("Search evaluators"), "zzz");
  expect(
    screen.getByText("No evaluators match your search."),
  ).toBeInTheDocument();
});

test("draws the page header when it is the whole page", async () => {
  mockFetch.mockResolvedValue([evaluator("ev-1", "Word accuracy", "stt")]);

  render(
    <EvaluatorLibraryPanel
      evaluatorTypes={["stt"]}
      title="Evaluators"
      description="Score transcripts"
    />,
  );

  expect(
    await screen.findByRole("heading", { name: "Evaluators", level: 1 }),
  ).toBeInTheDocument();
});

// The same card the agent Evaluators tab draws: clicking it, or View, opens
// how the evaluator judges over the list, with a link to its own page.
test.each([
  ["the card itself", "Open Word accuracy"],
  ["View", "View"],
])(
  "opens the evaluator preview from %s, linking to the evaluator page",
  async (_where, buttonName) => {
    mockFetch.mockResolvedValue([evaluator("ev-1", "Word accuracy", "stt")]);
    const user = setupUser();

    render(
      <EvaluatorLibraryPanel
        evaluatorTypes={["stt"]}
        description="Score transcripts"
      />,
    );

    await user.click(await screen.findByRole("button", { name: buttonName }));

    expect(
      await screen.findByRole("heading", { name: "Word accuracy", level: 2 }),
    ).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Open" })).toHaveAttribute(
      "href",
      "/evaluators/ev-1",
    );

    await user.click(screen.getByRole("button", { name: "Close preview" }));
    expect(
      screen.queryByRole("heading", { name: "Word accuracy", level: 2 }),
    ).not.toBeInTheDocument();
  },
);

test("every card offers Duplicate, and a finished copy re-reads the list", async () => {
  mockFetch.mockResolvedValue([
    evaluator("ev-1", "Word accuracy", "stt"),
    // Pre-built, so it cannot be deleted, but it can still be copied.
    { ...evaluator("ev-2", "Clarity", "stt"), is_protected: true },
  ]);
  const user = setupUser();

  render(
    <EvaluatorLibraryPanel
      evaluatorTypes={["stt"]}
      description="Score transcripts"
    />,
  );

  expect(
    await screen.findByRole("button", { name: "Duplicate Clarity" }),
  ).toBeInTheDocument();
  await user.click(
    screen.getByRole("button", { name: "Duplicate Word accuracy" }),
  );

  await waitFor(() => expect(mockFetch).toHaveBeenCalledTimes(2));
});
