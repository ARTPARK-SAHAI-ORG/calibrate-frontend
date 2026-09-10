/**
 * The dialog itself is only a frame: two columns, a heading, and two ways to
 * close it. Each column is tested on its own, so both are faked here.
 */
import { render, screen, setupUser } from "@/test-utils";
import { InviteDialog } from "../InviteDialog";

jest.mock("../AddByEmailPanel", () => ({
  AddByEmailPanel: ({
    onAddMember,
    onAllAdded,
    onBusyChange,
  }: {
    onAddMember: (email: string) => Promise<unknown>;
    onAllAdded?: () => void;
    onBusyChange?: (busy: boolean) => void;
  }) => (
    <div data-testid="add-by-email">
      {typeof onAddMember}
      <button type="button" onClick={onAllAdded}>
        stand-in for everyone being added
      </button>
      <button type="button" onClick={() => onBusyChange?.(true)}>
        stand-in for adding starting
      </button>
      {/* Stands in for the addresses being typed, so a test can tell whether
          swapping sides threw them away. */}
      <input aria-label="stand-in for what is typed" defaultValue="" />
    </div>
  ),
}));

jest.mock("../InviteLinkPanel", () => ({
  InviteLinkPanel: ({ orgUuid }: { orgUuid: string }) => (
    <div data-testid="invite-link">{orgUuid}</div>
  ),
}));

const onClose = jest.fn();
const onAddMember = jest.fn();

function open(isOpen = true) {
  return render(
    <InviteDialog
      isOpen={isOpen}
      onClose={onClose}
      orgUuid="org-1"
      onAddMember={onAddMember}
    />,
  );
}

beforeEach(() => {
  onClose.mockReset();
  onAddMember.mockReset();
});

describe("InviteDialog", () => {
  it("shows nothing while it is closed", () => {
    open(false);
    expect(screen.queryByText("Add team members")).toBeNull();
  });

  it("opens on the email side, with the link side put away", () => {
    open();

    expect(screen.getByText("Add team members")).toBeInTheDocument();
    expect(screen.getByTestId("add-by-email")).toBeVisible();
    expect(screen.getByTestId("invite-link")).not.toBeVisible();
  });

  it("swaps to the link side and back", async () => {
    const user = setupUser();
    open();

    await user.click(screen.getByRole("button", { name: "Invite with a link" }));
    expect(screen.getByTestId("invite-link")).toBeVisible();
    expect(screen.getByTestId("add-by-email")).not.toBeVisible();

    await user.click(screen.getByRole("button", { name: "By email" }));
    expect(screen.getByTestId("add-by-email")).toBeVisible();
  });

  it("hands each side what it needs", async () => {
    const user = setupUser();
    open();

    expect(screen.getByTestId("add-by-email")).toHaveTextContent("function");

    await user.click(screen.getByRole("button", { name: "Invite with a link" }));
    expect(screen.getByTestId("invite-link")).toHaveTextContent("org-1");
  });

  // Reopening on whichever side was used last would be a surprise on a screen
  // opened this rarely.
  it("comes back on the email side after it was closed on the link side", async () => {
    const user = setupUser();
    open();

    await user.click(screen.getByRole("button", { name: "Invite with a link" }));
    expect(screen.getByTestId("invite-link")).toBeVisible();

    await user.click(screen.getByRole("button", { name: "Close" }));
    expect(onClose).toHaveBeenCalled();

    expect(screen.getByTestId("add-by-email")).toBeVisible();
  });

  it("closes from the cross", async () => {
    const user = setupUser();
    open();

    await user.click(screen.getByRole("button", { name: "Close" }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  // Swapping to the link and back used to build the email side again from
  // scratch, losing every address already typed.
  it("keeps what was typed when the sides are swapped", async () => {
    const user = setupUser();
    open();

    const typed = screen.getByLabelText("stand-in for what is typed");
    await user.type(typed, "aman@artpark.in");
    expect(typed).toHaveValue("aman@artpark.in");

    await user.click(screen.getByRole("button", { name: "Invite with a link" }));
    await user.click(screen.getByRole("button", { name: "By email" }));

    expect(screen.getByLabelText("stand-in for what is typed")).toHaveValue(
      "aman@artpark.in",
    );
  });

  // Once everyone is in there is nothing left to read here, and the member
  // list behind the dialog is the confirmation.
  it("closes itself once every address went in", async () => {
    const user = setupUser();
    open();

    await user.click(
      screen.getByRole("button", { name: "stand-in for everyone being added" }),
    );

    expect(onClose).toHaveBeenCalledTimes(1);
  });

  // Closing part way through did not stop the rest of the addresses being
  // sent, and anything that failed had nowhere left to report.
  it("refuses to close while addresses are still being added", async () => {
    const user = setupUser();
    open();

    await user.click(
      screen.getByRole("button", { name: "stand-in for adding starting" }),
    );

    await user.click(screen.getByRole("button", { name: "Close" }));
    expect(onClose).not.toHaveBeenCalled();
  });
});
