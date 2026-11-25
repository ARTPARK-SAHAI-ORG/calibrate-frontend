import { render, screen, setupUser, waitFor } from "@/test-utils";
import { AgentChatLinkControl } from "../AgentChatLinkControl";
import { apiGet } from "@/lib/api";

jest.mock("../../../hooks", () => ({ useAccessToken: () => "tok" }));
jest.mock("../../../lib/api", () => ({ apiGet: jest.fn() }));
jest.mock("../../../lib/reportError", () => ({ reportError: jest.fn() }));

const mockGet = apiGet as jest.Mock;
const OLD_ENV = process.env.NEXT_PUBLIC_BACKEND_URL;

const link = (over: Record<string, unknown> = {}) => ({
  is_public: false,
  share_token: null,
  connection_verified: true,
  ...over,
});

beforeEach(() => {
  process.env.NEXT_PUBLIC_BACKEND_URL = "https://api.example.com";
});
afterEach(() => {
  process.env.NEXT_PUBLIC_BACKEND_URL = OLD_ENV;
  // @ts-expect-error test-only global
  delete global.fetch;
  jest.clearAllMocks();
});

it("previews a public chat page in a new tab", async () => {
  mockGet.mockResolvedValue(link({ is_public: true, share_token: "abc" }));
  render(<AgentChatLinkControl agentUuid="a1" connectionUnverified={false} />);
  const preview = await screen.findByRole("link", { name: "Preview" });
  expect(preview).toHaveAttribute("href", "/public/chat/abc");
  expect(preview).toHaveAttribute("target", "_blank");
  expect(screen.getByRole("button", { name: "Make it private" })).toBeEnabled();
  expect(mockGet).toHaveBeenCalledWith("/agents/a1/chat-link", "tok");
});

it("previews a private chat too, since members are let in", async () => {
  mockGet.mockResolvedValue(link({ share_token: "abc" }));
  render(<AgentChatLinkControl agentUuid="a1" connectionUnverified={false} />);
  expect(await screen.findByRole("link", { name: "Preview" })).toHaveAttribute(
    "href",
    "/public/chat/abc",
  );
  expect(screen.getByRole("button", { name: /Share/ })).toBeEnabled();
});

it("greys out Preview when there is no link yet, then opens it once public", async () => {
  const user = setupUser();
  mockGet.mockResolvedValue(link());
  render(<AgentChatLinkControl agentUuid="a1" connectionUnverified={false} />);
  const preview = await screen.findByRole("button", { name: "Preview" });
  expect(preview).toBeDisabled();
  await user.hover(preview.parentElement!);
  expect(
    await screen.findByText("Make it public to preview"),
  ).toBeInTheDocument();

  global.fetch = jest.fn().mockResolvedValue({
    ok: true,
    json: async () => ({ is_public: true, share_token: "new" }),
  });
  await user.click(screen.getByRole("button", { name: /Share/ }));
  // No link yet, so the window says what the link does before making it.
  expect(global.fetch).not.toHaveBeenCalled();
  expect(
    screen.getByText(/anyone can open to chat with this agent/),
  ).toBeInTheDocument();
  await user.click(screen.getByRole("button", { name: "Create link" }));
  expect(await screen.findByRole("link", { name: "Preview" })).toHaveAttribute(
    "href",
    "/public/chat/new",
  );

  // Making it private again keeps the preview working.
  global.fetch = jest.fn().mockResolvedValue({
    ok: true,
    json: async () => ({ is_public: false, share_token: null }),
  });
  await user.click(screen.getByRole("button", { name: "Make it private" }));
  await screen.findByRole("button", { name: /Share/ });
  expect(screen.getByRole("link", { name: "Preview" })).toHaveAttribute(
    "href",
    "/public/chat/new",
  );
});

it("greys out Share and Preview until the connection is verified", async () => {
  const user = setupUser();
  mockGet.mockResolvedValue(
    link({ connection_verified: false, share_token: "abc" }),
  );
  render(<AgentChatLinkControl agentUuid="a1" connectionUnverified />);
  expect(await screen.findByRole("button", { name: /Share/ })).toBeDisabled();
  const preview = screen.getByRole("button", { name: "Preview" });
  expect(preview).toBeDisabled();
  await user.hover(preview.parentElement!);
  expect(
    await screen.findByText("Verify your agent connection first"),
  ).toBeInTheDocument();
});

it("can still be made private when the connection stopped being checked", async () => {
  mockGet.mockResolvedValue(
    link({ connection_verified: false, is_public: true, share_token: "abc" }),
  );
  render(<AgentChatLinkControl agentUuid="a1" connectionUnverified />);
  expect(
    await screen.findByRole("button", { name: "Make it private" }),
  ).toBeEnabled();
});

it("reads the link again once the connection passes", async () => {
  mockGet.mockResolvedValue(link({ connection_verified: false }));
  const { rerender } = render(
    <AgentChatLinkControl agentUuid="a1" connectionUnverified />,
  );
  expect(await screen.findByRole("button", { name: /Share/ })).toBeDisabled();
  mockGet.mockResolvedValue(link());
  rerender(
    <AgentChatLinkControl agentUuid="a1" connectionUnverified={false} />,
  );
  await waitFor(() =>
    expect(screen.getByRole("button", { name: /Share/ })).toBeEnabled(),
  );
});

it("reads the link again after a save, which is when the Connection tab's check is stored", async () => {
  // The screen already says verified, but the link was read before the save.
  mockGet.mockResolvedValue(link({ connection_verified: false }));
  const { rerender } = render(
    <AgentChatLinkControl
      agentUuid="a1"
      connectionUnverified={false}
      saveCount={0}
    />,
  );
  expect(await screen.findByRole("button", { name: /Share/ })).toBeDisabled();
  mockGet.mockResolvedValue(link());
  rerender(
    <AgentChatLinkControl
      agentUuid="a1"
      connectionUnverified={false}
      saveCount={1}
    />,
  );
  await waitFor(() =>
    expect(screen.getByRole("button", { name: /Share/ })).toBeEnabled(),
  );
});

it("draws nothing when the link cannot be read", async () => {
  mockGet.mockRejectedValue(new Error("boom"));
  render(<AgentChatLinkControl agentUuid="a1" connectionUnverified={false} />);
  await new Promise((r) => setTimeout(r, 0));
  expect(screen.queryByRole("button")).toBeNull();
});
