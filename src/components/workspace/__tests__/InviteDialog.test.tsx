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

  it("shows both ways of inviting side by side", () => {
    open();

    expect(screen.getByText("Invite team members")).toBeInTheDocument();
    expect(screen.getByTestId("add-by-email")).toBeInTheDocument();
    expect(screen.getByTestId("invite-link")).toBeInTheDocument();
  });

  it("hands each column what it needs", () => {
    open();

    expect(screen.getByTestId("add-by-email")).toHaveTextContent("function");
    expect(screen.getByTestId("invite-link")).toHaveTextContent("org-1");
  });

  it("closes from Done and from the cross", async () => {
    const user = setupUser();
    open();

    await user.click(screen.getByRole("button", { name: "Done" }));
    expect(onClose).toHaveBeenCalledTimes(1);

    await user.click(screen.getByRole("button", { name: "Close" }));
    expect(onClose).toHaveBeenCalledTimes(2);
  });
});
