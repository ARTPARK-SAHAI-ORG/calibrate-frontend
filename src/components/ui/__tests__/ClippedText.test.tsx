import { render, screen } from "@/test-utils";
import { ClippedText } from "../ClippedText";

// jsdom reports every width and height as 0, so how much room the text has is
// described directly by standing in for what the hook compares.
function mockBox({
  scrollWidth = 0,
  clientWidth = 0,
  scrollHeight = 0,
  clientHeight = 0,
}) {
  const spies = [
    jest
      .spyOn(HTMLElement.prototype, "scrollWidth", "get")
      .mockReturnValue(scrollWidth),
    jest
      .spyOn(HTMLElement.prototype, "clientWidth", "get")
      .mockReturnValue(clientWidth),
    jest
      .spyOn(HTMLElement.prototype, "scrollHeight", "get")
      .mockReturnValue(scrollHeight),
    jest
      .spyOn(HTMLElement.prototype, "clientHeight", "get")
      .mockReturnValue(clientHeight),
  ];
  return () => spies.forEach((s) => s.mockRestore());
}

describe("ClippedText", () => {
  it("does not repeat text the cell shows in full", () => {
    const restore = mockBox({ scrollWidth: 80, clientWidth: 80 });
    render(<ClippedText text="Tone" className="block truncate" />);
    expect(screen.getByText("Tone")).toBeInTheDocument();
    expect(screen.queryByRole("tooltip")).not.toBeInTheDocument();
    restore();
  });

  it("shows the whole text when the cell has cut it off sideways", () => {
    const restore = mockBox({ scrollWidth: 400, clientWidth: 80 });
    const { container } = render(
      <ClippedText text="A very long evaluator name" className="truncate" />,
    );
    expect(container.textContent).toContain("A very long evaluator name");
    restore();
  });

  it("shows the whole text when the cell has cut it off downwards", () => {
    // A line-clamp-4 cell, or one that scrolls inside a fixed height. Its
    // width never gives away that there is more to read.
    const restore = mockBox({
      scrollWidth: 80,
      clientWidth: 80,
      scrollHeight: 300,
      clientHeight: 96,
    });
    const { container } = render(
      <ClippedText text="A reason running past four lines" className="line-clamp-4" />,
    );
    expect(container.textContent).toContain("A reason running past four lines");
    restore();
  });

  it("shows nothing on hover for a cell standing in for an absent value", () => {
    const restore = mockBox({ scrollHeight: 300, clientHeight: 96 });
    render(
      <ClippedText text="" className="line-clamp-4">
        <span>(empty)</span>
      </ClippedText>,
    );
    expect(screen.getByText("(empty)")).toBeInTheDocument();
    expect(screen.queryByRole("tooltip")).not.toBeInTheDocument();
    restore();
  });

  it("draws what it is given in place of the text", () => {
    const restore = mockBox({ scrollWidth: 80, clientWidth: 80 });
    render(
      <ClippedText text="Tone" className="truncate">
        <span>—</span>
      </ClippedText>,
    );
    expect(screen.getByText("—")).toBeInTheDocument();
    expect(screen.queryByText("Tone")).not.toBeInTheDocument();
    restore();
  });
});
