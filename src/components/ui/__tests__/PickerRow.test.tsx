import React from "react";
import { render, screen, setupUser } from "@/test-utils";
import { PickerRow } from "../PickerRow";

function renderRow(
  overrides: Partial<React.ComponentProps<typeof PickerRow>> = {},
) {
  const onToggle = jest.fn();
  const onPreview = jest.fn();
  const utils = render(
    <PickerRow
      ariaLabel="Select Weather lookup"
      checked={false}
      onToggle={onToggle}
      isPreviewed={false}
      onPreview={onPreview}
      name="Weather lookup"
      description="Gets the weather"
      {...overrides}
    />,
  );
  return { onToggle, onPreview, ...utils };
}

describe("PickerRow", () => {
  it("shows the name, description and badge", () => {
    renderRow({ badge: <span>Webhook</span> });
    expect(screen.getByText("Weather lookup")).toBeInTheDocument();
    expect(screen.getByText("Gets the weather")).toBeInTheDocument();
    expect(screen.getByText("Webhook")).toBeInTheDocument();
  });

  it("omits the description line when there is none", () => {
    renderRow({ description: undefined });
    expect(screen.queryByText("Gets the weather")).not.toBeInTheDocument();
  });

  it("checkbox reflects checked and calls onToggle, not onPreview", async () => {
    const user = setupUser();
    const { onToggle, onPreview } = renderRow({ checked: true });
    const box = screen.getByLabelText("Select Weather lookup");
    expect(box).toBeChecked();

    await user.click(box);
    expect(onToggle).toHaveBeenCalledTimes(1);
    expect(onPreview).not.toHaveBeenCalled();
  });

  it("clicking the name calls onPreview, not onToggle", async () => {
    const user = setupUser();
    const { onToggle, onPreview } = renderRow();
    await user.click(screen.getByText("Weather lookup"));
    expect(onPreview).toHaveBeenCalledTimes(1);
    expect(onToggle).not.toHaveBeenCalled();
  });

  it("highlights the row when isPreviewed", () => {
    const { container } = renderRow({ isPreviewed: true });
    expect(container.firstChild).toHaveClass("bg-muted/60");
  });

  it("does not highlight the row when not previewed", () => {
    const { container } = renderRow({ isPreviewed: false });
    expect(container.firstChild).not.toHaveClass("bg-muted/60");
  });
});
