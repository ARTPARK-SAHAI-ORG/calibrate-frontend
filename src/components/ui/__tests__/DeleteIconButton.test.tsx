import { render, screen, setupUser } from "@/test-utils";
import { DeleteIconButton } from "../DeleteIconButton";

describe("DeleteIconButton", () => {
  it("renders with the default label", () => {
    render(<DeleteIconButton onClick={jest.fn()} />);
    const button = screen.getByRole("button", { name: "Delete" });
    expect(button).toBeInTheDocument();
    expect(button).not.toHaveAttribute("title");
  });

  it("shows the hover text in the app's own tooltip, not the browser's", async () => {
    const user = setupUser();
    render(<DeleteIconButton onClick={jest.fn()} title="Delete trace" />);
    const button = screen.getByRole("button", { name: "Delete trace" });
    expect(button).not.toHaveAttribute("title");

    await user.hover(button);
    expect(await screen.findByText("Delete trace")).toBeInTheDocument();
  });

  it("leaves the hover text to the caller while disabled, so only one shows", () => {
    render(<DeleteIconButton onClick={jest.fn()} disabled />);
    const button = screen.getByRole("button", { name: "Delete" });
    expect(button).toBeDisabled();
    expect(button).not.toHaveAttribute("title");
    expect(screen.queryByText("Delete")).not.toBeInTheDocument();
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
    ).not.toHaveAttribute("title");
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
