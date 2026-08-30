import React from "react";
import { render, screen, setupUser } from "@/test-utils";
import { ConfirmDialog } from "../ConfirmDialog";

describe("ConfirmDialog", () => {
  const props = {
    isOpen: true,
    onClose: jest.fn(),
    onConfirm: jest.fn(),
    title: "Run every test on this agent",
    message: "This runs 3 tests.",
  };

  beforeEach(() => jest.clearAllMocks());

  it("renders nothing when closed", () => {
    const { container } = render(<ConfirmDialog {...props} isOpen={false} />);
    expect(container).toBeEmptyDOMElement();
  });

  it("shows the title, message and extra summary", () => {
    render(
      <ConfirmDialog {...props}>
        <p>2 models</p>
      </ConfirmDialog>,
    );
    expect(screen.getByText(props.title)).toBeInTheDocument();
    expect(screen.getByText(props.message)).toBeInTheDocument();
    expect(screen.getByText("2 models")).toBeInTheDocument();
  });

  it("calls onConfirm and onClose from their buttons", async () => {
    const user = setupUser();
    render(<ConfirmDialog {...props} confirmText="Start the run" />);

    await user.click(screen.getByRole("button", { name: "Start the run" }));
    expect(props.onConfirm).toHaveBeenCalled();

    await user.click(screen.getByRole("button", { name: "Cancel" }));
    expect(props.onClose).toHaveBeenCalled();
  });
});
