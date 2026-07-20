import { render, screen, setupUser, waitFor } from "@/test-utils";
import { VerifyConnectionDialog } from "../VerifyConnectionDialog";

// Controllable stand-in for the verify hook: the test sets what the next
// verifySavedAgent call resolves to and what error/response it exposes.
const verifyState: {
  isVerifying: boolean;
  verifyError: string | null;
  verifySampleResponse: Record<string, unknown> | null;
  verifySavedAgent: jest.Mock;
} = {
  isVerifying: false,
  verifyError: null,
  verifySampleResponse: null,
  verifySavedAgent: jest.fn(),
};

jest.mock("../../hooks/useVerifyConnection", () => ({
  useVerifyConnection: () => verifyState,
}));

function reset() {
  verifyState.isVerifying = false;
  verifyState.verifyError = null;
  verifyState.verifySampleResponse = null;
  verifyState.verifySavedAgent = jest.fn().mockResolvedValue(true);
}

const baseProps = {
  isOpen: true as const,
  onClose: jest.fn(),
  agentUuid: "agent-1",
  agentName: "Support bot",
  onVerified: jest.fn(),
  onGoToConnectionSettings: jest.fn(),
};

beforeEach(() => {
  reset();
  baseProps.onClose = jest.fn();
  baseProps.onVerified = jest.fn();
  baseProps.onGoToConnectionSettings = jest.fn();
});

describe("VerifyConnectionDialog", () => {
  it("renders nothing when closed", () => {
    const { container } = render(
      <VerifyConnectionDialog {...baseProps} isOpen={false} />,
    );
    expect(container).toBeEmptyDOMElement();
  });

  it("explains the check and names the agent", () => {
    render(<VerifyConnectionDialog {...baseProps} />);
    expect(screen.getByText("Verify connection")).toBeInTheDocument();
    expect(screen.getByText(/Support bot/)).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Verify" }),
    ).toBeInTheDocument();
  });

  it("checks the saved agent and, on a pass, hands back to the parent to run", async () => {
    const user = setupUser();
    render(<VerifyConnectionDialog {...baseProps} />);

    await user.click(screen.getByRole("button", { name: "Verify" }));

    expect(verifyState.verifySavedAgent).toHaveBeenCalledWith("agent-1");
    await waitFor(() => expect(baseProps.onVerified).toHaveBeenCalledTimes(1));
  });

  it("does not call onVerified when the check fails", async () => {
    verifyState.verifySavedAgent = jest.fn().mockResolvedValue(false);
    const user = setupUser();
    render(<VerifyConnectionDialog {...baseProps} />);

    await user.click(screen.getByRole("button", { name: "Verify" }));

    await waitFor(() =>
      expect(verifyState.verifySavedAgent).toHaveBeenCalled(),
    );
    expect(baseProps.onVerified).not.toHaveBeenCalled();
  });

  it("shows the error and the agent's own response on a failure, with a jump to Connection settings", async () => {
    verifyState.verifyError = "Connection refused";
    verifyState.verifySampleResponse = { detail: "boom" };
    const user = setupUser();
    render(<VerifyConnectionDialog {...baseProps} />);

    expect(screen.getByText("Could not reach the agent")).toBeInTheDocument();
    expect(screen.getByText("Connection refused")).toBeInTheDocument();
    expect(screen.getByText(/"detail": "boom"/)).toBeInTheDocument();
    // The Verify button becomes "Try again" once a failure is shown.
    expect(screen.getByRole("button", { name: "Try again" })).toBeInTheDocument();
    // Two-button footer: Cancel is replaced by the two failure actions.
    expect(
      screen.queryByRole("button", { name: "Cancel" }),
    ).not.toBeInTheDocument();

    await user.click(
      screen.getByRole("button", { name: "View connection settings" }),
    );
    expect(baseProps.onGoToConnectionSettings).toHaveBeenCalledTimes(1);
  });

  it("disables the button and shows a spinner while verifying", () => {
    verifyState.isVerifying = true;
    render(<VerifyConnectionDialog {...baseProps} />);
    const button = screen.getByRole("button", { name: /Verifying/ });
    expect(button).toBeDisabled();
    expect(button.querySelector(".animate-spin")).toBeInTheDocument();
  });

  it("closes on Cancel and on the backdrop", async () => {
    const user = setupUser();
    const { container } = render(<VerifyConnectionDialog {...baseProps} />);
    await user.click(screen.getByRole("button", { name: "Cancel" }));
    expect(baseProps.onClose).toHaveBeenCalledTimes(1);

    const backdrop = container.querySelector(
      ".absolute.inset-0.bg-black\\/50",
    ) as HTMLElement;
    await user.click(backdrop);
    expect(baseProps.onClose).toHaveBeenCalledTimes(2);
  });
});
