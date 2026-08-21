import { render, screen, setupUser, waitFor } from "@/test-utils";
import { EvaluatorPromptPreview } from "../EvaluatorPromptPreview";
import { fetchEvaluatorDetail } from "@/lib/evaluatorApi";

jest.mock("../../../hooks", () => ({
  ...jest.requireActual("../../../hooks"),
  useAccessToken: () => "tok",
}));

jest.mock("../../../lib/evaluatorApi", () => ({
  ...jest.requireActual("../../../lib/evaluatorApi"),
  fetchEvaluatorDetail: jest.fn(),
}));

jest.mock("../../../lib/reportError", () => ({ reportError: jest.fn() }));

// jsdom has no ResizeObserver; the prompt card measures its own overflow.
class MockResizeObserver {
  observe() {}
  disconnect() {}
}

beforeAll(() => {
  (
    global as unknown as { ResizeObserver: typeof MockResizeObserver }
  ).ResizeObserver = MockResizeObserver;
});

const mockFetch = fetchEvaluatorDetail as jest.Mock;

const DETAIL = {
  uuid: "e1",
  name: "Conciseness",
  description: "Rates how concise the output is",
  output_type: "rating" as const,
  evaluator_type: "llm",
  live_version_index: 1,
  versions: [
    {
      uuid: "v1",
      version_number: 1,
      judge_model: "old/model",
      system_prompt: "The old prompt",
      output_config: null,
      variables: null,
    },
    {
      uuid: "v2",
      version_number: 2,
      judge_model: "google/gemini-2.5-flash",
      system_prompt: "Judge whether the reply is concise.",
      output_config: {
        scale: [
          { value: 1, name: "Rambling" },
          { value: 5, name: "Tight" },
        ],
      },
      variables: [{ name: "criteria", description: "What to look for" }],
    },
  ],
};

beforeEach(() => {
  jest.clearAllMocks();
  mockFetch.mockResolvedValue(DETAIL);
});

describe("EvaluatorPromptPreview", () => {
  it("asks the reader to pick one before anything is chosen", () => {
    render(<EvaluatorPromptPreview evaluatorUuid={null} />);
    expect(
      screen.getByText("Select an evaluator to see its details"),
    ).toBeInTheDocument();
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it("shows the live version's prompt, model, values and scores", async () => {
    render(<EvaluatorPromptPreview evaluatorUuid="e1" />);

    expect(
      await screen.findByText("Judge whether the reply is concise."),
    ).toBeInTheDocument();
    expect(screen.getByText("google/gemini-2.5-flash")).toBeInTheDocument();
    expect(screen.getByText("{{criteria}}")).toBeInTheDocument();
    expect(screen.getByText("Rambling")).toBeInTheDocument();
    expect(screen.getByText("Tight")).toBeInTheDocument();
    // The older version is not the one it judges with.
    expect(screen.queryByText("The old prompt")).not.toBeInTheDocument();
  });

  it("shows only the version marked as current", async () => {
    // The same helper the evaluator page uses, so the two cannot disagree.
    mockFetch.mockResolvedValue({ ...DETAIL, live_version_index: 0 });
    render(<EvaluatorPromptPreview evaluatorUuid="e1" />);
    expect(await screen.findByText("The old prompt")).toBeInTheDocument();
    expect(
      screen.queryByText("Judge whether the reply is concise."),
    ).not.toBeInTheDocument();
  });

  it("says so when no version is marked as current", async () => {
    mockFetch.mockResolvedValue({ ...DETAIL, live_version_index: null });
    render(<EvaluatorPromptPreview evaluatorUuid="e1" />);
    expect(
      await screen.findByText(
        "This evaluator has no version marked as current",
      ),
    ).toBeInTheDocument();
  });

  it("offers a retry when the fetch fails, and succeeds on the retry", async () => {
    const user = setupUser();
    mockFetch.mockRejectedValueOnce(new Error("boom"));
    render(<EvaluatorPromptPreview evaluatorUuid="e1" />);

    expect(
      await screen.findByText(/Could not load this evaluator/),
    ).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Try again" }));
    expect(
      await screen.findByText("Judge whether the reply is concise."),
    ).toBeInTheDocument();
  });

  it("does not repeat the name and pills already on the row", async () => {
    render(<EvaluatorPromptPreview evaluatorUuid="e1" />);
    await screen.findByText("Judge whether the reply is concise.");
    expect(screen.queryByText("Conciseness")).not.toBeInTheDocument();
    expect(
      screen.queryByText("Rates how concise the output is"),
    ).not.toBeInTheDocument();
  });

  it("asks for each evaluator once, even when the reader comes back to it", async () => {
    const other = {
      ...DETAIL,
      uuid: "e2",
      versions: [
        { ...DETAIL.versions[1], system_prompt: "A different prompt" },
      ],
      live_version_index: 0,
    };
    const { rerender } = render(<EvaluatorPromptPreview evaluatorUuid="e1" />);
    await screen.findByText("Judge whether the reply is concise.");

    mockFetch.mockResolvedValue(other);
    rerender(<EvaluatorPromptPreview evaluatorUuid="e2" />);
    await screen.findByText("A different prompt");

    rerender(<EvaluatorPromptPreview evaluatorUuid="e1" />);
    await screen.findByText("Judge whether the reply is concise.");
    await waitFor(() => expect(mockFetch).toHaveBeenCalledTimes(2));
  });
});
