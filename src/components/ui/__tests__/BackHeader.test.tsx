import { render, screen, setupUser } from "@/test-utils";
import { BackHeader } from "../BackHeader";

describe("BackHeader", () => {
  it("renders the label", () => {
    render(<BackHeader label="Agents" onBack={jest.fn()} />);
    expect(screen.getByText("Agents")).toBeInTheDocument();
  });

  it("calls onBack when the button is clicked", async () => {
    const user = setupUser();
    const onBack = jest.fn();
    render(<BackHeader label="Agents" onBack={onBack} />);
    await user.click(screen.getByRole("button"));
    expect(onBack).toHaveBeenCalledTimes(1);
  });

  it("sets the title attribute when provided", () => {
    render(<BackHeader label="Agents" onBack={jest.fn()} title="Go back" />);
    expect(screen.getByRole("button")).toHaveAttribute("title", "Go back");
  });

  it("has no title attribute when not provided", () => {
    render(<BackHeader label="Agents" onBack={jest.fn()} />);
    expect(screen.getByRole("button")).not.toHaveAttribute("title");
  });
});
