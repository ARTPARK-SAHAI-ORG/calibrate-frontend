import { render, screen, setupUser } from "@/test-utils";
jest.mock("sonner", () => ({
  toast: jest.fn(),
}));
import { toast } from "sonner";
import { TracesEmptyState } from "../TracesEmptyState";

jest.mock("../../../lib/api", () => ({
  __esModule: true,
  getBackendUrl: jest.fn(() => "https://api.example.com"),
}));

const createApiKey = jest.fn();
const onCheckForTraces = jest.fn();
const validateApiKeyForAgent = jest.fn();

jest.mock("../../../hooks", () => ({
  __esModule: true,
  useAccessToken: () => "tok",
  useActiveOrgUuid: () => ["org-1", jest.fn()],
  useWorkspaceApiKeys: () => ({ createApiKey }),
}));

jest.mock("../../../lib/tracesApi", () => ({
  __esModule: true,
  validateApiKeyForAgent: (...args: unknown[]) =>
    validateApiKeyForAgent(...args),
}));

beforeEach(() => {
  createApiKey.mockReset();
  onCheckForTraces.mockReset();
  validateApiKeyForAgent.mockReset();
  jest.mocked(toast).mockReset();
});

function setup(agentUuid = "ag-1", agentNature?: "conversation" | "general") {
  return render(
    <TracesEmptyState
      agentUuid={agentUuid}
      agentNature={agentNature}
      onCheckForTraces={onCheckForTraces}
    />,
  );
}

/** The snippet is split across coloured spans, so match on the whole block. */
function snippetText(): string {
  return document.querySelector("pre")?.textContent ?? "";
}

