import React from "react";
import { render, screen, setupUser, waitFor } from "@/test-utils";
import {
  LabellingHeaderCheckbox,
  LabellingSelectCell,
} from "../labellingSelectionColumn";

function renderHeader(props: Partial<React.ComponentProps<typeof LabellingHeaderCheckbox>> = {}) {
  return render(
    <table>
      <thead>
        <tr>
          <LabellingHeaderCheckbox
            allSelectableKeys={["a", "b"]}
            allSelected={false}
            onBulkToggle={jest.fn()}
            {...props}
          />
        </tr>
      </thead>
    </table>,
  );
}

function renderCell(props: Partial<React.ComponentProps<typeof LabellingSelectCell>> = {}) {
  return render(
    <table>
      <tbody>
        <tr>
          <LabellingSelectCell
            eligible
            checked={false}
            onToggle={jest.fn()}
            disabledTitle="Aborted or empty runs cannot be labelled"
            {...props}
          />
        </tr>
      </tbody>
    </table>,
  );
}

describe("LabellingHeaderCheckbox", () => {
  it("names the button for a screen reader and shows the same words on hover", async () => {
    const user = setupUser();
    renderHeader();
    const button = screen.getByRole("button", { name: "Select all" });
    expect(button).not.toHaveAttribute("title");
    await user.hover(button);
    await waitFor(() =>
      expect(screen.getAllByText("Select all").length).toBeGreaterThan(0),
    );
  });

  it("switches to Deselect all once every row is selected", () => {
    renderHeader({ allSelected: true });
    expect(
      screen.getByRole("button", { name: "Deselect all" }),
    ).toBeInTheDocument();
  });

  it("calls onBulkToggle with every selectable key", async () => {
    const user = setupUser();
    const onBulkToggle = jest.fn();
    renderHeader({ onBulkToggle });
    await user.click(screen.getByRole("button", { name: "Select all" }));
    expect(onBulkToggle).toHaveBeenCalledWith(["a", "b"]);
  });
});

describe("LabellingSelectCell", () => {
  it("shows Select for labelling on hover when the row can be picked", async () => {
    const user = setupUser();
    renderCell();
    const button = screen.getByRole("button", { name: "Select for labelling" });
    expect(button).not.toHaveAttribute("title");
    await user.hover(button);
    await waitFor(() =>
      expect(screen.getAllByText("Select for labelling").length).toBeGreaterThan(
        0,
      ),
    );
  });

  it("shows the reason on hover when the row cannot be picked, even though the button is disabled", async () => {
    const user = setupUser();
    const onToggle = jest.fn();
    renderCell({ eligible: false, onToggle });
    const button = screen.getByRole("button", { name: "Select for labelling" });
    expect(button).toBeDisabled();
    // Hover the wrapper, not the button: a disabled button fires no mouse
    // events of its own, which is exactly why Tooltip wraps the control.
    await user.hover(button.parentElement!);
    await waitFor(() =>
      expect(
        screen.getByText("Aborted or empty runs cannot be labelled"),
      ).toBeInTheDocument(),
    );
    await user.click(button);
    expect(onToggle).not.toHaveBeenCalled();
  });

  it("calls onToggle when an eligible row is clicked", async () => {
    const user = setupUser();
    const onToggle = jest.fn();
    renderCell({ onToggle });
    await user.click(
      screen.getByRole("button", { name: "Select for labelling" }),
    );
    expect(onToggle).toHaveBeenCalled();
  });
});
