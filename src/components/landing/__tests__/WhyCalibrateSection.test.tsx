import { render, screen } from "@/test-utils";
import { WhyCalibrateSection } from "../WhyCalibrateSection";

describe("WhyCalibrateSection", () => {
  // The headings themselves get reworded often, so this checks the shape of the
  // argument rather than the words: a section title, two named groups of
  // problems, and the closing title over the goals.
  it("runs the argument in three beats", () => {
    const { container } = render(<WhyCalibrateSection />);

    expect(container.querySelectorAll("h2")).toHaveLength(2);
    expect(container.querySelectorAll("h3")).toHaveLength(2);
    for (const heading of container.querySelectorAll("h2, h3")) {
      expect(heading.textContent?.trim()).not.toBe("");
    }
  });

  it("opens on capability rising faster than the checks on it", () => {
    render(<WhyCalibrateSection />);

    expect(screen.getByText(/As AI becomes more capable/)).toBeInTheDocument();
    expect(
      screen.getByText(/without the checks needed to deploy it responsibly/),
    ).toBeInTheDocument();
  });

  it("names the three ways the AI fails unseen", () => {
    render(<WhyCalibrateSection />);

    for (const title of [
      "Unpredictable responses for the same input",
      "Weakest in the language your users speak",
      "The AI answers from the internet, not from your work",
      "Mistakes impact real lives",
    ]) {
      expect(screen.getByRole("heading", { name: title })).toBeInTheDocument();
    }
  });

  it("names the three reasons nothing catches it", () => {
    render(<WhyCalibrateSection />);

    for (const title of [
      "Checking a few by hand is all anyone does",
      "Evaluation lands on engineers who do not know your domain",
      "The tools that exist charge for every person you add",
    ]) {
      expect(screen.getByRole("heading", { name: title })).toBeInTheDocument();
    }
  });

  it("lists the six goals", () => {
    render(<WhyCalibrateSection />);

    for (const title of [
      "One repeatable way to find mistakes",
      "Release changes without breaking what worked",
      "Your domain experts lead",
      "More to check does not mean more work",
      "Catch failures before users do",
      "Spend your time on the AI",
    ]) {
      expect(screen.getByRole("heading", { name: title })).toBeInTheDocument();
    }
  });

  it("leaves self-hosting and pricing to the open source section", () => {
    render(<WhyCalibrateSection />);

    expect(screen.queryByText(/self-host/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/open source/i)).not.toBeInTheDocument();
  });

  it("offers both sessions, why it matters before how Calibrate does it", () => {
    render(<WhyCalibrateSection />);

    expect(
      screen.getByRole("link", { name: "Watch AI Evals 101" }),
    ).toHaveAttribute("href", "/learn#workshop-for-leaders");
    expect(
      screen.getByRole("link", { name: "Watch Calibrate 101" }),
    ).toHaveAttribute("href", "/learn#getting-started");
  });
});
