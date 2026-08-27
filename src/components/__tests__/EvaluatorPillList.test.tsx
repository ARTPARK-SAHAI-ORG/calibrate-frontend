import { render, screen, setupUser, waitFor } from "@/test-utils";
import { EvaluatorPillList, NamePillList } from "../EvaluatorPillList";
import { fetchEvaluatorDetail } from "@/lib/evaluatorApi";

jest.mock("../../hooks", () => ({
  ...jest.requireActual("../../hooks"),
  useAccessToken: () => "tok",
}));

jest.mock("../../lib/evaluatorApi", () => ({
  ...jest.requireActual("../../lib/evaluatorApi"),
  fetchEvaluatorDetail: jest.fn(),
}));

jest.mock("../../lib/reportError", () => ({ reportError: jest.fn() }));

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

beforeEach(() => {
  jest.clearAllMocks();
  mockFetch.mockResolvedValue({
    uuid: "1",
    name: "Conciseness",
    description: "Rates how concise the output is",
    output_type: "rating" as const,
    evaluator_type: "llm",
    live_version_index: 0,
    versions: [
      {
        uuid: "v1",
        version_number: 1,
        judge_model: "google/gemini-2.5-flash",
        system_prompt: "Judge whether the reply is concise.",
        output_config: null,
        variables: null,
      },
    ],
  });
});

describe("EvaluatorPillList", () => {
  it("shows a dash when there are no evaluators", () => {
    render(<EvaluatorPillList evaluators={[]} />);
    expect(screen.getByText("—")).toBeInTheDocument();
  });

  it("shows every evaluator as its own pill when there are 2 or fewer", () => {
    render(
      <EvaluatorPillList
        evaluators={[
          { uuid: "1", name: "Conciseness" },
          { uuid: "2", name: "Correctness" },
        ]}
      />,
    );
    expect(screen.getByText("Conciseness")).toBeInTheDocument();
    expect(screen.getByText("Correctness")).toBeInTheDocument();
    expect(screen.queryByText(/^\+/)).not.toBeInTheDocument();
  });

  it("folds evaluators past the first into a +N chip", () => {
    render(
      <EvaluatorPillList
        evaluators={[
          { uuid: "1", name: "Script Fidelity test" },
          { uuid: "2", name: "Reply Conciseness" },
          { uuid: "3", name: "Hindi Language adherence" },
          { uuid: "4", name: "Correctness" },
        ]}
      />,
    );
    expect(screen.getByText("Script Fidelity test")).toBeInTheDocument();
    expect(screen.getByText("+3")).toBeInTheDocument();
    expect(screen.queryByText("Reply Conciseness")).not.toBeInTheDocument();
  });

  it("shows the folded evaluators as pills in a tooltip on hover", async () => {
    const user = setupUser();
    render(
      <EvaluatorPillList
        evaluators={[
          { uuid: "1", name: "Script Fidelity test" },
          { uuid: "2", name: "Reply Conciseness" },
          { uuid: "3", name: "Hindi Language adherence" },
        ]}
      />,
    );

    expect(screen.queryByText("Reply Conciseness")).not.toBeInTheDocument();

    await user.hover(screen.getByText("+2"));
    expect(await screen.findByText("Reply Conciseness")).toBeInTheDocument();
    expect(screen.getByText("Hindi Language adherence")).toBeInTheDocument();

    await user.unhover(screen.getByText("+2"));
    await waitFor(() =>
      expect(screen.queryByText("Reply Conciseness")).not.toBeInTheDocument(),
    );
  });

  it("shows each visible evaluator as a button, not a link", () => {
    render(
      <EvaluatorPillList
        evaluators={[{ uuid: "1", name: "Conciseness" }]}
      />,
    );
    expect(
      screen.getByRole("button", { name: "Conciseness" }),
    ).toBeInTheDocument();
    expect(screen.queryByRole("link")).not.toBeInTheDocument();
  });

  it("opens a preview of how the evaluator judges when a pill is clicked", async () => {
    const user = setupUser();
    render(
      <EvaluatorPillList
        evaluators={[{ uuid: "1", name: "Conciseness" }]}
      />,
    );

    await user.click(screen.getByRole("button", { name: "Conciseness" }));

    expect(
      await screen.findByText("Judge whether the reply is concise."),
    ).toBeInTheDocument();
    expect(mockFetch).toHaveBeenCalledWith("1", "tok");
  });

  it("closes the preview and shows nothing else open", async () => {
    const user = setupUser();
    render(
      <EvaluatorPillList
        evaluators={[{ uuid: "1", name: "Conciseness" }]}
      />,
    );

    await user.click(screen.getByRole("button", { name: "Conciseness" }));
    await screen.findByText("Judge whether the reply is concise.");

    await user.click(screen.getByRole("button", { name: "Close preview" }));
    await waitFor(() =>
      expect(
        screen.queryByText("Judge whether the reply is concise."),
      ).not.toBeInTheDocument(),
    );
  });
});

describe("pills for names with no evaluator behind them", () => {
  it("shows a plain pill that cannot be clicked through to a preview", () => {
    render(<EvaluatorPillList evaluators={[{ name: "Correctness" }]} />);

    expect(screen.getByText("Correctness")).toBeInTheDocument();
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
  });

  it("folds a long list of plain names into a +N chip", () => {
    render(<NamePillList names={["a", "b", "c", "d", "e"]} />);

    expect(screen.getByText("a")).toBeInTheDocument();
    expect(screen.getByText("+4")).toBeInTheDocument();
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
  });
});
