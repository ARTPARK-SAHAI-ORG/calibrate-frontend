import { render, screen } from "@/test-utils";
import { WhyCalibrateSection } from "../WhyCalibrateSection";

describe("WhyCalibrateSection", () => {
  it("makes the case against checking answers by hand", () => {
    render(<WhyCalibrateSection />);

    expect(
      screen.getByRole("heading", {
        name: "Checking your AI by hand stops working",
      }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { name: "Fixing one thing breaks another" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { name: "Every change costs a day" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { name: "The same mistake comes back" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("heading", {
        name: "There is more to read than anyone can read",
      }),
    ).toBeInTheDocument();
  });

  it("lists what good evaluation looks like", () => {
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
      screen.getByRole("heading", { name: "Spend your time on the product" }),
    ).toBeInTheDocument();
  });

  it("sends readers to the session for leaders", () => {
    render(<WhyCalibrateSection />);

    expect(
      screen.getByRole("heading", {
        name: "Your domain experts should be leading this",
      }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: "See the session for leaders" }),
    ).toHaveAttribute("href", "/learn#workshop-for-leaders");
  });
});
