import { render, screen } from "@/test-utils";
import { WhyCalibrateSection } from "../WhyCalibrateSection";

describe("WhyCalibrateSection", () => {
  it("lists every reason evaluation is hard today, numbered in order", () => {
    render(<WhyCalibrateSection />);

    expect(
      screen.getByRole("heading", {
        name: "Why AI evaluation is broken today",
      }),
    ).toBeInTheDocument();

    const problems = screen.getAllByRole("listitem");
    expect(problems).toHaveLength(6);
    expect(problems[0]).toHaveTextContent("01");
    expect(problems[0]).toHaveTextContent(
      "Checking a few answers by hand is the standard",
    );
    expect(problems[5]).toHaveTextContent("06");
    expect(problems[5]).toHaveTextContent(
      "The tools that exist are not built for you",
    );
  });

  it("names the AI's own failures, the stakes, and who is shut out", () => {
    render(<WhyCalibrateSection />);

    expect(
      screen.getByRole("heading", {
        name: "Ask the same question twice and you can get two different answers",
      }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("heading", {
        name: "The models are weakest where your users are",
      }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("heading", {
        name: "A wrong answer costs more in your work than in most",
      }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("heading", {
        name: "The people who know what a good answer looks like cannot check it themselves",
      }),
    ).toBeInTheDocument();
  });

  it("turns to what good evaluation looks like instead", () => {
    render(<WhyCalibrateSection />);

    expect(
      screen.getByRole("heading", {
        name: "What good AI evaluation looks like",
      }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("heading", {
        name: "A repeatable way to find mistakes",
      }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("heading", {
        name: "Deploy without breaking what worked",
      }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { name: "Your domain experts lead" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { name: "It holds as you grow" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("heading", {
        name: "See failures before a user complains",
      }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("heading", {
        name: "Your data stays where you need it",
      }),
    ).toBeInTheDocument();
  });

  it("sends readers to the session for leaders", () => {
    render(<WhyCalibrateSection />);

    expect(
      screen.getByRole("link", { name: "See the session for leaders" }),
    ).toHaveAttribute("href", "/learn#workshop-for-leaders");
  });
});
