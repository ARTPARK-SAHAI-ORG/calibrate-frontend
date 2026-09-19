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

  it("shows every evaluator as a wrapping pill in flow layout, with no +N chip", () => {
    render(
      <EvaluatorPillList
        layout="flow"
        evaluators={[
          { uuid: "1", name: "Conciseness" },
          { uuid: "2", name: "Correctness" },
          { uuid: "3", name: "Helpfulness" },
        ]}
      />,
    );
    expect(screen.getByRole("button", { name: "Conciseness" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Correctness" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Helpfulness" })).toBeInTheDocument();
    expect(screen.queryByText(/^\+/)).not.toBeInTheDocument();
  });

  it("shows optional detail next to a flow pill", () => {
    render(
      <EvaluatorPillList
        layout="flow"
        evaluators={[
          {
            uuid: "1",
            name: "Correctness",
            detail: "Needs extra details that are not set for this agent",
          },
          { uuid: "2", name: "Tone" },
        ]}
      />,
    );
    expect(screen.getByRole("button", { name: "Correctness" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Tone" })).toBeInTheDocument();
    expect(
      screen.getByText("Needs extra details that are not set for this agent"),
    ).toBeInTheDocument();
  });

  it("renders nothing when a flow list is empty", () => {
    render(<EvaluatorPillList layout="flow" evaluators={[]} />);
    expect(screen.queryByText("—")).not.toBeInTheDocument();
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
  });

  it("opens a preview from a flow pill", async () => {
    const user = setupUser();
    render(
      <EvaluatorPillList
        layout="flow"
        evaluators={[{ uuid: "1", name: "Conciseness" }]}
      />,
    );

    await user.click(screen.getByRole("button", { name: "Conciseness" }));

    expect(
      await screen.findByText("Judge whether the reply is concise."),
    ).toBeInTheDocument();
    expect(mockFetch).toHaveBeenCalledWith("1", "tok");
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

describe("the full name on hover", () => {
  it("does not repeat a name the column shows in full", async () => {
    const user = setupUser();
    render(<NamePillList names={["openai/gpt-5.6-sol"]} />);

    await user.hover(screen.getByText("openai/gpt-5.6-sol"));
    await new Promise((resolve) => setTimeout(resolve, 50));
    // Still only the pill itself, no popup saying the same thing again.
    expect(screen.getAllByText("openai/gpt-5.6-sol")).toHaveLength(1);
  });

  it("shows the full name when the column has cut it off", async () => {
    const user = setupUser();
    // jsdom has no layout, so the cut-off name is described directly.
    const scrollWidth = jest
      .spyOn(HTMLElement.prototype, "scrollWidth", "get")
      .mockReturnValue(300);
    const clientWidth = jest
      .spyOn(HTMLElement.prototype, "clientWidth", "get")
      .mockReturnValue(80);

    render(<NamePillList names={["a very long model name indeed"]} />);

    await user.hover(screen.getByText("a very long model name indeed"));
    await waitFor(() =>
      expect(
        screen.getAllByText("a very long model name indeed").length,
      ).toBeGreaterThan(1),
    );

    scrollWidth.mockRestore();
    clientWidth.mockRestore();
  });
});

  it("keeps watching the pill after the name turns out to be cut off", async () => {
    // The wrapper around the pill changes when the name is cut off, which
    // mounts a new span. If the size watcher stayed on the old one, widening
    // the column later would never clear the hover text.
    const observed: Element[] = [];
    class RecordingResizeObserver {
      observe(el: Element) {
        observed.push(el);
      }
      disconnect() {}
    }
    const previous = global.ResizeObserver;
    (
      global as unknown as { ResizeObserver: typeof RecordingResizeObserver }
    ).ResizeObserver = RecordingResizeObserver;
    const scrollWidth = jest
      .spyOn(HTMLElement.prototype, "scrollWidth", "get")
      .mockReturnValue(300);
    const clientWidth = jest
      .spyOn(HTMLElement.prototype, "clientWidth", "get")
      .mockReturnValue(80);

    render(<NamePillList names={["a very long model name indeed"]} />);

    await waitFor(() => expect(observed.length).toBeGreaterThan(1));
    expect(document.body.contains(observed[observed.length - 1])).toBe(true);

    scrollWidth.mockRestore();
    clientWidth.mockRestore();
    (global as unknown as { ResizeObserver: unknown }).ResizeObserver = previous;
  });

describe("the evaluators folded into the +N chip", () => {
  it("opens a preview when one of them is clicked", async () => {
    const user = setupUser();
    render(
      <EvaluatorPillList
        evaluators={[
          { uuid: "1", name: "Script Fidelity test" },
          { uuid: "2", name: "Reply Conciseness" },
          { uuid: "3", name: "Correctness" },
        ]}
      />,
    );

    await user.hover(screen.getByText("+2"));
    await user.click(
      await screen.findByRole("button", { name: "Reply Conciseness" }),
    );

    expect(
      await screen.findByText("Judge whether the reply is concise."),
    ).toBeInTheDocument();
    expect(mockFetch).toHaveBeenCalledWith("2", "tok");
  });

  it("does not give a long name in the popup its own hover text", async () => {
    // Hover text there would be drawn outside the popup, so moving onto it
    // would close the popup and leave one name floating on its own. Inside the
    // popup a long name runs onto a second line instead.
    const user = setupUser();
    const scrollWidth = jest
      .spyOn(HTMLElement.prototype, "scrollWidth", "get")
      .mockReturnValue(300);
    const clientWidth = jest
      .spyOn(HTMLElement.prototype, "clientWidth", "get")
      .mockReturnValue(80);

    render(
      <EvaluatorPillList
        evaluators={[
          { uuid: "1", name: "Script Fidelity test" },
          { uuid: "2", name: "a very long evaluator name indeed" },
          { uuid: "3", name: "Correctness" },
        ]}
      />,
    );

    await user.hover(screen.getByText("+2"));
    const pill = await screen.findByRole("button", {
      name: "a very long evaluator name indeed",
    });
    await user.hover(pill);
    await new Promise((resolve) => setTimeout(resolve, 50));
    // Only the pill in the popup, no second copy in hover text of its own.
    expect(
      screen.getAllByText("a very long evaluator name indeed"),
    ).toHaveLength(1);
    // And the popup is still open.
    expect(screen.getByText("Correctness")).toBeInTheDocument();

    scrollWidth.mockRestore();
    clientWidth.mockRestore();
  });

  it("does not pass the click on to the row behind it", async () => {
    const user = setupUser();
    const onRowClick = jest.fn();
    render(
      <div onClick={onRowClick}>
        <EvaluatorPillList
          evaluators={[
            { uuid: "1", name: "Script Fidelity test" },
            { uuid: "2", name: "Reply Conciseness" },
            { uuid: "3", name: "Correctness" },
          ]}
        />
      </div>,
    );

    await user.hover(screen.getByText("+2"));
    await user.click(
      await screen.findByRole("button", { name: "Reply Conciseness" }),
    );

    await screen.findByText("Judge whether the reply is concise.");
    expect(onRowClick).not.toHaveBeenCalled();
  });

  it("does not open the row when the preview is closed by clicking outside it", async () => {
    const user = setupUser();
    const onRowClick = jest.fn();
    render(
      <div onClick={onRowClick}>
        <EvaluatorPillList evaluators={[{ uuid: "1", name: "Conciseness" }]} />
      </div>,
    );

    await user.click(screen.getByRole("button", { name: "Conciseness" }));
    const heading = await screen.findByText(
      "Judge whether the reply is concise.",
    );
    onRowClick.mockClear();

    // The dark area around the preview closes it.
    await user.click(heading.closest("div.fixed") as HTMLElement);
    await waitFor(() =>
      expect(
        screen.queryByText("Judge whether the reply is concise."),
      ).not.toBeInTheDocument(),
    );
    expect(onRowClick).not.toHaveBeenCalled();
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

describe("two items sharing a name", () => {
  it("draws both pills without React complaining about repeated keys", () => {
    const warn = jest.spyOn(console, "error").mockImplementation(() => {});
    render(<NamePillList names={["Correctness", "Correctness"]} />);

    expect(screen.getAllByText("Correctness")).toHaveLength(2);
    expect(warn).not.toHaveBeenCalled();
    warn.mockRestore();
  });
});

describe("a cell with room for one name", () => {
  it("keeps the first name and folds the rest into the +N chip", () => {
    render(<NamePillList names={["a", "b"]} maxVisible={1} />);

    expect(screen.getByText("a")).toBeInTheDocument();
    expect(screen.getByText("+1")).toBeInTheDocument();
    expect(screen.queryByText("b")).not.toBeInTheDocument();
  });

  it("shows a lone name on its own", () => {
    render(<NamePillList names={["a"]} maxVisible={1} />);

    expect(screen.getByText("a")).toBeInTheDocument();
    expect(screen.queryByText(/^\+/)).not.toBeInTheDocument();
  });
});
