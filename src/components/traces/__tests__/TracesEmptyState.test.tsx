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

/**
 * Step two only opens once step one is finished, and the only way to finish
 * step one is to create a key, so every test that needs the request goes
 * through the real flow.
 */
async function openStepTwo(user: ReturnType<typeof setupUser>) {
  createApiKey.mockResolvedValue({
    uuid: "k1",
    name: "Traces",
    key: "sk_live_secret",
    masked_key: "sk_live_...",
    last_four: "cret",
  });
  await user.click(screen.getByRole("button", { name: "Create API key" }));
  await user.type(screen.getByPlaceholderText("e.g. GitHub Actions"), "Traces");
  await user.click(screen.getByRole("button", { name: "Create key" }));
  await screen.findByText("API key created");
  await user.click(screen.getByRole("button", { name: "Done" }));
}

it("lists all three steps, but only opens the one to do now", async () => {
  const user = setupUser();
  setup();

  // Every step is on screen from the start, so the whole path is visible.
  expect(screen.getByText("Create an API key")).toBeInTheDocument();
  expect(screen.getByText("Send your first trace")).toBeInTheDocument();
  expect(screen.getByText("Check that it arrived")).toBeInTheDocument();

  // Only step one is open: the later steps show nothing but their heading.
  expect(
    screen.getByRole("button", { name: "Create API key" }),
  ).toBeInTheDocument();
  expect(screen.queryByText("agent_id")).not.toBeInTheDocument();
  expect(
    screen.queryByRole("button", { name: "Check for traces" }),
  ).not.toBeInTheDocument();

  await openStepTwo(user);
  expect(
    screen.queryByRole("button", { name: "Check for traces" }),
  ).not.toBeInTheDocument();

  await user.click(screen.getByRole("button", { name: "I have added this" }));
  expect(
    screen.getByRole("button", { name: "Check for traces" }),
  ).toBeInTheDocument();
});

it("will not open a step you have not reached", async () => {
  const user = setupUser();
  setup();

  // Step three is greyed out until step two is done: clicking does nothing.
  await user.click(screen.getByText("Check that it arrived"));
  expect(
    screen.queryByRole("button", { name: "Check for traces" }),
  ).not.toBeInTheDocument();
});

it("reopens the key step showing the key, and offers another", async () => {
  const user = setupUser();
  setup();
  await openStepTwo(user);

  // Step one is shut now: what was inside it is gone.
  expect(
    screen.queryByRole("button", { name: "Create a new API key" }),
  ).not.toBeInTheDocument();

  await user.click(screen.getByText("Create an API key"));

  // The key made a moment ago is still on show, with a way to make another.
  expect(screen.getByText("sk_live_secret")).toBeInTheDocument();
  expect(
    screen.getByRole("button", { name: "Create a new API key" }),
  ).toBeInTheDocument();
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
  expect(snippetText()).toContain("requests.post(");
  expect(snippetText()).toContain("ag-42");

  await user.click(screen.getByRole("button", { name: "JavaScript" }));
  expect(snippetText()).toContain("await fetch");
  expect(snippetText()).toContain("ag-42");
});

it("shows both an agent reply and a tool call in the output", async () => {
  const user = setupUser();
  setup();
  await openStepTwo(user);

  // Someone whose agent calls tools has to see the shape, not guess it.
  for (const language of ["cURL", "Python", "JavaScript"]) {
    await user.click(screen.getByRole("button", { name: language }));
    expect(snippetText()).toContain("response");
    expect(snippetText()).toContain("tool_calls");
    expect(snippetText()).toContain("book_appointment");
  }
});

it("keeps the optional fields out of cURL and marks them in the rest", async () => {
  const user = setupUser();
  setup();
  await openStepTwo(user);

  // cURL's body is JSON, which cannot carry an "optional" comment, so it shows
  // the required fields only.
  expect(snippetText()).toContain("agent_id");
  expect(snippetText()).not.toContain("message_id");
  expect(snippetText()).not.toContain("metadata");

  for (const language of ["Python", "JavaScript"]) {
    await user.click(screen.getByRole("button", { name: language }));
    expect(snippetText()).toContain("Optional");
    expect(snippetText()).toContain("message_id");
    expect(snippetText()).toContain("conversation_id");
    expect(snippetText()).toContain("metadata");
  }
});

it("explains every part of the request beside it", async () => {
  const user = setupUser();
  setup();
  await openStepTwo(user);
  for (const name of [
    "agent_id",
    "message_id",
    "conversation_id",
    "input",
    "output",
  ]) {
    expect(screen.getByText(name)).toBeInTheDocument();
  }
  // The two ids a caller can leave out sit under their own heading, so it is
  // clear at a glance which fields are required.
  const optional = screen.getByText("Optional").parentElement;
  expect(optional).toHaveTextContent("message_id");
  expect(optional).toHaveTextContent("conversation_id");
  expect(optional).not.toHaveTextContent("agent_id");
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
  expect(screen.getByText("agent_id")).toBeInTheDocument();
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
  expect(copied).toContain("requests.post(");
  expect(copied).toContain('"agent_id": "ag-42"');
  // It says Copied and looks different, so the click clearly did something.
  const button = screen.getByRole("button", { name: "Copied" });
  expect(button.className).toContain("emerald");
});

it("looks for traces when asked, and says when none arrived", async () => {
  const user = setupUser();
  setup();
  await openStepTwo(user);
  await user.click(screen.getByRole("button", { name: "I have added this" }));

  await user.click(screen.getByRole("button", { name: "Check for traces" }));

  expect(onCheckForTraces).toHaveBeenCalledTimes(1);
  expect(
    await screen.findByText("Still nothing for this agent."),
  ).toBeInTheDocument();
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
