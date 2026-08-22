import { render, screen, setupUser } from "@/test-utils";
import { SegmentedFilter } from "../SegmentedFilter";

const OPTIONS = [
  { value: "all", label: "All" },
  { value: "open", label: "Open" },
  { value: "done", label: "Done" },
];

describe("SegmentedFilter", () => {
  it("renders every option", () => {
    render(
      <SegmentedFilter value="all" onChange={jest.fn()} options={OPTIONS} />,
    );
    ["All", "Open", "Done"].forEach((label) => {
      expect(screen.getByRole("button", { name: label })).toBeInTheDocument();
    });
  });

  it("marks only the selected option as pressed", () => {
    render(
      <SegmentedFilter value="open" onChange={jest.fn()} options={OPTIONS} />,
    );
    expect(screen.getByRole("button", { name: "Open" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    expect(screen.getByRole("button", { name: "All" })).toHaveAttribute(
      "aria-pressed",
      "false",
    );
  });

  it("styles the selected option differently", () => {
    render(
      <SegmentedFilter value="open" onChange={jest.fn()} options={OPTIONS} />,
    );
    expect(screen.getByRole("button", { name: "Open" }).className).toContain(
      "bg-background",
    );
    expect(screen.getByRole("button", { name: "All" }).className).not.toContain(
      "bg-background",
    );
  });

  it("calls onChange with the clicked value", async () => {
    const user = setupUser();
    const onChange = jest.fn();
    render(
      <SegmentedFilter value="all" onChange={onChange} options={OPTIONS} />,
    );
    await user.click(screen.getByRole("button", { name: "Done" }));
    expect(onChange).toHaveBeenCalledWith("done");
  });

  it("applies the compact classes when size is sm", () => {
    render(
      <SegmentedFilter
        value="all"
        onChange={jest.fn()}
        options={OPTIONS}
        size="sm"
      />,
    );
    const btn = screen.getByRole("button", { name: "All" });
    expect(btn.className).toContain("flex-1");
    expect(btn.className).toContain("h-6");
    expect(btn.className).not.toContain("px-3");
  });

  it("uses the md classes by default", () => {
    render(
      <SegmentedFilter value="all" onChange={jest.fn()} options={OPTIONS} />,
    );
    const btn = screen.getByRole("button", { name: "All" });
    expect(btn.className).toContain("h-7");
    expect(btn.className).not.toContain("flex-1");
  });

  it("puts the extra className and label on the track", () => {
    const { container } = render(
      <SegmentedFilter
        value="all"
        onChange={jest.fn()}
        options={OPTIONS}
        className="mt-2"
        ariaLabel="Filter items"
      />,
    );
    expect(container.firstChild).toHaveClass("mt-2");
    // Asked for by role, not by attribute: the label only reaches a screen
    // reader because the row of pills is marked as a group.
    expect(
      screen.getByRole("group", { name: "Filter items" }),
    ).toBeInTheDocument();
  });
});
