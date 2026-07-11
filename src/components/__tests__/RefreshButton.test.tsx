import { render, screen, setupUser } from "@/test-utils";
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
});
