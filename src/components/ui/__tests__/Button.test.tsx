/**
 * Example: interaction test for a primitive UI component.
 * Shows how to assert that clicking calls a handler and that
 * disabled / loading states block the click.
 */
import { render, screen, setupUser } from "@/test-utils";
import { Button } from "../Button";

describe("Button", () => {
  it("calls onClick when clicked", async () => {
    const user = setupUser();
    const onClick = jest.fn();
    render(<Button onClick={onClick}>Save</Button>);

    await user.click(screen.getByRole("button", { name: "Save" }));

    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it("does not call onClick when disabled", async () => {
    const user = setupUser();
    const onClick = jest.fn();
    render(
      <Button onClick={onClick} disabled>
        Save
      </Button>,
    );

    await user.click(screen.getByRole("button", { name: "Save" }));

    expect(onClick).not.toHaveBeenCalled();
  });

  it("shows loading text and blocks clicks while loading", async () => {
    const user = setupUser();
    const onClick = jest.fn();
    render(
      <Button onClick={onClick} isLoading loadingText="Saving...">
        Save
      </Button>,
    );

    expect(screen.getByRole("button")).toHaveTextContent("Saving...");
    await user.click(screen.getByRole("button"));
    expect(onClick).not.toHaveBeenCalled();
  });
});
