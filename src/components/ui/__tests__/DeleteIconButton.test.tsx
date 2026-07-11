import { render, screen, setupUser } from "@/test-utils";
import { DeleteIconButton } from "../DeleteIconButton";

describe("DeleteIconButton", () => {
  it("renders with the default title and aria-label", () => {
    render(<DeleteIconButton onClick={jest.fn()} />);
    const button = screen.getByRole("button", { name: "Delete" });
    expect(button).toBeInTheDocument();
    expect(button).toHaveAttribute("title", "Delete");
  });

  it("uses a custom title", () => {
    render(<DeleteIconButton onClick={jest.fn()} title="Remove item" />);
    expect(screen.getByRole("button", { name: "Remove item" })).toBeInTheDocument();
  });

  it("uses a custom ariaLabel distinct from the title", () => {
    render(
      <DeleteIconButton
        onClick={jest.fn()}
        title="Remove item"
        ariaLabel="Remove this item permanently"
      />
    );
    expect(
      screen.getByRole("button", { name: "Remove this item permanently" })
    ).toHaveAttribute("title", "Remove item");
  });

  it("calls onClick and stops propagation when clicked", async () => {
    const user = setupUser();
    const onClick = jest.fn();
    const onParentClick = jest.fn();
    render(
      <div onClick={onParentClick}>
        <DeleteIconButton onClick={onClick} />
      </div>
    );
    await user.click(screen.getByRole("button"));
    expect(onClick).toHaveBeenCalledTimes(1);
    expect(onParentClick).not.toHaveBeenCalled();
  });

  it("applies an extra className", () => {
    render(<DeleteIconButton onClick={jest.fn()} className="extra-class" />);
    expect(screen.getByRole("button")).toHaveClass("extra-class");
  });
});
