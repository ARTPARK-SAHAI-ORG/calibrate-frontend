import { act, render, screen, setupUser } from "@/test-utils";
import { RunTestDialog } from "../RunTestDialog";

jest.mock("../../lib/reportError", () => ({ reportError: jest.fn() }));

// AgentPicker fetches agents over raw `fetch` when an access token exists.
// No token is present in jsdom's default localStorage, so its effect is a
// no-op — but we still stub the picker itself to drive selection
// deterministically without depending on that internal fetch timing.
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
    </div>
  ),
}));

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

  it("disables Run test and shows a spinner while the run is starting, and ignores a second click", async () => {
    const user = setupUser();
    let resolveRun: () => void = () => {};
    const onRunTest = jest.fn(
      () =>
        new Promise<void>((resolve) => {
          resolveRun = resolve;
        }),
    );
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
    const runButton = screen.getByRole("button", { name: /Run test/ });
    await user.click(runButton);

    expect(onRunTest).toHaveBeenCalledTimes(1);
    expect(runButton).toBeDisabled();
    expect(runButton.querySelector(".animate-spin")).toBeInTheDocument();

    // A second click while the run is starting must not create a second run.
    await user.click(runButton);
    expect(onRunTest).toHaveBeenCalledTimes(1);

    await act(async () => {
      resolveRun();
    });
    expect(runButton).toBeEnabled();
    expect(runButton.querySelector(".animate-spin")).not.toBeInTheDocument();
  });

});
