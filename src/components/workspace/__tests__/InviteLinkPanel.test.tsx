/**
 * Interaction tests for the workspace invite link panel.
 * `@/hooks` is mocked so nothing reaches the backend.
 */
import { act, render, screen, setupUser, waitFor } from "@/test-utils";
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
  it("offers to create a link when the workspace has none", () => {
    render(<InviteLinkPanel orgUuid="org-1" />);

    expect(
      screen.getByRole("button", { name: "Create an invite link" }),
    ).toBeEnabled();
    expect(
      screen.getByText(/Anyone with this link can join this workspace/),
    ).toBeInTheDocument();
  });

  it("creates a link and shows its address", async () => {
    const user = setupUser();
    const { rerender } = render(<InviteLinkPanel orgUuid="org-1" />);

    await user.click(
      screen.getByRole("button", { name: "Create an invite link" }),
    );
    await waitFor(() => expect(createInviteLink).toHaveBeenCalledTimes(1));

    inviteLink = LINK;
    rerender(<InviteLinkPanel orgUuid="org-1" />);

    expect(
      screen.getByText(`${window.location.origin}/invite/abc123`),
    ).toBeInTheDocument();
  });

  it("copies the address to the clipboard", async () => {
    inviteLink = LINK;
    const user = setupUser();
    render(<InviteLinkPanel orgUuid="org-1" />);

    await user.click(screen.getByRole("button", { name: "Copy link" }));

    expect(
      await screen.findByRole("button", { name: "Copied" }),
    ).toBeInTheDocument();
    await expect(navigator.clipboard.readText()).resolves.toBe(
      `${window.location.origin}/invite/abc123`,
    );
  });

  it("asks for confirmation before replacing the link", async () => {
    inviteLink = LINK;
    const user = setupUser();
    render(<InviteLinkPanel orgUuid="org-1" />);

    await user.click(screen.getByRole("button", { name: "Create a new link" }));
    expect(createInviteLink).not.toHaveBeenCalled();
    expect(
      screen.getByText(/The link you are sharing now will stop working/),
    ).toBeInTheDocument();

    const confirm = screen
      .getAllByRole("button", { name: "Create a new link" })
      .at(-1)!;
    await user.click(confirm);
    await waitFor(() => expect(createInviteLink).toHaveBeenCalledTimes(1));
  });

  it("asks for confirmation before turning the link off", async () => {
    inviteLink = LINK;
    const user = setupUser();
    render(<InviteLinkPanel orgUuid="org-1" />);

    await user.click(screen.getByRole("button", { name: "Turn off the link" }));
    expect(revokeInviteLink).not.toHaveBeenCalled();

    const confirm = screen
      .getAllByRole("button", { name: "Turn off the link" })
      .at(-1)!;
    await user.click(confirm);
    await waitFor(() => expect(revokeInviteLink).toHaveBeenCalledTimes(1));
  });

  it("shows the failure message and leaves the button usable", async () => {
    createInviteLink.mockRejectedValue(new Error("Something went wrong"));
    const user = setupUser();
    render(<InviteLinkPanel orgUuid="org-1" />);

    const button = screen.getByRole("button", {
      name: "Create an invite link",
    });
    await user.click(button);

    expect(await screen.findByText("Something went wrong")).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Create an invite link" }),
    ).toBeEnabled();
  });

  // A message written under the button would sit behind the open confirmation,
  // so the two confirmed actions report their failure over the top of it.
  it("says so over the confirmation when replacing the link fails", async () => {
    inviteLink = LINK;
    createInviteLink.mockRejectedValue(new Error("Could not reach the server"));
    const user = setupUser();
    render(<InviteLinkPanel orgUuid="org-1" />);

    await user.click(screen.getByRole("button", { name: "Create a new link" }));
    await user.click(
      screen.getAllByRole("button", { name: "Create a new link" }).at(-1)!,
    );

    await waitFor(() =>
      expect(toastError).toHaveBeenCalledWith("Could not reach the server"),
    );
    // The confirmation is still open, so the reader can try again.
    expect(
      screen.getByText(/The link you are sharing now will stop working/),
    ).toBeInTheDocument();
  });

  it("says so over the confirmation when turning the link off fails", async () => {
    inviteLink = LINK;
    revokeInviteLink.mockRejectedValue(new Error("Could not reach the server"));
    const user = setupUser();
    render(<InviteLinkPanel orgUuid="org-1" />);

    await user.click(screen.getByRole("button", { name: "Turn off the link" }));
    await user.click(
      screen.getAllByRole("button", { name: "Turn off the link" }).at(-1)!,
    );

    await waitFor(() =>
      expect(toastError).toHaveBeenCalledWith("Could not reach the server"),
    );
  });

  it("keeps the confirmation open until the link has actually been turned off", async () => {
    inviteLink = LINK;
    let finish: () => void = () => {};
    revokeInviteLink.mockImplementation(
      () =>
        new Promise<void>((resolve) => {
          finish = resolve;
        }),
    );
    const user = setupUser();
    render(<InviteLinkPanel orgUuid="org-1" />);

    await user.click(screen.getByRole("button", { name: "Turn off the link" }));
    await user.click(
      screen.getAllByRole("button", { name: "Turn off the link" }).at(-1)!,
    );

    await waitFor(() => expect(revokeInviteLink).toHaveBeenCalledTimes(1));
    expect(
      screen.getByText(/The link will stop working/),
    ).toBeInTheDocument();

    await act(async () => {
      finish();
    });

    await waitFor(() =>
      expect(screen.queryByText(/The link will stop working/)).toBeNull(),
    );
  });

  // A link that could not be read is not a workspace with no link. Offering to
  // create one here would replace the link people are already holding.
  it("does not offer to create a link when the existing one could not be read", () => {
    loadError = "Request failed: 500 - Server error";
    render(<InviteLinkPanel orgUuid="org-1" />);

    expect(
      screen.queryByRole("button", { name: "Create an invite link" }),
    ).toBeNull();
    expect(
      screen.getByText("The invite link could not be read. Try again."),
    ).toBeInTheDocument();
  });

  it("reads the link again when the reader tries again", async () => {
    loadError = "Request failed: 500 - Server error";
    const user = setupUser();
    render(<InviteLinkPanel orgUuid="org-1" />);

    await user.click(screen.getByRole("button", { name: "Try again" }));

    expect(refetch).toHaveBeenCalledTimes(1);
  });

  // On the first render the sign-in token has not been read out of storage
  // yet, so nothing is known about the link. Showing the create button here
  // would offer to replace a link that may well exist.
  it("does not offer to create a link before it knows who is signed in", () => {
    accessToken = null;
    render(<InviteLinkPanel orgUuid="org-1" />);

    expect(
      screen.queryByRole("button", { name: "Create an invite link" }),
    ).toBeNull();
  });

  it("does not offer to create a link while the existing one is still being read", () => {
    isLoading = true;
    render(<InviteLinkPanel orgUuid="org-1" />);

    expect(
      screen.queryByRole("button", { name: "Create an invite link" }),
    ).toBeNull();
  });

  it("says what it is doing while it replaces the link", async () => {
    inviteLink = LINK;
    createInviteLink.mockImplementation(() => new Promise(() => {}));
    const user = setupUser();
    render(<InviteLinkPanel orgUuid="org-1" />);

    await user.click(screen.getByRole("button", { name: "Create a new link" }));
    await user.click(
      screen.getAllByRole("button", { name: "Create a new link" }).at(-1)!,
    );

    expect(
      await screen.findByText("Creating the new link..."),
    ).toBeInTheDocument();
  });
});
