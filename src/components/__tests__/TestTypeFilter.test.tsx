import { render, screen, setupUser } from "@/test-utils";
import { TestTypeFilter } from "../TestTypeFilter";

describe("TestTypeFilter", () => {
  it("renders all filter options with default md size", () => {
    render(<TestTypeFilter value="all" onChange={jest.fn()} />);
    ["All", "Next Reply", "Tool Call", "Conversation"].forEach((label) => {
      expect(screen.getByRole("button", { name: label })).toBeInTheDocument();
    });
  });

  it("highlights the active option", () => {
    render(<TestTypeFilter value="tool_call" onChange={jest.fn()} />);
    const active = screen.getByRole("button", { name: "Tool Call" });
    const inactive = screen.getByRole("button", { name: "All" });
    expect(active.className).toContain("bg-background");
    expect(inactive.className).not.toContain("bg-background");
  });

  it("calls onChange with the selected value", async () => {
    const user = setupUser();
    const onChange = jest.fn();
    render(<TestTypeFilter value="all" onChange={onChange} />);
    await user.click(screen.getByRole("button", { name: "Conversation" }));
    expect(onChange).toHaveBeenCalledWith("conversation");
  });

  it("applies sm size classes", () => {
    render(<TestTypeFilter value="all" onChange={jest.fn()} size="sm" />);
    const btn = screen.getByRole("button", { name: "All" });
    expect(btn.className).toContain("flex-1");
  });

  it("applies extra className to the track", () => {
    const { container } = render(
      <TestTypeFilter value="all" onChange={jest.fn()} className="mt-2" />,
    );
    expect(container.firstChild).toHaveClass("mt-2");
  });
});