/**
 * Step two only opens once step one is finished. Creating a key is one way;
 * pasting an existing one is the other. Tests that need the request use this
 * create path unless they are specifically covering the paste path.
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
  expect(
    screen.getByRole("button", { name: "I have a key already" }),
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

it("opens the last step straight away, without doing the first two", async () => {
  const user = setupUser();
  setup();

  // Someone who already sends traces can come here just to look for them.
  await user.click(screen.getByText("Check that it arrived"));

  expect(
    screen.getByRole("button", { name: "Check for traces" }),
  ).toBeInTheDocument();
});

it("shows an API key callout beside the snippet when no key is filled in", async () => {
  const user = setupUser();
  setup();

  await user.click(screen.getByText("Send your first trace"));

  expect(snippetText()).toContain("YOUR_API_KEY");
  expect(screen.getByRole("link", { name: "API keys" })).toHaveAttribute(
    "href",
    "/workspace-settings?tab=api-keys",
  );
});

it("hides the API key callout once a key is filled in", async () => {
  const user = setupUser();
  setup();
  await openStepTwo(user);

  expect(
    screen.queryByRole("link", { name: "API keys" }),
  ).not.toBeInTheDocument();
});

it("does not tick the key step when no key was made", async () => {
  const user = setupUser();
  setup();

  // Walking past step one without making a key: the step keeps its number,
  // because the code in step two still has a fill-in in place of a key.
  await user.click(screen.getByText("Send your first trace"));
  // The code still carries a fill-in in place of a key.
  expect(snippetText()).toContain("YOUR_API_KEY");

  await user.click(screen.getByRole("button", { name: "I have added this" }));

  expect(screen.getByText("1")).toBeInTheDocument();
});

it("ticks the key step once a key is made", async () => {
  const user = setupUser();
  setup();
  await openStepTwo(user);

  expect(screen.queryByText("1")).not.toBeInTheDocument();
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

it("hides optional fields by default and can show them with a toggle", async () => {
  const user = setupUser();
  setup();
  await openStepTwo(user);

  // Required fields only by default in every language.
  expect(snippetText()).toContain("agent_id");
  expect(snippetText()).not.toContain("message_id");
  expect(snippetText()).not.toContain("metadata");

  for (const language of ["Python", "JavaScript", "cURL"]) {
    await user.click(screen.getByRole("button", { name: language }));
    expect(snippetText()).not.toContain("message_id");
    expect(snippetText()).not.toContain("conversation_id");
    expect(snippetText()).not.toContain("metadata");
  }

  await user.click(
    screen.getByRole("switch", { name: "Include optional fields" }),
  );

  for (const language of ["Python", "JavaScript"]) {
    await user.click(screen.getByRole("button", { name: language }));
    expect(snippetText()).toContain("Optional");
    expect(snippetText()).toContain("message_id");
    expect(snippetText()).toContain("conversation_id");
    expect(snippetText()).toContain("metadata");
  }

  // cURL's body is JSON, which cannot carry an "optional" comment.
  await user.click(screen.getByRole("button", { name: "cURL" }));
  expect(snippetText()).toContain("message_id");
  expect(snippetText()).not.toContain("Optional");
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
  expect(snippetText()).not.toContain("YOUR_API_KEY");
});

it("lets an existing key be pasted and checked, then fills the snippet", async () => {
  validateApiKeyForAgent.mockResolvedValue(true);
  const user = setupUser();
  setup("ag-1");

  await user.click(
    screen.getByRole("button", { name: "I have a key already" }),
  );
  expect(screen.getByRole("button", { name: "Check key" })).toBeDisabled();

  await user.type(screen.getByPlaceholderText("Paste your key"), "sk_existing");
  await user.click(screen.getByRole("button", { name: "Check key" }));

  expect(validateApiKeyForAgent).toHaveBeenCalledWith("sk_existing", "ag-1");
  // Same landing as creating a key: step two is open, the key is in the request.
  expect(await screen.findByText("agent_id")).toBeInTheDocument();
  expect(snippetText()).toContain("sk_existing");
  expect(snippetText()).not.toContain("YOUR_API_KEY");
  expect(screen.queryByText("Confirmed")).not.toBeInTheDocument();

  await user.click(screen.getByText("Create an API key"));
  expect(screen.getByText("sk_existing")).toBeInTheDocument();
  expect(
    screen.getByRole("button", { name: "Create a new API key" }),
  ).toBeInTheDocument();
});

it("stays on step one when the pasted key does not work", async () => {
  validateApiKeyForAgent.mockResolvedValue(false);
  const user = setupUser();
  setup();

  await user.click(
    screen.getByRole("button", { name: "I have a key already" }),
  );
  await user.type(screen.getByPlaceholderText("Paste your key"), "sk_bad");
  await user.click(screen.getByRole("button", { name: "Check key" }));

  expect(await screen.findByText("Invalid API key")).toBeInTheDocument();
  expect(screen.queryByText("agent_id")).not.toBeInTheDocument();
});

it("says when the key could not be checked, and cancel returns to the start", async () => {
  validateApiKeyForAgent.mockRejectedValue(new Error("network"));
  const user = setupUser();
  setup();

  await user.click(
    screen.getByRole("button", { name: "I have a key already" }),
  );
  await user.type(screen.getByPlaceholderText("Paste your key"), "sk_live");
  await user.click(screen.getByRole("button", { name: "Check key" }));

  expect(
    await screen.findByText("Could not check this key. Try again."),
  ).toBeInTheDocument();

  await user.click(screen.getByRole("button", { name: "Cancel" }));
  expect(
    screen.getByRole("button", { name: "I have a key already" }),
  ).toBeInTheDocument();
  expect(
    screen.queryByPlaceholderText("Paste your key"),
  ).not.toBeInTheDocument();
});

it("still opens the sending code when the pasted key does not work", async () => {
  validateApiKeyForAgent.mockResolvedValue(false);
  const user = setupUser();
  setup();

  await user.click(
    screen.getByRole("button", { name: "I have a key already" }),
  );
  await user.type(screen.getByPlaceholderText("Paste your key"), "sk_bad");
  await user.click(screen.getByRole("button", { name: "Check key" }));
  await screen.findByText("Invalid API key");

  // The key check failing must not lock away the code that sends a trace: the
  // reader can put a key into it by hand.
  await user.click(screen.getByText("Send your first trace"));
  expect(screen.getByText("agent_id")).toBeInTheDocument();
  expect(snippetText()).toContain("YOUR_API_KEY");
});

it("stays where you are when the new key dialog is cancelled", async () => {
  const user = setupUser();
  setup();
  await openStepTwo(user);
  await user.click(screen.getByRole("button", { name: "I have added this" }));
  expect(
    screen.getByRole("button", { name: "Check for traces" }),
  ).toBeInTheDocument();

  await user.click(screen.getByText("Create an API key"));
  await user.click(
    screen.getByRole("button", { name: "Create a new API key" }),
  );
  await user.click(screen.getByRole("button", { name: "Cancel" }));

  // No key was made this time, so the reader is left on the step they opened
  // the dialog from, not sent back to the code.
  expect(screen.getByText("sk_live_secret")).toBeInTheDocument();
  expect(screen.queryByText("agent_id")).not.toBeInTheDocument();
});

/** The text of every part the snippet greys out as an explanation. */
function commentedText(): string {
  return Array.from(document.querySelectorAll("pre span.italic"))
    .map((el) => el.textContent ?? "")
    .join("\n");
}

