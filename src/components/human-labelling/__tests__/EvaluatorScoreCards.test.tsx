import React from "react";
import { render, screen } from "@/test-utils";
import { EvaluatorScoreCards } from "../EvaluatorScoreCards";

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

  it("links each evaluator name to its own page by default", () => {
    render(
      <EvaluatorScoreCards
        heading="Human scores"
        description="What annotators gave"
        cards={cards}
      />,
    );
    expect(screen.getByRole("link", { name: /Correctness/ })).toHaveAttribute(
      "href",
      "/evaluators/ev-1",
    );
    expect(screen.getByRole("link", { name: /Tone/ })).toHaveAttribute(
      "href",
      "/evaluators/ev-2",
    );
  });

  it("shows the name without a link when linking is off", () => {
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
    expect(screen.queryByRole("link")).not.toBeInTheDocument();
  });
  it("wraps the cards onto more rows by default", () => {
    const { container } = render(
      <EvaluatorScoreCards
        heading="Human scores"
        description="What annotators gave"
        cards={cards}
      />,
    );
    const row = container.querySelector("section > div");
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
    const row = container.querySelector("section > div");
    expect(row).toHaveClass("overflow-x-auto");
    expect(row).not.toHaveClass("flex-wrap");
  });
});
