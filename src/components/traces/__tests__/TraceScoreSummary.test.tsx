import { render, screen } from "@/test-utils";
import { TraceScoreSummary } from "@/components/traces/TraceScoreSummary";

describe("TraceScoreSummary", () => {
  it("shows one card per evaluator with its pass rate", () => {
    render(<TraceScoreSummary />);

    expect(screen.getByText("Live score")).toBeInTheDocument();

    // Each evaluator is named, and its number is the share of traces it passed.
    ["Accuracy", "Safety", "Clarity"].forEach((name) => {
      expect(screen.getByText(name)).toBeInTheDocument();
    });
    expect(screen.getByText("92%")).toBeInTheDocument();
    expect(screen.getByText("99%")).toBeInTheDocument();
    expect(screen.getByText("72%")).toBeInTheDocument();
  });

  it("colours each number by how well it scored", () => {
    render(<TraceScoreSummary />);

    expect(screen.getByText("92%").className).toContain("text-green-600");
    expect(screen.getByText("72%").className).toContain("text-yellow-600");
  });

  it("says how many traces are behind each number", () => {
    render(<TraceScoreSummary />);

    expect(screen.getByText("92%")).toHaveAttribute(
      "title",
      "1,647 of 1,790 traces passed",
    );
  });
});
