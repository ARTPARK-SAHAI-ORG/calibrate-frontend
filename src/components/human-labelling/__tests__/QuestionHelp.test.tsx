import { render, screen, setupUser } from "@/test-utils";
import { QuestionHelp } from "../QuestionHelp";

const HELP = {
  definition: "Did the nurse ask enough questions",
  example: "The nurse asks how old the baby is",
  choices: [{ name: "Probed sufficiently", text: "Enough questions were asked" }],
  counts: ["Asks for missing details"],
  notCounts: ["Says goodbye with a question"],
};

describe("QuestionHelp", () => {
  it("starts closed and opens the explanation in place", async () => {
    const user = setupUser();
    render(<QuestionHelp help={HELP} questionName="Probing" />);
    const toggle = screen.getByRole("button", { name: "What does this mean?" });
    expect(toggle).toHaveAttribute("aria-expanded", "false");
    expect(screen.queryByText(HELP.definition)).not.toBeInTheDocument();

    await user.click(toggle);
    expect(screen.getByRole("button", { name: "Hide the explanation" })).toHaveAttribute(
      "aria-expanded",
      "true",
    );
    expect(screen.getByRole("region", { name: "What Probing means" })).toBeInTheDocument();
    expect(screen.getByText(HELP.definition)).toBeInTheDocument();
    expect(screen.getByText(`Example: ${HELP.example}`)).toBeInTheDocument();
    expect(screen.getByText("How to choose")).toBeInTheDocument();
    expect(screen.getByText("Probed sufficiently")).toBeInTheDocument();
    expect(screen.getByText(": Enough questions were asked")).toBeInTheDocument();
    expect(screen.getByText("Counts when")).toBeInTheDocument();
    expect(screen.getByText("Asks for missing details")).toBeInTheDocument();
    expect(screen.getByText("Does not count")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Hide the explanation" }));
    expect(screen.queryByText(HELP.definition)).not.toBeInTheDocument();
  });

  it("leaves out the parts the team did not write", async () => {
    const user = setupUser();
    render(<QuestionHelp help={{ definition: "Just this" }} questionName="Safety" />);
    await user.click(screen.getByRole("button"));
    expect(screen.getByText("Just this")).toBeInTheDocument();
    expect(screen.queryByText(/Example:/)).not.toBeInTheDocument();
    expect(screen.queryByText("How to choose")).not.toBeInTheDocument();
    expect(screen.queryByText("Counts when")).not.toBeInTheDocument();
    expect(screen.queryByText("Does not count")).not.toBeInTheDocument();
  });
});
