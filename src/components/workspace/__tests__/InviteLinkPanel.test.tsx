/**
 * Interaction tests for the invite link column of the invite dialog.
 * `@/hooks` is mocked so nothing reaches the backend.
 */
import { render, screen, setupUser, waitFor } from "@/test-utils";
import { InviteLinkPanel } from "../InviteLinkPanel";

const createInviteLink = jest.fn();
const revokeInviteLink = jest.fn();
const LINK = { token: "abc123", created_at: "2026-01-01T00:00:00Z" };
let inviteLink: { token: string; created_at: string } | null = null;
let isLoading = false;
let loadError: string | null = null;
const refetch = jest.fn();
let accessToken: string | null = "test-token";

const toastError = jest.fn();
jest.mock("sonner", () => ({
  toast: {
    error: (...args: unknown[]) => toastError(...args),
    success: jest.fn(),
  },
}));

jest.mock("../../../hooks", () => ({
  useAccessToken: () => accessToken,
  useOrgInviteLink: () => ({
    inviteLink,
    isLoading,
    error: loadError,
    refetch,
    createInviteLink,
    revokeInviteLink,
  }),
}));

const renderPanel = () => render(<InviteLinkPanel orgUuid="org-1" />);

beforeEach(() => {
  toastError.mockReset();
  refetch.mockReset();
  inviteLink = null;
  isLoading = false;
  loadError = null;
  accessToken = "test-token";
  createInviteLink.mockReset().mockResolvedValue(LINK);
  revokeInviteLink.mockReset().mockResolvedValue(undefined);
});

describe("InviteLinkPanel", () => {
  it("shows the switch off with no link, and turning it on makes one", async () => {
    const user = setupUser();
    renderPanel();

    const toggle = screen.getByRole("switch", { name: "Invite link" });
    expect(toggle).toHaveAttribute("aria-checked", "false");
    expect(
      screen.getByText("Anyone with this link can join this workspace."),
    ).toBeInTheDocument();

    await user.click(toggle);
    await waitFor(() => expect(createInviteLink).toHaveBeenCalledTimes(1));
  });

  it("shows the address, the copy button and Reset link once a link exists", () => {
    inviteLink = LINK;
    renderPanel();

    expect(screen.getByRole("switch", { name: "Invite link" })).toHaveAttribute(
      "aria-checked",
      "true",
    );
    expect(
      screen.getByText(`${window.location.origin}/invite/abc123`),
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /copy/i })).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Reset link" }),
    ).toBeInTheDocument();
  });

  it("asks for confirmation before turning the link off", async () => {
    inviteLink = LINK;
    const user = setupUser();
    renderPanel();

    await user.click(screen.getByRole("switch", { name: "Invite link" }));
    expect(revokeInviteLink).not.toHaveBeenCalled();
    expect(screen.getByText(/The link will stop working/)).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Turn off the link" }));
    await waitFor(() => expect(revokeInviteLink).toHaveBeenCalledTimes(1));
  });

  it("asks for confirmation before resetting the link", async () => {
    inviteLink = LINK;
    const user = setupUser();
    renderPanel();

    await user.click(screen.getByRole("button", { name: "Reset link" }));
    expect(createInviteLink).not.toHaveBeenCalled();
    expect(
      screen.getByText(/The link you are sharing now will stop working/),
    ).toBeInTheDocument();

    await user.click(
      screen.getAllByRole("button", { name: "Reset link" }).at(-1)!,
    );
    await waitFor(() => expect(createInviteLink).toHaveBeenCalledTimes(1));
  });

  // A link that could not be read is not a workspace with no link. An off
  // switch here would invite the reader to replace the link people hold.
  it("shows Try again and no switch when the link could not be read", async () => {
    loadError = "Request failed: 500 - Server error";
    const user = setupUser();
    renderPanel();

    expect(screen.queryByRole("switch")).toBeNull();
    expect(
      screen.getByText("The invite link could not be read. Try again."),
    ).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Try again" }));
    expect(refetch).toHaveBeenCalledTimes(1);
  });

  it("shows no switch before it knows who is signed in", () => {
    accessToken = null;
    renderPanel();
    expect(screen.queryByRole("switch")).toBeNull();
  });

  // A message written under the switch would sit behind the open
  // confirmation, so a confirmed action reports over the top of it.
  it("says so over the confirmation when turning the link off fails", async () => {
    inviteLink = LINK;
    revokeInviteLink.mockRejectedValue(new Error("Could not reach the server"));
    const user = setupUser();
    renderPanel();

    await user.click(screen.getByRole("switch", { name: "Invite link" }));
    await user.click(screen.getByRole("button", { name: "Turn off the link" }));

    await waitFor(() =>
      expect(toastError).toHaveBeenCalledWith("Could not reach the server"),
    );
    // The confirmation is still open, so the reader can try again.
    expect(screen.getByText(/The link will stop working/)).toBeInTheDocument();
  });

  it("says so over the confirmation when resetting the link fails", async () => {
    inviteLink = LINK;
    createInviteLink.mockRejectedValue(new Error("Could not reach the server"));
    const user = setupUser();
    renderPanel();

    await user.click(screen.getByRole("button", { name: "Reset link" }));
    await user.click(
      screen.getAllByRole("button", { name: "Reset link" }).at(-1)!,
    );

    await waitFor(() =>
      expect(toastError).toHaveBeenCalledWith("Could not reach the server"),
    );
    expect(
      screen.getByText(/The link you are sharing now will stop working/),
    ).toBeInTheDocument();
  });

  it("keeps the confirmation in its loading state until the request answers", async () => {
    inviteLink = LINK;
    createInviteLink.mockImplementation(() => new Promise(() => {}));
    const user = setupUser();
    renderPanel();

    await user.click(screen.getByRole("button", { name: "Reset link" }));
    await user.click(
      screen.getAllByRole("button", { name: "Reset link" }).at(-1)!,
    );

    expect(
      await screen.findByText("Resetting the link..."),
    ).toBeInTheDocument();
  });

  it("shows the failure under the switch when turning it on fails", async () => {
    createInviteLink.mockRejectedValue(new Error("Could not reach the server"));
    const user = setupUser();
    renderPanel();

    await user.click(screen.getByRole("switch", { name: "Invite link" }));

    expect(
      await screen.findByText("Could not reach the server"),
    ).toBeInTheDocument();
  });
});
