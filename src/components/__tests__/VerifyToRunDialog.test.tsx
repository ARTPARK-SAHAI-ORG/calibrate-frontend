import { render, screen, setupUser } from "@/test-utils";
import { VerifyToRunDialog } from "../VerifyToRunDialog";

const baseProps = {
  isOpen: true,
  agentName: "Support Bot",
  isVerifying: false,
  error: null as string | null,
  sampleResponse: null as Record<string, unknown> | null,
  onVerify: jest.fn(),
  onGoToConnection: jest.fn(),
  onClose: jest.fn(),
};

describe("VerifyToRunDialog", () => {
  it("renders nothing when closed", () => {
    const { container } = render(
      <VerifyToRunDialog {...baseProps} isOpen={false} />,
    );
    expect(container).toBeEmptyDOMElement();
  });

  it("shows the verify prompt and calls onVerify", async () => {
    const user = setupUser();
    const onVerify = jest.fn();
    render(<VerifyToRunDialog {...baseProps} onVerify={onVerify} />);

    expect(screen.getByText("Verify connection to run")).toBeInTheDocument();
    expect(screen.getByText(/is not verified yet/)).toBeInTheDocument();
    // No jump-to-settings button until a failure.
    expect(
      screen.queryByRole("button", { name: "Go to connection settings" }),
    ).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Verify" }));
    expect(onVerify).toHaveBeenCalledTimes(1);
  });

  it("shows a spinner label and disables the verify action while verifying", () => {
    render(<VerifyToRunDialog {...baseProps} isVerifying />);
    expect(
      screen.getByRole("button", { name: /Verifying/ }),
    ).toBeDisabled();
  });

  it("can still be dismissed while verifying", async () => {
    // The check has no timeout, so freezing the dialog would trap the user
    // whenever the agent endpoint hangs. Every way out stays live; the host
    // abandons the pending run when it closes.
    const user = setupUser();
    const onClose = jest.fn();
    const { container } = render(
      <VerifyToRunDialog {...baseProps} isVerifying onClose={onClose} />,
    );

    expect(screen.getByRole("button", { name: "Cancel" })).toBeEnabled();
    expect(screen.getByRole("button", { name: "Close" })).toBeEnabled();

    await user.click(screen.getByRole("button", { name: "Cancel" }));
    await user.click(screen.getByRole("button", { name: "Close" }));

    const backdrop = container.querySelector(
      ".absolute.inset-0.bg-black\\/50",
    ) as HTMLElement;
    await user.click(backdrop);

    expect(onClose).toHaveBeenCalledTimes(3);
  });

  it("surfaces the error and offers the jump to connection settings on failure", async () => {
    const user = setupUser();
    const onGoToConnection = jest.fn();
    const onVerify = jest.fn();
    render(
      <VerifyToRunDialog
        {...baseProps}
        error="endpoint unreachable"
        sampleResponse={{ status: 502 }}
        onGoToConnection={onGoToConnection}
        onVerify={onVerify}
      />,
    );

    expect(screen.getByText("Verification failed")).toBeInTheDocument();
    expect(screen.getByText("endpoint unreachable")).toBeInTheDocument();
    // The primary action becomes "Try again" once there's an error.
    await user.click(screen.getByRole("button", { name: "Try again" }));
    expect(onVerify).toHaveBeenCalledTimes(1);

    await user.click(
      screen.getByRole("button", { name: "Go to connection settings" }),
    );
    expect(onGoToConnection).toHaveBeenCalledTimes(1);
  });

  it("calls onClose from Cancel and the X button", async () => {
    const user = setupUser();
    const onClose = jest.fn();
    render(<VerifyToRunDialog {...baseProps} onClose={onClose} />);
    await user.click(screen.getByRole("button", { name: "Cancel" }));
    await user.click(screen.getByRole("button", { name: "Close" }));
    expect(onClose).toHaveBeenCalledTimes(2);
  });
});
