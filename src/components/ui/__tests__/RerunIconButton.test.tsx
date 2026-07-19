import { render, screen, setupUser } from "@/test-utils";
import { RerunIconButton } from "../RerunIconButton";

describe("RerunIconButton", () => {
  it("renders an icon-only button labelled by its tooltip and fires onClick", async () => {
    const onClick = jest.fn();
    const user = setupUser();
    render(<RerunIconButton onClick={onClick} />);

    // Icon-only: the accessible name comes from aria-label, not visible text.
    const button = screen.getByRole("button", { name: "Rerun" });
    expect(button).toHaveTextContent("");

    await user.click(button);
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it("uses a custom tooltip as the accessible label", () => {
    render(<RerunIconButton onClick={jest.fn()} tooltip="Run again" />);
    expect(
      screen.getByRole("button", { name: "Run again" }),
    ).toBeInTheDocument();
  });

  it("is disabled and ignores clicks while loading", async () => {
    const onClick = jest.fn();
    const user = setupUser();
    render(<RerunIconButton onClick={onClick} loading />);

    const button = screen.getByRole("button", { name: "Rerun" });
    expect(button).toBeDisabled();
    expect(button).toHaveAttribute("aria-busy", "true");
    expect(button).toHaveClass("cursor-not-allowed");

    await user.click(button);
    expect(onClick).not.toHaveBeenCalled();
  });

  it("stays clickable when loading is false", async () => {
    const onClick = jest.fn();
    const user = setupUser();
    render(<RerunIconButton onClick={onClick} loading={false} />);

    const button = screen.getByRole("button", { name: "Rerun" });
    expect(button).toBeEnabled();
    expect(button).toHaveAttribute("aria-busy", "false");
    expect(button).toHaveClass("cursor-pointer");

    await user.click(button);
    expect(onClick).toHaveBeenCalledTimes(1);
  });
});
