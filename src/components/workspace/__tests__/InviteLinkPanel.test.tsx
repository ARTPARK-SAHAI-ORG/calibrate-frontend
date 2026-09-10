/**
 * The invite link is made once and then shown. There is no turning it off and
 * no replacing it, so there is nothing here that needs a confirmation.
 */
import { render, screen, setupUser, waitFor } from "@/test-utils";
import { InviteLinkPanel } from "../InviteLinkPanel";

const createInviteLink = jest.fn();
const refetch = jest.fn();
const LINK = { token: "abc123", created_at: "2026-01-01T00:00:00Z" };
let inviteLink: { token: string; created_at: string } | null = null;
let isLoading = false;
let loadError: string | null = null;
let accessToken: string | null = "test-token";

jest.mock("../../../hooks", () => ({
  useAccessToken: () => accessToken,
  useOrgInviteLink: () => ({
    inviteLink,
    isLoading,
    error: loadError,
    refetch,
    createInviteLink,
  }),
}));

jest.mock("../../../lib/reportError", () => ({ reportError: jest.fn() }));

beforeEach(() => {
  createInviteLink.mockReset().mockResolvedValue(LINK);
  refetch.mockReset();
  inviteLink = null;
  isLoading = false;
  loadError = null;
  accessToken = "test-token";
});

const address = `${window.location.origin}/invite/abc123`;

describe("InviteLinkPanel", () => {
  it("offers to make a link when the workspace has none", () => {
    render(<InviteLinkPanel orgUuid="org-1" />);

    expect(
      screen.getByRole("button", { name: "Create an invite link" }),
    ).toBeEnabled();
  });

  it("makes the link and then just shows it", async () => {
    const user = setupUser();
    const { rerender } = render(<InviteLinkPanel orgUuid="org-1" />);

    await user.click(
      screen.getByRole("button", { name: "Create an invite link" }),
    );
    await waitFor(() => expect(createInviteLink).toHaveBeenCalledTimes(1));

    inviteLink = LINK;
    rerender(<InviteLinkPanel orgUuid="org-1" />);

    expect(screen.getByText(address)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Copy link" })).toBeInTheDocument();
  });

  // Both of these stop an address other people are already holding from
  // working, so neither is offered.
  it("offers no way to turn the link off or replace it", () => {
    inviteLink = LINK;
    render(<InviteLinkPanel orgUuid="org-1" />);

    expect(screen.queryByRole("switch")).toBeNull();
    expect(screen.queryByRole("button", { name: /reset/i })).toBeNull();
    expect(screen.queryByRole("button", { name: /turn off/i })).toBeNull();
    expect(
      screen.queryByRole("button", { name: "Create an invite link" }),
    ).toBeNull();
  });

  it("copies the whole address, not a shortened one", async () => {
    inviteLink = LINK;
    const user = setupUser();
    render(<InviteLinkPanel orgUuid="org-1" />);

    await user.click(screen.getByRole("button", { name: "Copy link" }));

    await expect(navigator.clipboard.readText()).resolves.toBe(address);
  });

  it("shows why making the link failed and leaves the button usable", async () => {
    createInviteLink.mockRejectedValue(new Error("Something went wrong"));
    const user = setupUser();
    render(<InviteLinkPanel orgUuid="org-1" />);

    await user.click(
      screen.getByRole("button", { name: "Create an invite link" }),
    );

    expect(await screen.findByText("Something went wrong")).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Create an invite link" }),
    ).toBeEnabled();
  });

  // A link that could not be read is not a workspace with no link. Offering to
  // make one here would replace the link people are already holding.
  it("offers Try again, not a create button, when the link could not be read", async () => {
    loadError = "Request failed: 500 - Server error";
    const user = setupUser();
    render(<InviteLinkPanel orgUuid="org-1" />);

    expect(
      screen.queryByRole("button", { name: "Create an invite link" }),
    ).toBeNull();
    expect(
      screen.getByText("The invite link could not be read. Try again."),
    ).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Try again" }));
    expect(refetch).toHaveBeenCalledTimes(1);
  });

  it("offers nothing before it knows who is signed in", () => {
    accessToken = null;
    render(<InviteLinkPanel orgUuid="org-1" />);

    expect(
      screen.queryByRole("button", { name: "Create an invite link" }),
    ).toBeNull();
  });

  it("offers nothing while the link is still being read", () => {
    isLoading = true;
    render(<InviteLinkPanel orgUuid="org-1" />);

    expect(
      screen.queryByRole("button", { name: "Create an invite link" }),
    ).toBeNull();
  });
});
