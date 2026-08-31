import React from "react";
import { render, screen, setupUser, waitFor } from "@/test-utils";
import { RenameDialog } from "../RenameDialog";

const props = {
  isOpen: true,
  title: "Rename the dataset",
  initialName: "Hindi calls",
  onClose: jest.fn(),
  onRename: jest.fn(),
};

beforeEach(() => {
  props.onClose.mockClear();
  props.onRename.mockClear();
});

describe("RenameDialog", () => {
  it("renders nothing when closed", () => {
    const { container } = render(<RenameDialog {...props} isOpen={false} />);
    expect(container).toBeEmptyDOMElement();
  });

  it("saves the new name and closes", async () => {
    const user = setupUser();
    props.onRename.mockResolvedValue(undefined);
    render(<RenameDialog {...props} />);
    const box = screen.getByLabelText("Name");
    expect(box).toHaveValue("Hindi calls");

    await user.clear(box);
    await user.type(box, "  Hindi calls v2  ");
    await user.click(screen.getByRole("button", { name: "Save" }));

    // Saved without the spaces around it.
    expect(props.onRename).toHaveBeenCalledWith("Hindi calls v2");
    await waitFor(() => expect(props.onClose).toHaveBeenCalled());
  });

  it("shows what went wrong and stays open", async () => {
    const user = setupUser();
    props.onRename.mockResolvedValue("A dataset with this name already exists.");
    render(<RenameDialog {...props} />);

    await user.clear(screen.getByLabelText("Name"));
    await user.type(screen.getByLabelText("Name"), "Taken");
    await user.click(screen.getByRole("button", { name: "Save" }));

    expect(
      await screen.findByText("A dataset with this name already exists."),
    ).toBeInTheDocument();
    expect(props.onClose).not.toHaveBeenCalled();
  });

  it("closes without saving when the name has not changed", async () => {
    const user = setupUser();
    render(<RenameDialog {...props} />);
    await user.click(screen.getByRole("button", { name: "Save" }));
    expect(props.onRename).not.toHaveBeenCalled();
    expect(props.onClose).toHaveBeenCalled();
  });

  it("cannot be saved with an empty name", async () => {
    const user = setupUser();
    render(<RenameDialog {...props} />);
    await user.clear(screen.getByLabelText("Name"));
    expect(screen.getByRole("button", { name: "Save" })).toBeDisabled();
  });

  it("saves on Enter and closes on Escape", async () => {
    const user = setupUser();
    props.onRename.mockResolvedValue(undefined);
    render(<RenameDialog {...props} />);
    await user.clear(screen.getByLabelText("Name"));
    await user.type(screen.getByLabelText("Name"), "Renamed{Enter}");
    await waitFor(() => expect(props.onRename).toHaveBeenCalledWith("Renamed"));

    await user.type(screen.getByLabelText("Name"), "{Escape}");
    expect(props.onClose).toHaveBeenCalled();
  });
});
