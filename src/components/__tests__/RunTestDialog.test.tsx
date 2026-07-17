import { render, screen, setupUser, waitFor } from "@/test-utils";
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
      const dismiss = React.useCallback(
        () =>
          setState({
            isVerifying: false,
            verifyError: null,
            verifySampleResponse: null,
          }),
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
// button selects an unverified connection agent to exercise the verify gate.
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
    </div>
  ),
}));

beforeEach(() => {
  pushMock.mockClear();
  mockVerifySpy.mockClear();
  mockVerifyOutcome.success = true;
  mockVerifyOutcome.error = null;
  mockVerifyOutcome.sampleResponse = null;
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
      screen.getByText(/has not been verified yet/),
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
