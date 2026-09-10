import { render, screen, setupUser } from "@/test-utils";
import { waitFor } from "@testing-library/react";
import InvitePage from "../page";

const TOKEN = "abc123";

const mockReplace = jest.fn();
jest.mock("next/navigation", () => ({
  __esModule: true,
  useParams: () => ({ token: "abc123" }),
  useRouter: () => ({ replace: mockReplace, push: jest.fn() }),
  usePathname: () => `/invite/abc123`,
  useSearchParams: () => new URLSearchParams(),
}));

// Relative specifiers, not the "@/" alias: jest.mock's first argument is a
// plain string the transform does not rewrite, so the alias does not resolve.
const fetchInvitePreview = jest.fn();
const acceptInvite = jest.fn();
jest.mock("../../../../lib/invites", () => ({
  fetchInvitePreview: (...args: unknown[]) => fetchInvitePreview(...args),
  acceptInvite: (...args: unknown[]) => acceptInvite(...args),
}));

const setActiveOrgUuid = jest.fn();
const notifyOrganizationsChanged = jest.fn();
jest.mock("../../../../lib/orgs", () => ({
  setActiveOrgUuid: (...args: unknown[]) => setActiveOrgUuid(...args),
  notifyOrganizationsChanged: () => notifyOrganizationsChanged(),
}));

const clearOrgsCache = jest.fn();
const mockAuth = jest.fn();
jest.mock("../../../../hooks", () => ({
  useAuth: () => mockAuth(),
  clearOrgsCache: () => clearOrgsCache(),
}));

function signedOut() {
  mockAuth.mockReturnValue({
    isAuthenticated: false,
    isLoading: false,
    accessToken: null,
  });
}

function signedIn() {
  mockAuth.mockReturnValue({
    isAuthenticated: true,
    isLoading: false,
    accessToken: "jwt-token",
  });
}

beforeEach(() => {
  jest.clearAllMocks();
  signedOut();
});

describe("InvitePage", () => {
  it("shows the spinner while the workspace name is still being read", () => {
    fetchInvitePreview.mockReturnValue(new Promise(() => {}));
    const { container } = render(<InvitePage />);

    expect(container.querySelector(".animate-spin")).toBeInTheDocument();
    expect(
      screen.queryByText("This invite link no longer works"),
    ).not.toBeInTheDocument();
  });

  it("says the link no longer works when there is no workspace behind it", async () => {
    fetchInvitePreview.mockResolvedValue(null);
    render(<InvitePage />);

    expect(
      await screen.findByText("This invite link no longer works"),
    ).toBeInTheDocument();
    expect(
      screen.getByText("Ask whoever sent it for a new one."),
    ).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Go to the home page" })).toHaveAttribute(
      "href",
      "/",
    );
    expect(fetchInvitePreview).toHaveBeenCalledWith(TOKEN);
  });

  it("offers sign in and create an account, both coming back to this link", async () => {
    fetchInvitePreview.mockResolvedValue({ organization_name: "Acme" });
    render(<InvitePage />);

    expect(
      await screen.findByText("You have been invited to join Acme"),
    ).toBeInTheDocument();

    const back = encodeURIComponent(`/invite/${TOKEN}`);
    expect(screen.getByRole("link", { name: "Sign in" })).toHaveAttribute(
      "href",
      `/login?callbackUrl=${back}`,
    );
    expect(
      screen.getByRole("link", { name: "Create an account" }),
    ).toHaveAttribute("href", `/signup?callbackUrl=${back}`);
  });

  it("joins the workspace and opens it", async () => {
    signedIn();
    fetchInvitePreview.mockResolvedValue({ organization_name: "Acme" });
    acceptInvite.mockResolvedValue({ uuid: "11111111-2222-3333-4444-555555555555" });
    const user = setupUser();
    render(<InvitePage />);

    await user.click(await screen.findByRole("button", { name: "Join Acme" }));

    await waitFor(() =>
      expect(acceptInvite).toHaveBeenCalledWith(TOKEN, "jwt-token"),
    );
    expect(setActiveOrgUuid).toHaveBeenCalledWith(
      "11111111-2222-3333-4444-555555555555",
    );
    expect(clearOrgsCache).toHaveBeenCalled();
    expect(notifyOrganizationsChanged).toHaveBeenCalled();
    expect(mockReplace).toHaveBeenCalledWith(
      "/11111111-2222-3333-4444-555555555555/agents",
    );
  });

  it("shows why joining failed and leaves the button usable", async () => {
    signedIn();
    fetchInvitePreview.mockResolvedValue({ organization_name: "Acme" });
    acceptInvite.mockRejectedValue(
      new Error('Request failed: 400 - {"detail":"You are already a member"}'),
    );
    const user = setupUser();
    render(<InvitePage />);

    await user.click(await screen.findByRole("button", { name: "Join Acme" }));

    expect(
      await screen.findByText("You are already a member"),
    ).toBeInTheDocument();
    expect(mockReplace).not.toHaveBeenCalled();
    expect(screen.getByRole("button", { name: "Join Acme" })).toBeEnabled();
  });

  // A link that could not be checked must not be reported as dead. Telling
  // someone their good link is gone sends them to ask for a new one, and
  // making a new one turns off the link everybody else is still holding.
  it("says the link could not be checked when the workspace cannot be reached", async () => {
    signedOut();
    fetchInvitePreview.mockRejectedValue(new Error("Network down"));

    render(<InvitePage />);

    expect(
      await screen.findByText("This invite link could not be checked"),
    ).toBeInTheDocument();
    expect(screen.queryByText("This invite link no longer works")).toBeNull();
  });

  it("reads the link again when the reader tries again", async () => {
    signedOut();
    fetchInvitePreview
      .mockRejectedValueOnce(new Error("Network down"))
      .mockResolvedValueOnce({ organization_name: "Acme" });
    const user = setupUser();

    render(<InvitePage />);
    await screen.findByText("This invite link could not be checked");

    await user.click(screen.getByRole("button", { name: "Try again" }));

    expect(
      await screen.findByText("You have been invited to join Acme"),
    ).toBeInTheDocument();
  });

  // Without this, a signed-in reader is shown the sign-in buttons for a moment
  // before the Join button replaces them.
  it("shows nothing to act on until it knows whether the reader is signed in", async () => {
    mockAuth.mockReturnValue({
      isAuthenticated: false,
      isLoading: true,
      accessToken: null,
    });
    fetchInvitePreview.mockResolvedValue({ organization_name: "Acme" });

    render(<InvitePage />);

    await waitFor(() => expect(fetchInvitePreview).toHaveBeenCalled());
    expect(screen.queryByRole("link", { name: "Sign in" })).toBeNull();
    expect(screen.queryByRole("button", { name: /Join/ })).toBeNull();
  });
});
