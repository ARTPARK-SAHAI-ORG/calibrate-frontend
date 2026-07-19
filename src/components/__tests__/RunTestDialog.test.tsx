import { render, screen, setupUser, waitFor, act } from "@/test-utils";
import { RunTestDialog } from "../RunTestDialog";

const pushMock = jest.fn();
jest.mock("next/navigation", () => ({
  ...jest.requireActual("next/navigation"),
  useRouter: () => ({ push: pushMock }),
}));

// Controllable verify hook. The outcome is driven by `mockVerifyOutcome`; the
// hook holds real React state so a failed verify actually re-renders the
// dialog into its error state (mirrors the real useVerifyConnection).
const mockVerifySpy = jest.fn();
const mockVerifyOutcome: {
  success: boolean;
  error: string | null;
  sampleResponse: Record<string, unknown> | null;
} = { success: true, error: null, sampleResponse: null };
// Set to a promise to hold a check in flight, so `isVerifying` stays true and
// the mid-check behaviour can be asserted. Null means resolve immediately.
const mockVerifyHold: { promise: Promise<void> | null } = { promise: null };
jest.mock("../../hooks", () => {
  const React = require("react");
  return {
    __esModule: true,
    useVerifyConnection: () => {
      const [state, setState] = React.useState({
        isVerifying: false,
        verifyError: null as string | null,
        verifySampleResponse: null as Record<string, unknown> | null,
      });
      const verifySavedAgent = React.useCallback(async (uuid: string) => {
        mockVerifySpy(uuid);
        setState({
          isVerifying: true,
          verifyError: null,
          verifySampleResponse: null,
        });
        if (mockVerifyHold.promise) {
          await mockVerifyHold.promise;
        }
        if (mockVerifyOutcome.success) {
          setState({
            isVerifying: false,
            verifyError: null,
            verifySampleResponse: null,
          });
          return true;
        }
        setState({
          isVerifying: false,
          verifyError: mockVerifyOutcome.error,
          verifySampleResponse: mockVerifyOutcome.sampleResponse,
        });
        return false;
      }, []);
      // Mirrors the real hook: dismiss clears the error and the sample
      // response only. `isVerifying` is owned by the request itself and is
      // cleared when it settles, so an abandoned check leaves it true.
      const dismiss = React.useCallback(
        () =>
          setState((s: { isVerifying: boolean }) => ({
            ...s,
            verifyError: null,
            verifySampleResponse: null,
          })),
        [],
      );
      return { ...state, verifySavedAgent, verifyAdHoc: jest.fn(), dismiss };
    },
  };
});

// AgentPicker fetches agents over raw `fetch` when an access token exists.
// No token is present in jsdom's default localStorage, so its effect is a
// no-op — but we still stub the picker itself to drive selection
// deterministically without depending on that internal fetch timing. A second
// button selects an unverified connection agent to exercise the verify gate,
// and a third selects a different unverified connection agent so a check
// started for one agent can be resolved while the gate shows the other.
jest.mock("../AgentPicker", () => ({
  __esModule: true,
  AgentPicker: ({ onSelectAgent, label, placeholder }: any) => (
    <div>
      <label>{label}</label>
      <button
        type="button"
        onClick={() =>
          onSelectAgent({ uuid: "agent-1", name: "My Agent", type: "agent" })
        }
      >
        {placeholder}
      </button>
      <button
        type="button"
        onClick={() =>
          onSelectAgent({
            uuid: "conn-1",
            name: "My Connection",
            type: "connection",
            verified: false,
          })
        }
      >
        Select unverified connection
      </button>
      <button
        type="button"
        onClick={() =>
          onSelectAgent({
            uuid: "conn-2",
            name: "Other Connection",
            type: "connection",
            verified: false,
          })
        }
      >
        Select other unverified connection
      </button>
    </div>
  ),
}));

beforeEach(() => {
  pushMock.mockClear();
  mockVerifySpy.mockClear();
  mockVerifyOutcome.success = true;
  mockVerifyOutcome.error = null;
  mockVerifyOutcome.sampleResponse = null;
  mockVerifyHold.promise = null;
});

