import React from "react";
import { render, screen, setupUser } from "@/test-utils";
import { EvaluatorScoreCards } from "../EvaluatorScoreCards";
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

beforeEach(() => {
  jest.clearAllMocks();
  mockFetch.mockResolvedValue({
    uuid: "ev-1",
    name: "Correctness",
    description: "Rates correctness",
    output_type: "rating",
    evaluator_type: "llm",
    live_version_index: 0,
    versions: [
      {
        uuid: "v1",
        version_number: 1,
        judge_model: "google/gemini-2.5-flash",
        system_prompt: "Judge whether the reply is correct.",
        output_config: null,
        variables: null,
      },
    ],
  });
});

const cards = [
  {
    evaluatorId: "ev-1",
    name: "Correctness",
    stat: { label: "Score", value: "75%", title: "3 of 4 items", ratio: 0.75 },
  },
  {
    evaluatorId: "ev-2",
    name: "Tone",
    stat: { label: "Score", value: "3.5 / 5", ratio: null },
  },
];

describe("EvaluatorScoreCards", () => {
  it("shows the heading, the description and one card per evaluator", () => {
    render(
      <EvaluatorScoreCards
        heading="Human scores"
        description="The scores annotators gave across the items in this task"
        cards={cards}
      />,
    );
    expect(screen.getByText("Human scores")).toBeInTheDocument();
    expect(
      screen.getByText(
        "The scores annotators gave across the items in this task",
      ),
    ).toBeInTheDocument();
    expect(screen.getByText("Correctness")).toBeInTheDocument();
    expect(screen.getByText("75%")).toBeInTheDocument();
    expect(screen.getByText("Tone")).toBeInTheDocument();
    expect(screen.getByText("3.5 / 5")).toBeInTheDocument();
  });

  it("renders nothing when there are no cards", () => {
    const { container } = render(
      <EvaluatorScoreCards
        heading="Human scores"
        description="What annotators gave"
        cards={[]}
      />,
    );
    expect(container).toBeEmptyDOMElement();
    expect(screen.queryByText("Human scores")).not.toBeInTheDocument();
  });

  it("keeps the heading and the status on screen with no cards when asked", () => {
    render(
      <EvaluatorScoreCards
        heading="Priya Sharma"
        description=""
        cards={[]}
        headingAside={<span>Pending</span>}
        showWhenEmpty
      />,
    );
    const heading = screen.getByRole("heading", { name: "Priya Sharma" });
    expect(heading.parentElement).toHaveTextContent("Pending");
  });

  it("leaves out the description line when there is nothing to explain", () => {
    const { container } = render(
      <EvaluatorScoreCards
        heading="Priya Sharma"
        description=""
        cards={[]}
        showWhenEmpty
      />,
    );
    expect(container.querySelector("p")).toBeNull();
  });

  it("opens each evaluator's preview when its name is clicked by default", async () => {
    const user = setupUser();
    render(
      <EvaluatorScoreCards
        heading="Human scores"
        description="What annotators gave"
        cards={cards}
      />,
    );
    expect(mockFetch).not.toHaveBeenCalled();
    await user.click(screen.getByRole("button", { name: /Correctness/ }));

    expect(
      await screen.findByRole("heading", { name: "Correctness" }),
    ).toBeInTheDocument();
    expect(
      await screen.findByText("Judge whether the reply is correct."),
    ).toBeInTheDocument();
    expect(mockFetch).toHaveBeenCalledWith("ev-1", "tok");
  });

  it("shows the name without a preview button when linking is off", () => {
    render(
      <EvaluatorScoreCards
        heading="Human scores"
        description="What annotators gave"
        cards={cards}
        linkEvaluators={false}
      />,
    );
    expect(screen.getByText("Correctness")).toBeInTheDocument();
    expect(screen.getByText("75%")).toBeInTheDocument();
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
  });
  it("wraps the cards onto more rows by default", () => {
    const { container } = render(
      <EvaluatorScoreCards
        heading="Human scores"
        description="What annotators gave"
        cards={cards}
      />,
    );
    const row = container.querySelector("section > div:last-of-type");
    expect(row).toHaveClass("flex-wrap");
    expect(row).not.toHaveClass("overflow-x-auto");
  });

  it("keeps the cards on one sideways-scrolling row when asked", () => {
    const { container } = render(
      <EvaluatorScoreCards
        heading="Human scores"
        description="What annotators gave"
        cards={cards}
        singleRow
      />,
    );
    const row = container.querySelector("section > div:last-of-type");
    expect(row).toHaveClass("overflow-x-auto");
    expect(row).not.toHaveClass("flex-wrap");
  });

  it("shows the status beside the heading when one is given", () => {
    render(
      <EvaluatorScoreCards
        heading="Human scores"
        description="What annotators gave"
        cards={cards}
        headingAside={<span>In progress</span>}
      />,
    );
    const heading = screen.getByRole("heading", { name: "Human scores" });
    // Beside the words, not on a line of its own.
    expect(heading.parentElement).toHaveTextContent("In progress");
  });

  it("puts the actions on the heading row, not beside the cards", () => {
    const { container } = render(
      <EvaluatorScoreCards
        heading="Human scores"
        description="What annotators gave"
        cards={cards}
        actions={<button type="button">Share</button>}
      />,
    );
    const headingRow = screen.getByRole("heading", {
      name: "Human scores",
    }).parentElement?.parentElement;
    expect(headingRow).toHaveTextContent("Share");
    // The cards row stays on its own line, unaffected by the actions.
    const cardsRow = container.querySelector("section > div:last-of-type");
    expect(cardsRow).not.toHaveTextContent("Share");
  });

  it("renders no actions slot when none are given", () => {
    render(
      <EvaluatorScoreCards
        heading="Human scores"
        description="What annotators gave"
        cards={cards}
      />,
    );
    expect(screen.queryByRole("button", { name: "Share" })).toBeNull();
  });
});
