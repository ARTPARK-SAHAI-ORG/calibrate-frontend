/**
 * The dialog itself is only a frame: two columns, a heading, and two ways to
 * close it. Each column is tested on its own, so both are faked here.
 */
import { render, screen, setupUser } from "@/test-utils";
import { InviteDialog } from "../InviteDialog";

jest.mock("../AddByEmailPanel", () => ({
  AddByEmailPanel: ({
    onAddMember,
  }: {
    onAddMember: (email: string) => Promise<unknown>;
  }) => <div data-testid="add-by-email">{typeof onAddMember}</div>,
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
    expect(screen.queryByText("Invite team members")).toBeNull();
  });

  it("opens on the email side, with the link side put away", () => {
    open();

    expect(screen.getByText("Invite team members")).toBeInTheDocument();
    expect(screen.getByTestId("add-by-email")).toBeInTheDocument();
    expect(screen.queryByTestId("invite-link")).toBeNull();
  });

  it("swaps to the link side and back", async () => {
    const user = setupUser();
    open();

    await user.click(screen.getByRole("button", { name: "With a link" }));
    expect(screen.getByTestId("invite-link")).toBeInTheDocument();
    expect(screen.queryByTestId("add-by-email")).toBeNull();

    await user.click(screen.getByRole("button", { name: "By email" }));
    expect(screen.getByTestId("add-by-email")).toBeInTheDocument();
  });

  it("hands each side what it needs", async () => {
    const user = setupUser();
    open();

    expect(screen.getByTestId("add-by-email")).toHaveTextContent("function");

    await user.click(screen.getByRole("button", { name: "With a link" }));
    expect(screen.getByTestId("invite-link")).toHaveTextContent("org-1");
  });

  // Reopening on whichever side was used last would be a surprise on a screen
  // opened this rarely.
  it("comes back on the email side after it was closed on the link side", async () => {
    const user = setupUser();
    open();

    await user.click(screen.getByRole("button", { name: "With a link" }));
    expect(screen.getByTestId("invite-link")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Close" }));
    expect(onClose).toHaveBeenCalled();

    expect(screen.getByTestId("add-by-email")).toBeInTheDocument();
  });

  it("closes from the cross", async () => {
    const user = setupUser();
    open();

    await user.click(screen.getByRole("button", { name: "Close" }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
