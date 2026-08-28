import { render, screen, setupUser } from "@/test-utils";
import { TestTypeFilter, matchesTestTypeFilter } from "../TestTypeFilter";

describe("TestTypeFilter", () => {
  it("renders all filter options with default md size", () => {
    render(<TestTypeFilter value="all" onChange={jest.fn()} />);
    ["All", "Agent Response", "Tool Call"].forEach((label) => {
      expect(screen.getByRole("button", { name: label })).toBeInTheDocument();
    });
    expect(
      screen.queryByRole("button", { name: "Conversation" }),
    ).not.toBeInTheDocument();
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
    await user.click(screen.getByRole("button", { name: "Tool Call" }));
    expect(onChange).toHaveBeenCalledWith("tool_call");
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

describe("matchesTestTypeFilter", () => {
  it('"all" matches every type, including general', () => {
    ["response", "general", "tool_call", "conversation", "wat"].forEach(
      (type) => {
        expect(matchesTestTypeFilter(type, "all")).toBe(true);
      },
    );
  });

  it('"response" matches both response and general', () => {
    expect(matchesTestTypeFilter("response", "response")).toBe(true);
    expect(matchesTestTypeFilter("general", "response")).toBe(true);
    expect(matchesTestTypeFilter("tool_call", "response")).toBe(false);
    expect(matchesTestTypeFilter("conversation", "response")).toBe(false);
  });

  it('"tool_call" matches only tool_call', () => {
    expect(matchesTestTypeFilter("tool_call", "tool_call")).toBe(true);
    expect(matchesTestTypeFilter("general", "tool_call")).toBe(false);
    expect(matchesTestTypeFilter("response", "tool_call")).toBe(false);
  });

  it('"conversation" matches only conversation', () => {
    expect(matchesTestTypeFilter("conversation", "conversation")).toBe(true);
    expect(matchesTestTypeFilter("general", "conversation")).toBe(false);
    expect(matchesTestTypeFilter("response", "conversation")).toBe(false);
  });

  it("a missing type matches only all", () => {
    expect(matchesTestTypeFilter(null, "all")).toBe(true);
    expect(matchesTestTypeFilter(undefined, "all")).toBe(true);
    expect(matchesTestTypeFilter(null, "response")).toBe(false);
    expect(matchesTestTypeFilter(undefined, "response")).toBe(false);
    expect(matchesTestTypeFilter(null, "tool_call")).toBe(false);
    expect(matchesTestTypeFilter(undefined, "conversation")).toBe(false);
  });
});
