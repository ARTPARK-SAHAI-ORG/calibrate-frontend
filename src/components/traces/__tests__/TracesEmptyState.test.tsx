import { render, screen, setupUser } from "@/test-utils";
import { TracesEmptyState } from "../TracesEmptyState";

jest.mock("../../../lib/api", () => ({
  __esModule: true,
  getBackendUrl: jest.fn(() => "https://api.example.com"),
}));

const createApiKey = jest.fn();

jest.mock("../../../hooks", () => ({
  __esModule: true,
  useAccessToken: () => "tok",
  useActiveOrgUuid: () => ["org-1", jest.fn()],
  useWorkspaceApiKeys: () => ({ createApiKey }),
}));

beforeEach(() => {
  createApiKey.mockReset();
});

/** The snippet is split across coloured spans, so match on the whole block. */
function snippetText(): string {
  return document.querySelector("pre")?.textContent ?? "";
}

it("walks through the three setup steps, ending on waiting for a trace", () => {
  render(<TracesEmptyState agentUuid="ag-1" />);
  expect(screen.getByText("Create an API key")).toBeInTheDocument();
  expect(screen.getByText("Send one request per turn")).toBeInTheDocument();
  expect(screen.getByText("Wait for the first trace")).toBeInTheDocument();
  expect(screen.getByText("Listening for traces")).toBeInTheDocument();
});

it("shows the request against the resolved backend, with this agent in it", () => {
  render(<TracesEmptyState agentUuid="ag-42" />);
  expect(snippetText()).toContain("https://api.example.com/traces");
  expect(snippetText()).toContain('"agent_id": "ag-42"');
});

it("switches the snippet between languages, keeping the agent in each", async () => {
  const user = setupUser();
  render(<TracesEmptyState agentUuid="ag-42" />);
  expect(snippetText()).toContain("curl -X POST");

  await user.click(screen.getByRole("tab", { name: "Python" }));
  expect(snippetText()).toContain("import requests");
  expect(snippetText()).toContain("ag-42");

  await user.click(screen.getByRole("tab", { name: "JavaScript" }));
  expect(snippetText()).toContain("await fetch");
  expect(snippetText()).toContain("ag-42");

  await user.click(screen.getByRole("tab", { name: "Go" }));
  expect(snippetText()).toContain("http.NewRequest");
  expect(snippetText()).toContain("ag-42");
});

it("explains every part of the request beside it", () => {
  render(<TracesEmptyState agentUuid="ag-1" />);
  expect(screen.getByText("What each part means")).toBeInTheDocument();
  for (const name of [
    "The address",
    "X-API-Key",
    "agent_id",
    "message_id",
    "conversation_id",
    "input",
    "output",
  ]) {
    expect(screen.getByText(name)).toBeInTheDocument();
  }
});

it("creates a key in step one and fills it into the snippet", async () => {
  createApiKey.mockResolvedValue({
    uuid: "k1",
    name: "Traces",
    key: "sk_live_secret",
    masked_key: "sk_live_...",
    last_four: "cret",
  });
  const user = setupUser();
  render(<TracesEmptyState agentUuid="ag-1" />);

  expect(snippetText()).toContain("sk_...");

  await user.click(screen.getByRole("button", { name: "Create API key" }));
  await user.type(screen.getByPlaceholderText("e.g. GitHub Actions"), "Traces");
  await user.click(screen.getByRole("button", { name: "Create key" }));

  expect(await screen.findByText("API key created")).toBeInTheDocument();
  expect(createApiKey).toHaveBeenCalledWith("Traces");
  await user.click(screen.getByRole("button", { name: "Done" }));

  expect(snippetText()).toContain("sk_live_secret");
  expect(snippetText()).not.toContain("sk_...");
});

it("copies the snippet that is on screen, key and agent included", async () => {
  // user-event installs its own clipboard stub on setup, so spy after it.
  const user = setupUser();
  const writeText = jest
    .spyOn(navigator.clipboard, "writeText")
    .mockResolvedValue(undefined);

  render(<TracesEmptyState agentUuid="ag-42" />);
  await user.click(screen.getByRole("tab", { name: "Python" }));
  await user.click(screen.getByRole("button", { name: "Copy" }));

  const copied = writeText.mock.calls[0][0];
  expect(copied).toContain("import requests");
  expect(copied).toContain('"agent_id": "ag-42"');
  expect(screen.getByRole("button", { name: "Copied" })).toBeInTheDocument();
});

it("links to workspace settings for a key created earlier", () => {
  render(<TracesEmptyState agentUuid="ag-1" />);
  expect(
    screen.getByRole("link", { name: /workspace settings/i }),
  ).toHaveAttribute("href", "/workspace-settings");
});

it("falls back to a placeholder host when the backend URL is unset", () => {
  const api = jest.requireMock("../../../lib/api");
  api.getBackendUrl.mockImplementationOnce(() => {
    throw new Error("BACKEND_URL environment variable is not set");
  });
  render(<TracesEmptyState agentUuid="ag-1" />);
  expect(snippetText()).toContain("https://<backend>/traces");
});
