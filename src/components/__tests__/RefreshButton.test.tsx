import { act, fireEvent, render, screen, setupUser } from "@/test-utils";
import { RefreshButton } from "../RefreshButton";

describe("RefreshButton", () => {
  it("calls onClick when clicked", async () => {
    const user = setupUser();
    const onClick = jest.fn();
    render(<RefreshButton onClick={onClick} />);

    const button = screen.getByRole("button", { name: "Refresh" });
    await user.click(button);
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it("uses a custom tooltip/aria-label", () => {
    render(<RefreshButton onClick={jest.fn()} tooltip="Reload data" />);
    expect(
      screen.getByRole("button", { name: "Reload data" }),
    ).toBeInTheDocument();
  });

  it("is disabled and shows spin animation when loading", () => {
    render(<RefreshButton onClick={jest.fn()} loading />);
    const button = screen.getByRole("button", { name: "Refresh" });
    expect(button).toBeDisabled();
    expect(button.querySelector("svg")).toHaveClass("animate-spin");
  });

  it("is disabled when disabled prop is set", () => {
    render(<RefreshButton onClick={jest.fn()} disabled />);
    expect(screen.getByRole("button", { name: "Refresh" })).toBeDisabled();
  });

  it("applies an extra className", () => {
    render(<RefreshButton onClick={jest.fn()} className="extra-class" />);
    expect(screen.getByRole("button", { name: "Refresh" })).toHaveClass(
      "extra-class",
    );
  });

  it("keeps the arrow turning for a moment even when the read answers at once", () => {
    jest.useFakeTimers();
    const onClick = jest.fn();
    render(<RefreshButton onClick={onClick} />);
    const button = screen.getByRole("button", { name: "Refresh" });
    const arrow = button.querySelector("svg") as SVGElement;

    expect(arrow).not.toHaveClass("animate-spin");
    fireEvent.click(button);
    // `loading` is never true here: a read this fast would otherwise flick the
    // arrow round too quickly to see.
    expect(onClick).toHaveBeenCalledTimes(1);
    expect(arrow).toHaveClass("animate-spin");

    act(() => {
      jest.advanceTimersByTime(600);
    });
    expect(arrow).not.toHaveClass("animate-spin");
    jest.useRealTimers();
  });

  it("restarts the turn when clicked again before it has finished", () => {
    jest.useFakeTimers();
    render(<RefreshButton onClick={jest.fn()} />);
    const button = screen.getByRole("button", { name: "Refresh" });
    const arrow = button.querySelector("svg") as SVGElement;

    fireEvent.click(button);
    act(() => {
      jest.advanceTimersByTime(400);
    });
    fireEvent.click(button);
    act(() => {
      jest.advanceTimersByTime(400);
    });
    expect(arrow).toHaveClass("animate-spin");

    act(() => {
      jest.advanceTimersByTime(200);
    });
    expect(arrow).not.toHaveClass("animate-spin");
    jest.useRealTimers();
  });

  it("stands as tall as the search box in a list toolbar", () => {
    const { rerender } = render(<RefreshButton onClick={jest.fn()} />);
    expect(screen.getByRole("button", { name: "Refresh" }).className).toContain(
      "h-7 w-7",
    );

    rerender(<RefreshButton onClick={jest.fn()} size="md" />);

    expect(screen.getByRole("button", { name: "Refresh" }).className).toContain(
      "h-10 w-10",
    );
  });
});
