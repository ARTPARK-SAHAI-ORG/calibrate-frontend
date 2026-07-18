import { render, screen, setupUser } from "@/test-utils";
import { VerifyToRunActions } from "../VerifyToRunActions";

const baseProps = {
  isVerifying: false,
  error: null as string | null,
  onVerify: jest.fn(),
  onGoToConnection: jest.fn(),
};

describe("VerifyToRunActions", () => {
  it("shows only the Verify action before an attempt", () => {
    render(<VerifyToRunActions {...baseProps} />);

    const verify = screen.getByRole("button", { name: "Verify" });
    expect(verify).toBeEnabled();
    expect(
      screen.queryByRole("button", { name: "Go to connection settings" }),
    ).not.toBeInTheDocument();
  });

  it("calls onVerify when the primary action is clicked", async () => {
    const user = setupUser();
    const onVerify = jest.fn();
    render(<VerifyToRunActions {...baseProps} onVerify={onVerify} />);

    await user.click(screen.getByRole("button", { name: "Verify" }));
    expect(onVerify).toHaveBeenCalledTimes(1);
  });

  it("shows a verifying label and disables the action while verifying", () => {
    render(<VerifyToRunActions {...baseProps} isVerifying />);

    expect(screen.getByRole("button", { name: /Verifying/ })).toBeDisabled();
    expect(
      screen.queryByRole("button", { name: "Verify" }),
    ).not.toBeInTheDocument();
  });

  it("keeps the jump to connection settings hidden while verifying without an error", () => {
    render(<VerifyToRunActions {...baseProps} isVerifying />);
    expect(
      screen.queryByRole("button", { name: "Go to connection settings" }),
    ).not.toBeInTheDocument();
  });

  it("switches to Try again and offers connection settings after a failure", async () => {
    const user = setupUser();
    const onVerify = jest.fn();
    const onGoToConnection = jest.fn();
    render(
      <VerifyToRunActions
        {...baseProps}
        error="endpoint unreachable"
        onVerify={onVerify}
        onGoToConnection={onGoToConnection}
      />,
    );

    await user.click(screen.getByRole("button", { name: "Try again" }));
    expect(onVerify).toHaveBeenCalledTimes(1);

    await user.click(
      screen.getByRole("button", { name: "Go to connection settings" }),
    );
    expect(onGoToConnection).toHaveBeenCalledTimes(1);
  });

  it("keeps the verifying label while an error is set and a retry is in flight", () => {
    render(
      <VerifyToRunActions {...baseProps} error="boom" isVerifying />,
    );

    expect(screen.getByRole("button", { name: /Verifying/ })).toBeDisabled();
    expect(
      screen.getByRole("button", { name: "Go to connection settings" }),
    ).toBeInTheDocument();
  });
});
