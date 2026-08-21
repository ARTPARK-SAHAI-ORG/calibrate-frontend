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
      screen.getByText("Pick an evaluator to see how it judges."),
    ).toBeInTheDocument();
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it("shows the live version's prompt, model, values and scores", async () => {
    render(<EvaluatorPromptPreview evaluatorUuid="e1" />);

    expect(
      await screen.findByText("Judge whether the reply is concise."),
    ).toBeInTheDocument();
    expect(screen.getByText("google/gemini-2.5-flash")).toBeInTheDocument();
    expect(screen.getByText("criteria")).toBeInTheDocument();
    expect(screen.getByText(/Rambling/)).toBeInTheDocument();
    // The older version is not the one it judges with.
    expect(screen.queryByText("The old prompt")).not.toBeInTheDocument();
  });

  it("falls back to the newest version when none is marked live", async () => {
    mockFetch.mockResolvedValue({ ...DETAIL, live_version_index: null });
    render(<EvaluatorPromptPreview evaluatorUuid="e1" />);
    expect(
      await screen.findByText("Judge whether the reply is concise."),
    ).toBeInTheDocument();
  });

  it("says so when the evaluator has no saved prompt", async () => {
    mockFetch.mockResolvedValue({ ...DETAIL, versions: [] });
    render(<EvaluatorPromptPreview evaluatorUuid="e1" />);
    expect(
      await screen.findByText("This evaluator has no saved prompt yet."),
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

  it("asks for each evaluator once, even when the reader comes back to it", async () => {
    const { rerender } = render(<EvaluatorPromptPreview evaluatorUuid="e1" />);
    await screen.findByText("Judge whether the reply is concise.");

    mockFetch.mockResolvedValue({ ...DETAIL, uuid: "e2", name: "Other" });
    rerender(<EvaluatorPromptPreview evaluatorUuid="e2" />);
    await screen.findByText("Other");

    rerender(<EvaluatorPromptPreview evaluatorUuid="e1" />);
    await screen.findByText("Conciseness");
    await waitFor(() => expect(mockFetch).toHaveBeenCalledTimes(2));
  });
});
