import { render, screen, setupUser } from "@/test-utils";
import { DuplicateIconButton } from "../DuplicateIconButton";

describe("DuplicateIconButton", () => {
  it("renders with the default tooltip/aria-label and is enabled", () => {
    render(<DuplicateIconButton onClick={jest.fn()} />);
    const button = screen.getByRole("button", { name: "Duplicate" });
    expect(button).toBeInTheDocument();
    expect(button).not.toBeDisabled();
    expect(button).toHaveAttribute("aria-busy", "false");
  });

  it("uses a custom tooltip", () => {
    render(<DuplicateIconButton onClick={jest.fn()} tooltip="Copy agent" />);
    expect(screen.getByRole("button", { name: "Copy agent" })).toBeInTheDocument();
  });

  it("calls onClick and stops propagation when clicked and not loading", async () => {
    const user = setupUser();
    const onClick = jest.fn();
    const onParentClick = jest.fn();
    render(
      <div onClick={onParentClick}>
        <DuplicateIconButton onClick={onClick} />
      </div>
    );
    await user.click(screen.getByRole("button"));
    expect(onClick).toHaveBeenCalledTimes(1);
    expect(onParentClick).not.toHaveBeenCalled();
  });

  it("shows a spinner, disables the button, and does not call onClick when loading", async () => {
    const user = setupUser();
    const onClick = jest.fn();
    const { container } = render(
      <DuplicateIconButton onClick={onClick} loading />
    );
    const button = screen.getByRole("button", { name: "Duplicate" });
    expect(button).toBeDisabled();
    expect(button).toHaveAttribute("aria-busy", "true");
    expect(container.querySelector("svg.animate-spin")).toBeInTheDocument();

    await user.click(button);
    expect(onClick).not.toHaveBeenCalled();
  });

  it("applies an extra className", () => {
    render(<DuplicateIconButton onClick={jest.fn()} className="extra-class" />);
    expect(screen.getByRole("button")).toHaveClass("extra-class");
  });
});