it("keeps the address in the request as code, not as a greyed out note", async () => {
  const user = setupUser();
  setup();
  await openStepTwo(user);

  expect(snippetText()).toContain("https://api.example.com/traces");
  expect(commentedText()).not.toContain("api.example.com");

  for (const language of ["Python", "JavaScript"]) {
    await user.click(screen.getByRole("button", { name: language }));
    expect(commentedText()).not.toContain("api.example.com");
  }

  await user.click(
    screen.getByRole("switch", { name: "Include optional fields" }),
  );
  for (const language of ["Python", "JavaScript"]) {
    await user.click(screen.getByRole("button", { name: language }));
    // The one real note is still greyed out, so the change did not turn the
    // marking off altogether.
    expect(commentedText()).toContain("Optional");
  }
});

it("uses fill-in ids in the two optional ids, not ones to ship as they are", async () => {
  const user = setupUser();
  setup();
  await openStepTwo(user);

  await user.click(
    screen.getByRole("switch", { name: "Include optional fields" }),
  );

  for (const language of ["Python", "JavaScript"]) {
    await user.click(screen.getByRole("button", { name: language }));
    expect(snippetText()).toContain("your-message-id");
    expect(snippetText()).toContain("your-conversation-id");
    expect(snippetText()).not.toContain("msg-001");
    expect(snippetText()).not.toContain("conv-001");
  }

  // cURL cannot carry a note, so it leaves both ids out rather than show one
  // that looks ready to send — until optional fields are turned on.
  await user.click(screen.getByRole("button", { name: "cURL" }));
  expect(snippetText()).toContain("your-message-id");
  expect(snippetText()).toContain("your-conversation-id");
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

it("looks for traces when asked, and briefly says when none arrived", async () => {
  onCheckForTraces.mockResolvedValue(true);
  const user = setupUser();
  setup();
  await openStepTwo(user);
  await user.click(screen.getByRole("button", { name: "I have added this" }));

  await user.click(screen.getByRole("button", { name: "Check for traces" }));

  expect(onCheckForTraces).toHaveBeenCalledTimes(1);
  expect(toast).toHaveBeenCalledWith(
    "No traces yet. Send one from your app and check again.",
  );
  expect(
    screen.queryByText(
      "No traces yet. Send one from your app and check again.",
    ),
  ).not.toBeInTheDocument();
});

it("does not say anything when a check finds traces", async () => {
  onCheckForTraces.mockResolvedValue(false);
  const user = setupUser();
  setup();
  await openStepTwo(user);
  await user.click(screen.getByRole("button", { name: "I have added this" }));

  await user.click(screen.getByRole("button", { name: "Check for traces" }));

  expect(onCheckForTraces).toHaveBeenCalledTimes(1);
  expect(toast).not.toHaveBeenCalled();
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

it("sends one piece of text as the input for a general agent", async () => {
  const user = setupUser();
  setup("ag-1", "general");
  await openStepTwo(user);

  expect(snippetText()).toContain('"input": "When is the next vaccination?"');
  expect(snippetText()).not.toContain('"role"');
  expect(
    screen.getByText(
      "The input given to the agent, as a single piece of text.",
    ),
  ).toBeInTheDocument();
});
