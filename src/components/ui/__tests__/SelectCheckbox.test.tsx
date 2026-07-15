/**
 * Interaction tests for SelectCheckbox — the shared row-selection box used by
 * the bulk-delete lists. Covers toggling, the checked state, the disabled
 * (swallow-the-click) behaviour, and the hover tooltip.
 */
import React from "react";
import { render, screen, setupUser } from "@/test-utils";
import { SelectCheckbox } from "@/components/ui/SelectCheckbox";

describe("SelectCheckbox", () => {
  it("calls onToggle when clicked", async () => {
    const user = setupUser();
    const onToggle = jest.fn();
    render(
      <SelectCheckbox checked={false} onToggle={onToggle} label="Select row" />,
    );

    await user.click(screen.getByRole("button", { name: "Select row" }));
    expect(onToggle).toHaveBeenCalledTimes(1);
  });

  it("reflects the checked state via aria-pressed", () => {
    render(<SelectCheckbox checked onToggle={jest.fn()} label="Select row" />);
    expect(screen.getByRole("button", { name: "Select row" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
  });

  it("does not toggle when disabled", async () => {
    const user = setupUser();
    const onToggle = jest.fn();
    render(
      <SelectCheckbox
        checked={false}
        onToggle={onToggle}
        label="Select row"
        disabled
        tooltip="Cannot select this one"
      />,
    );

    const button = screen.getByRole("button", { name: "Select row" });
    expect(button).toHaveAttribute("aria-disabled", "true");
    await user.click(button);
    expect(onToggle).not.toHaveBeenCalled();
  });

  it("shows the tooltip text on hover", async () => {
    const user = setupUser();
    render(
      <SelectCheckbox
        checked={false}
        onToggle={jest.fn()}
        label="Select row"
        disabled
        tooltip="Cannot select this one"
      />,
    );

    await user.hover(screen.getByRole("button", { name: "Select row" }));
    expect(
      await screen.findByText("Cannot select this one"),
    ).toBeInTheDocument();
  });
});