describe("RunTestDialog", () => {
  it("renders nothing when closed", () => {
    const { container } = render(
      <RunTestDialog
        isOpen={false}
        onClose={jest.fn()}
        testName="Test A"
        testUuid="t1"
        onRunTest={jest.fn()}
      />,
    );
    expect(container).toBeEmptyDOMElement();
  });

  it("shows the test name in the subtitle and disables Run test until an agent is picked", () => {
    render(
      <RunTestDialog
        isOpen
        onClose={jest.fn()}
        testName="My Test"
        testUuid="t1"
        onRunTest={jest.fn()}
      />,
    );
    expect(screen.getByText(/Select an agent to run the test/)).toHaveTextContent(
      "My Test",
    );
    expect(screen.getByRole("button", { name: /Run test/ })).toBeDisabled();
    // Attach checkbox not shown until an agent is selected
    expect(
      screen.queryByText("Attach this test to the agent config"),
    ).not.toBeInTheDocument();
  });

  it("selects an agent, shows the attach checkbox (checked by default), and calls onRunTest", async () => {
    const user = setupUser();
    const onRunTest = jest.fn();
    render(
      <RunTestDialog
        isOpen
        onClose={jest.fn()}
        testName="My Test"
        testUuid="t1"
        onRunTest={onRunTest}
      />,
    );

    await user.click(screen.getByText("Select an agent"));
    expect(
      screen.getByText("Attach this test to the agent config"),
    ).toBeInTheDocument();

    const runButton = screen.getByRole("button", { name: /Run test/ });
    expect(runButton).toBeEnabled();
    await user.click(runButton);

    expect(onRunTest).toHaveBeenCalledWith("agent-1", "My Agent", true);
  });

  it("toggles the attach checkbox off and passes false to onRunTest", async () => {
    const user = setupUser();
    const onRunTest = jest.fn();
    render(
      <RunTestDialog
        isOpen
        onClose={jest.fn()}
        testName="My Test"
        testUuid="t1"
        onRunTest={onRunTest}
      />,
    );

    await user.click(screen.getByText("Select an agent"));
    await user.click(
      screen.getByText("Attach this test to the agent config").previousSibling as HTMLElement,
    );
    await user.click(screen.getByRole("button", { name: /Run test/ }));

    expect(onRunTest).toHaveBeenCalledWith("agent-1", "My Agent", false);
  });

  it("calls onClose when the close (X) button is clicked", async () => {
    const user = setupUser();
    const onClose = jest.fn();
    render(
      <RunTestDialog
        isOpen
        onClose={onClose}
        testName="My Test"
        testUuid="t1"
        onRunTest={jest.fn()}
      />,
    );
    // The X button is the first button in the header (no accessible name)
    const buttons = screen.getAllByRole("button");
    await user.click(buttons[0]);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("calls onClose when Cancel is clicked", async () => {
    const user = setupUser();
    const onClose = jest.fn();
    render(
      <RunTestDialog
        isOpen
        onClose={onClose}
        testName="My Test"
        testUuid="t1"
        onRunTest={jest.fn()}
      />,
    );
    await user.click(screen.getByRole("button", { name: "Cancel" }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("calls onClose when the backdrop is clicked", async () => {
    const user = setupUser();
    const onClose = jest.fn();
    const { container } = render(
      <RunTestDialog
        isOpen
        onClose={onClose}
        testName="My Test"
        testUuid="t1"
        onRunTest={jest.fn()}
      />,
    );
    const backdrop = container.querySelector(".absolute.inset-0.bg-black\\/50") as HTMLElement;
    await user.click(backdrop);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("resets selected agent state after closing and reopening", async () => {
    const user = setupUser();
    const onRunTest = jest.fn();
    const { rerender } = render(
      <RunTestDialog
        isOpen
        onClose={jest.fn()}
        testName="My Test"
        testUuid="t1"
        onRunTest={onRunTest}
      />,
    );
    await user.click(screen.getByText("Select an agent"));
    expect(screen.getByRole("button", { name: /Run test/ })).toBeEnabled();

    rerender(
      <RunTestDialog
        isOpen={false}
        onClose={jest.fn()}
        testName="My Test"
        testUuid="t1"
        onRunTest={onRunTest}
      />,
    );
    rerender(
      <RunTestDialog
        isOpen
        onClose={jest.fn()}
        testName="My Test"
        testUuid="t1"
        onRunTest={onRunTest}
      />,
    );

    expect(screen.getByRole("button", { name: /Run test/ })).toBeDisabled();
  });

  it("can still be dismissed while verifying", async () => {
    // The check has no timeout, so freezing the dialog would trap the user
    // whenever the agent endpoint hangs. Cancel, the X and the backdrop all
    // stay live mid-check.
    const user = setupUser();
    const onClose = jest.fn();
    const onRunTest = jest.fn();
    let releaseVerify: () => void = () => {};
    mockVerifyHold.promise = new Promise<void>((resolve) => {
      releaseVerify = resolve;
    });

    const { container } = render(
      <RunTestDialog
        isOpen
        onClose={onClose}
        testName="My Test"
        testUuid="t1"
        onRunTest={onRunTest}
      />,
    );

    await user.click(screen.getByText("Select unverified connection"));
    await user.click(screen.getByRole("button", { name: /Run test/ }));
    await user.click(screen.getByRole("button", { name: "Verify" }));

    expect(screen.getByRole("button", { name: "Cancel" })).toBeEnabled();
    await user.click(screen.getByRole("button", { name: "Cancel" }));
    const buttons = screen.getAllByRole("button");
    await user.click(buttons[0]);
    const backdrop = container.querySelector(
      ".absolute.inset-0.bg-black\\/50",
    ) as HTMLElement;
    await user.click(backdrop);
    expect(onClose).toHaveBeenCalledTimes(3);
    expect(onRunTest).not.toHaveBeenCalled();

    await act(async () => {
      releaseVerify();
    });
  });

  it("abandons the run when the dialog is closed mid-check, and keeps no stale agent", async () => {
    // Closing cancels the run. The check keeps going, but the resume path must
    // notice the dialog is gone and neither run nor write the agent back.
    const user = setupUser();
    const onRunTest = jest.fn();
    let releaseVerify: () => void = () => {};
    mockVerifyHold.promise = new Promise<void>((resolve) => {
      releaseVerify = resolve;
    });

    const props = {
      testName: "My Test",
      testUuid: "t1",
      onClose: jest.fn(),
      onRunTest,
    };
    const { rerender } = render(<RunTestDialog isOpen {...props} />);

    await user.click(screen.getByText("Select unverified connection"));
    await user.click(screen.getByRole("button", { name: /Run test/ }));
    await user.click(screen.getByRole("button", { name: "Verify" }));

    // The parent closes the dialog while the check is still in flight.
    rerender(<RunTestDialog isOpen={false} {...props} />);
    await act(async () => {
      releaseVerify();
      await Promise.resolve();
    });

    expect(onRunTest).not.toHaveBeenCalled();

    // Reopening starts clean: no agent carried over from the abandoned check.
    rerender(<RunTestDialog isOpen {...props} />);
    expect(screen.getByRole("button", { name: /Run test/ })).toBeDisabled();
    expect(onRunTest).not.toHaveBeenCalled();
  });

  it("ignores a check that comes back for an agent the gate has moved on from", async () => {
    // The parent never unmounts this dialog, so a slow check survives a close
    // and reopen. When it lands, the gate belongs to a different agent, and
    // the late result must not run that older agent or write it back into the
    // picker.
    const user = setupUser();
    const onRunTest = jest.fn();
    let releaseVerify: () => void = () => {};
    mockVerifyHold.promise = new Promise<void>((resolve) => {
      releaseVerify = resolve;
    });

    const props = {
      testName: "My Test",
      testUuid: "t1",
      onClose: jest.fn(),
      onRunTest,
    };
    const { rerender } = render(<RunTestDialog isOpen {...props} />);

    // Agent A: enter the gate and start a check that will not settle yet.
    await user.click(screen.getByText("Select unverified connection"));
    await user.click(screen.getByRole("button", { name: /Run test/ }));
    await user.click(screen.getByRole("button", { name: "Verify" }));
    expect(mockVerifySpy).toHaveBeenCalledWith("conn-1");

    // The user closes, reopens, and gates a different agent B.
    rerender(<RunTestDialog isOpen={false} {...props} />);
    rerender(<RunTestDialog isOpen {...props} />);
    await user.click(screen.getByText("Select other unverified connection"));
    await user.click(screen.getByRole("button", { name: /Run test/ }));
    expect(screen.getByText(/is not verified yet/)).toHaveTextContent(
      "Other Connection",
    );

    // Agent A's check now succeeds.
    await act(async () => {
      releaseVerify();
      await Promise.resolve();
    });

    // No run for A, and no run at all: B has not been verified.
    expect(onRunTest).not.toHaveBeenCalled();
    // The gate is untouched: still agent B, still waiting to be verified.
    expect(screen.getByText(/is not verified yet/)).toHaveTextContent(
      "Other Connection",
    );
    expect(screen.queryByText(/"My Connection"/)).not.toBeInTheDocument();
  });

  it("shows an actionable Verify button on a new gate while an abandoned check is still in flight", async () => {
    // The verify hook's `isVerifying` is shared across attempts and only
    // clears when the request settles, so a gate entered after a cancelled
    // check must not inherit its busy state. Against a hanging endpoint that
    // would leave the button stuck on "Verifying..." indefinitely.
    const user = setupUser();
    const onRunTest = jest.fn();
    let releaseVerify: () => void = () => {};
    mockVerifyHold.promise = new Promise<void>((resolve) => {
      releaseVerify = resolve;
    });

    const props = {
      testName: "My Test",
      testUuid: "t1",
      onClose: jest.fn(),
      onRunTest,
    };
    const { rerender } = render(<RunTestDialog isOpen {...props} />);

    await user.click(screen.getByText("Select unverified connection"));
    await user.click(screen.getByRole("button", { name: /Run test/ }));
    await user.click(screen.getByRole("button", { name: "Verify" }));
    expect(
      screen.getByRole("button", { name: /Verifying/ }),
    ).toBeDisabled();

    // Cancel mid-check, then come straight back into the gate.
    rerender(<RunTestDialog isOpen={false} {...props} />);
    rerender(<RunTestDialog isOpen {...props} />);
    await user.click(screen.getByText("Select unverified connection"));
    await user.click(screen.getByRole("button", { name: /Run test/ }));

    // The fresh gate is usable even though the old check is still running.
    expect(screen.getByRole("button", { name: "Verify" })).toBeEnabled();
    expect(
      screen.queryByRole("button", { name: /Verifying/ }),
    ).not.toBeInTheDocument();

    await act(async () => {
      releaseVerify();
      await Promise.resolve();
    });
  });

  it("diverts to the verify gate for an unverified connection agent instead of running", async () => {
    const user = setupUser();
    const onRunTest = jest.fn();
    render(
      <RunTestDialog
        isOpen
        onClose={jest.fn()}
        testName="My Test"
        testUuid="t1"
        onRunTest={onRunTest}
      />,
    );

    await user.click(screen.getByText("Select unverified connection"));
    await user.click(screen.getByRole("button", { name: /Run test/ }));

    // The verify gate takes over inline; the run does not fire.
    expect(
      screen.getByText(/is not verified yet/),
    ).toBeInTheDocument();
    expect(onRunTest).not.toHaveBeenCalled();
    expect(screen.getByRole("button", { name: "Verify" })).toBeInTheDocument();
  });

  it("runs after a successful verification of a connection agent", async () => {
    const user = setupUser();
    const onRunTest = jest.fn();
    mockVerifyOutcome.success = true;
    render(
      <RunTestDialog
        isOpen
        onClose={jest.fn()}
        testName="My Test"
        testUuid="t1"
        onRunTest={onRunTest}
      />,
    );

    await user.click(screen.getByText("Select unverified connection"));
    await user.click(screen.getByRole("button", { name: /Run test/ }));
    await user.click(screen.getByRole("button", { name: /Verify/ }));

    await waitFor(() =>
      expect(mockVerifySpy).toHaveBeenCalledWith("conn-1"),
    );
    expect(onRunTest).toHaveBeenCalledWith("conn-1", "My Connection", true);
  });

  it("navigates to the connection settings when verification fails", async () => {
    const user = setupUser();
    const onRunTest = jest.fn();
    const onClose = jest.fn();
    mockVerifyOutcome.success = false;
    mockVerifyOutcome.error = "endpoint unreachable";
    render(
      <RunTestDialog
        isOpen
        onClose={onClose}
        testName="My Test"
        testUuid="t1"
        onRunTest={onRunTest}
      />,
    );

    await user.click(screen.getByText("Select unverified connection"));
    await user.click(screen.getByRole("button", { name: /Run test/ }));
    await user.click(screen.getByRole("button", { name: /Verify/ }));

    await waitFor(() => expect(mockVerifySpy).toHaveBeenCalled());
    expect(onRunTest).not.toHaveBeenCalled();
    // The failed verify re-renders the gate with the error + jump button.
    expect(await screen.findByText("endpoint unreachable")).toBeInTheDocument();

    await user.click(
      screen.getByRole("button", { name: "Go to connection settings" }),
    );
    expect(onClose).toHaveBeenCalled();
    expect(pushMock).toHaveBeenCalledWith("/agents/conn-1?tab=connection");
  });
});
