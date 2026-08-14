import { render, screen, setupUser } from "@/test-utils";
import { TracesEmptyState } from "../TracesEmptyState";

jest.mock("../../../lib/api", () => ({
  __esModule: true,
  getBackendUrl: jest.fn(() => "https://api.example.com"),
}));

const createApiKey = jest.fn();
const onCheckForTraces = jest.fn();

jest.mock("../../../hooks", () => ({
  __esModule: true,
  useAccessToken: () => "tok",
  useActiveOrgUuid: () => ["org-1", jest.fn()],
  useWorkspaceApiKeys: () => ({ createApiKey }),
}));

beforeEach(() => {
  createApiKey.mockReset();
  onCheckForTraces.mockReset();
});

function setup(agentUuid = "ag-1") {
  return render(
    <TracesEmptyState
      agentUuid={agentUuid}
      onCheckForTraces={onCheckForTraces}
    />,
  );
}

/** The snippet is split across coloured spans, so match on the whole block. */
function snippetText(): string {
  return document.querySelector("pre")?.textContent ?? "";
}

/** Step two is where the request lives; get there without creating a key. */
async function openStepTwo(user: ReturnType<typeof setupUser>) {
  await user.click(screen.getByRole("button", { name: "I already have a key" }));
}

it("shows only the first step until it is finished", async () => {
  const user = setupUser();
  setup();

  expect(screen.getByText(/1\. Create an API key/)).toBeInTheDocument();
  expect(screen.queryByText(/2\. Send one request/)).not.toBeInTheDocument();
  expect(
    screen.queryByText(/3\. Check that it arrived/),
  ).not.toBeInTheDocument();

  await openStepTwo(user);
  expect(screen.getByText(/2\. Send one request/)).toBeInTheDocument();
  expect(
    screen.queryByText(/3\. Check that it arrived/),
  ).not.toBeInTheDocument();

  await user.click(screen.getByRole("button", { name: "I have added this" }));
  expect(screen.getByText(/3\. Check that it arrived/)).toBeInTheDocument();
});

it("collapses a finished step, and opens it again when asked", async () => {
  const user = setupUser();
  setup();
  await openStepTwo(user);

  // Step one is now a heading only: its buttons are gone.
  expect(
    screen.queryByRole("button", { name: "Create API key" }),
  ).not.toBeInTheDocument();

  await user.click(screen.getByText(/1\. Create an API key/));
  expect(
    screen.getByRole("button", { name: "Create API key" }),
  ).toBeInTheDocument();
  // Opening step one closes step two, so only one is expanded at a time.
  expect(
    screen.queryByText("What goes in the request"),
  ).not.toBeInTheDocument();
});

it("shows the request against the resolved backend, with this agent in it", async () => {
  const user = setupUser();
  setup("ag-42");
  await openStepTwo(user);
  expect(snippetText()).toContain("https://api.example.com/traces");
  expect(snippetText()).toContain('"agent_id": "ag-42"');
});

it("switches the snippet between languages, keeping the agent in each", async () => {
  const user = setupUser();
  setup("ag-42");
  await openStepTwo(user);
  expect(snippetText()).toContain("curl -X POST");

  await user.click(screen.getByRole("button", { name: "Python" }));
  expect(snippetText()).toContain("import requests");
  expect(snippetText()).toContain("ag-42");

  await user.click(screen.getByRole("button", { name: "JavaScript" }));
  expect(snippetText()).toContain("await fetch");
  expect(snippetText()).toContain("ag-42");

  await user.click(screen.getByRole("button", { name: "Go" }));
  expect(snippetText()).toContain("http.NewRequest");
  expect(snippetText()).toContain("ag-42");
});

it("explains every part of the request beside it", async () => {
  const user = setupUser();
  setup();
  await openStepTwo(user);
  expect(screen.getByText("What goes in the request")).toBeInTheDocument();
  for (const name of [
    "POST /traces",
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
  setup();

  await user.click(screen.getByRole("button", { name: "Create API key" }));
  await user.type(screen.getByPlaceholderText("e.g. GitHub Actions"), "Traces");
  await user.click(screen.getByRole("button", { name: "Create key" }));

  expect(await screen.findByText("API key created")).toBeInTheDocument();
  expect(createApiKey).toHaveBeenCalledWith("Traces");
  await user.click(screen.getByRole("button", { name: "Done" }));

  // Closing the reveal finishes step one and opens step two with the key in it.
  expect(screen.getByText(/2\. Send one request/)).toBeInTheDocument();
  expect(snippetText()).toContain("sk_live_secret");
  expect(snippetText()).not.toContain("sk_...");
});

it("copies the snippet that is on screen, key and agent included", async () => {
  // user-event installs its own clipboard stub on setup, so spy after it.
  const user = setupUser();
  const writeText = jest
    .spyOn(navigator.clipboard, "writeText")
    .mockResolvedValue(undefined);

  setup("ag-42");
  await openStepTwo(user);
  await user.click(screen.getByRole("button", { name: "Python" }));
  await user.click(screen.getByRole("button", { name: "Copy" }));

  const copied = writeText.mock.calls[0][0];
  expect(copied).toContain("import requests");
  expect(copied).toContain('"agent_id": "ag-42"');
  expect(screen.getByRole("button", { name: "Copied" })).toBeInTheDocument();
});

it("looks for traces when asked, and says when none arrived", async () => {
  const user = setupUser();
  setup();
  await openStepTwo(user);
  await user.click(screen.getByRole("button", { name: "I have added this" }));

  expect(
    screen.getByText("No traces for this agent yet"),
  ).toBeInTheDocument();

  await user.click(screen.getByRole("button", { name: "Check for traces" }));

  expect(onCheckForTraces).toHaveBeenCalledTimes(1);
  expect(
    await screen.findByText("Still nothing for this agent"),
  ).toBeInTheDocument();
});

it("links to workspace settings for a key created earlier", () => {
  setup();
  expect(
    screen.getByRole("link", { name: /workspace settings/i }),
  ).toHaveAttribute("href", "/workspace-settings");
});

it("falls back to a placeholder host when the backend URL is unset", async () => {
  const api = jest.requireMock("../../../lib/api");
  api.getBackendUrl.mockImplementation(() => {
    throw new Error("BACKEND_URL environment variable is not set");
  });
  const user = setupUser();
  setup();
  await openStepTwo(user);
  expect(snippetText()).toContain("https://<backend>/traces");
  api.getBackendUrl.mockImplementation(() => "https://api.example.com");
});
