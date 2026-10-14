import { fireEvent, render, screen, setupUser, waitFor } from "@/test-utils";
import { AddTestDialog, TestConfig } from "../AddTestDialog";

class MockResizeObserver {
  observe() {}
  unobserve() {}
  disconnect() {}
}

beforeAll(() => {
  (
    global as unknown as { ResizeObserver: typeof MockResizeObserver }
  ).ResizeObserver = MockResizeObserver;
  Element.prototype.scrollIntoView = jest.fn();
});

jest.mock("../ToolPicker", () => ({
  __esModule: true,
  ToolPicker: () => <div data-testid="tool-picker" />,
}));

jest.mock("../../lib/reportError", () => ({
  __esModule: true,
  reportError: jest.fn(),
}));

// Saving needs one attached evaluator; the dialog attaches this one itself.
const CORRECTNESS_EVALUATOR = {
  uuid: "eval-correctness",
  name: "Correctness",
  description: "Checks correctness",
  slug: "default-llm-next-reply",
  is_default: true,
  evaluator_type: "llm",
  live_version: { variables: [] },
};

const originalBackendUrl = process.env.NEXT_PUBLIC_BACKEND_URL;

beforeEach(() => {
  process.env.NEXT_PUBLIC_BACKEND_URL = "http://127.0.0.1:8000";
  localStorage.setItem("access_token", "test-token");
  global.fetch = jest.fn((url: string) => {
    if (url.includes("/evaluators")) {
      return Promise.resolve({
        ok: true,
        status: 200,
        json: async () => ({ items: [CORRECTNESS_EVALUATOR], total: 1 }),
      });
    }
    if (url.includes("/tools")) {
      return Promise.resolve({ ok: true, status: 200, json: async () => [] });
    }
    return Promise.resolve({ ok: false, status: 404, json: async () => ({}) });
  }) as unknown as typeof fetch;
});

afterEach(() => {
  process.env.NEXT_PUBLIC_BACKEND_URL = originalBackendUrl;
  localStorage.clear();
  jest.restoreAllMocks();
});

const HISTORY: TestConfig = {
  history: [
    {
      role: "user",
      content: "Namaste",
      label: "Mother",
      versions: { English: "Hello" },
    },
    {
      role: "assistant",
      content: "Kaise ho?",
      label: "Nurse",
      versions: { English: "How are you?", Hinglish: "Kaise ho" },
    },
    { role: "user", content: "Theek hoon" },
    { role: "assistant", content: "Accha" },
  ],
  evaluation: { type: "response" },
};

function renderDialog(
  onSubmit = jest.fn(),
  overrides: Partial<Parameters<typeof AddTestDialog>[0]> = {},
) {
  render(
    <AddTestDialog
      isOpen
      onClose={jest.fn()}
      isEditing
      isLoading={false}
      isCreating={false}
      createError={null}
      testName="Item"
      setTestName={jest.fn()}
      validationAttempted={false}
      onSubmit={onSubmit}
      mode="labelItem"
      requireAssistantLastMessage
      itemDescription=""
      setItemDescription={jest.fn()}
      initialConfig={HISTORY}
      initialEvaluators={[
        {
          evaluator_uuid: CORRECTNESS_EVALUATOR.uuid,
          name: CORRECTNESS_EVALUATOR.name,
          slug: CORRECTNESS_EVALUATOR.slug,
          variables: [],
        },
      ]}
      {...overrides}
    />,
  );
  return onSubmit;
}

const agentHeadings = () =>
  screen.getAllByLabelText(
    "Heading for this agent message",
  ) as HTMLInputElement[];
const userHeadings = () =>
  screen.getAllByLabelText(
    "Heading for this user message",
  ) as HTMLInputElement[];

async function waitForHistory() {
  await waitFor(() =>
    expect(screen.getByDisplayValue("Kaise ho?")).toBeInTheDocument(),
  );
}

describe("AddTestDialog labelling item headings and versions", () => {
  it("shows labels and versions from the history and writes them back on save", async () => {
    const user = setupUser();
    const onSubmit = renderDialog();
    await waitForHistory();

    expect(userHeadings().map((i) => i.value)).toEqual(["Mother", ""]);
    expect(agentHeadings().map((i) => i.value)).toEqual(["Nurse", ""]);
    expect(
      screen
        .getAllByLabelText("Version name")
        .map((i) => (i as HTMLInputElement).value),
    ).toEqual(["English", "English", "Hinglish"]);
    expect(
      screen
        .getAllByLabelText("Version text")
        .map((t) => (t as HTMLTextAreaElement).value),
    ).toEqual(["Hello", "How are you?", "Kaise ho"]);

    await user.click(screen.getByRole("button", { name: "Save" }));
    expect(onSubmit).toHaveBeenCalledTimes(1);
    const [config] = onSubmit.mock.calls[0];
    expect(config.history[0]).toEqual({
      role: "user",
      content: "Namaste",
      label: "Mother",
      versions: { English: "Hello" },
    });
    expect(config.history[1]).toEqual({
      role: "assistant",
      content: "Kaise ho?",
      label: "Nurse",
      versions: { English: "How are you?", Hinglish: "Kaise ho" },
    });
    expect(config.history[2]).toEqual({ role: "user", content: "Theek hoon" });
    expect(config.history[3]).toEqual({
      role: "assistant",
      content: "Accha",
    });
  });

  it("drops label and versions from the saved turn once they are cleared", async () => {
    const user = setupUser();
    const onSubmit = renderDialog();
    await waitForHistory();

    await user.clear(userHeadings()[0]);
    await user.click(screen.getByRole("button", { name: "Confirm heading" }));
    await user.click(screen.getAllByLabelText("Remove version")[0]);
    await user.click(screen.getByRole("button", { name: "Remove" }));
    await user.click(screen.getByRole("button", { name: "Save" }));

    const [config] = onSubmit.mock.calls[0];
    expect(config.history[0]).toEqual({ role: "user", content: "Namaste" });
  });

  it("asks to use a changed heading on every agent message, and 'Update all' does so", async () => {
    const user = setupUser();
    const onSubmit = renderDialog();
    await waitForHistory();

    const [first, second] = agentHeadings();
    await user.clear(first);
    await user.type(first, "Doctor");
    expect(
      screen.queryByText('Use "Doctor" on all agent messages?'),
    ).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Confirm heading" }));
    expect(
      screen.getByText('Use "Doctor" on all agent messages?'),
    ).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Update all" }));
    expect(
      screen.queryByText('Use "Doctor" on all agent messages?'),
    ).not.toBeInTheDocument();
    expect(second.value).toBe("Doctor");
    expect(userHeadings().map((i) => i.value)).toEqual(["Mother", ""]);

    await user.click(screen.getByRole("button", { name: "Save" }));
    const [config] = onSubmit.mock.calls[0];
    expect(config.history[3]).toMatchObject({ label: "Doctor" });
  });

  it("Cancel puts the old heading back on the message that was changed", async () => {
    const user = setupUser();
    renderDialog();
    await waitForHistory();

    const [first, second] = userHeadings();
    await user.clear(second);
    await user.type(second, "Father");
    await user.click(screen.getByRole("button", { name: "Confirm heading" }));
    expect(
      screen.getByText('Use "Father" on all user messages?'),
    ).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Cancel" }));
    expect(
      screen.queryByText('Use "Father" on all user messages?'),
    ).not.toBeInTheDocument();
    expect(first.value).toBe("Mother");
    expect(second.value).toBe("");
  });

  it("does not ask when the heading was not changed or every other message already matches", async () => {
    const user = setupUser();
    renderDialog();
    await waitForHistory();

    await user.click(agentHeadings()[0]);
    await user.tab();
    expect(screen.queryByText(/on all (agent|user) messages\?/)).not.toBeInTheDocument();

    await user.clear(agentHeadings()[1]);
    await user.type(agentHeadings()[1], "Nurse");
    await user.click(screen.getByRole("button", { name: "Confirm heading" }));
    expect(screen.queryByText(/on all (agent|user) messages\?/)).not.toBeInTheDocument();
  });

  it("renames a version and edits its text, keeping the order", async () => {
    const user = setupUser();
    const onSubmit = renderDialog();
    await waitForHistory();

    const names = screen.getAllByLabelText("Version name");
    await user.clear(names[1]);
    await user.type(names[1], "Translation");
    await user.click(screen.getByRole("button", { name: "Confirm version name" }));
    const texts = screen.getAllByLabelText("Version text");
    await user.clear(texts[1]);
    await user.type(texts[1], "How are you doing?");

    await user.click(screen.getByRole("button", { name: "Save" }));
    const [config] = onSubmit.mock.calls[0];
    expect(Object.entries(config.history[1].versions)).toEqual([
      ["Translation", "How are you doing?"],
      ["Hinglish", "Kaise ho"],
    ]);
  });

  it("asks before removing a version; Cancel keeps it and Remove deletes it", async () => {
    const user = setupUser();
    const onSubmit = renderDialog();
    await waitForHistory();

    await user.click(screen.getAllByLabelText("Remove version")[2]);
    expect(
      screen.getByText('Remove "Hinglish" from all agent messages?'),
    ).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Cancel" }));
    expect(
      screen.queryByText('Remove "Hinglish" from all agent messages?'),
    ).not.toBeInTheDocument();
    expect(screen.getAllByLabelText("Version text")).toHaveLength(3);

    await user.click(screen.getAllByLabelText("Remove version")[2]);
    await user.click(screen.getByRole("button", { name: "Remove" }));
    expect(screen.getAllByLabelText("Version text")).toHaveLength(2);

    await user.click(screen.getByRole("button", { name: "Save" }));
    const [config] = onSubmit.mock.calls[0];
    expect(config.history[1].versions).toEqual({ English: "How are you?" });
  });

  it("closes the remove prompt when the backdrop is clicked", async () => {
    const user = setupUser();
    renderDialog();
    await waitForHistory();
    await user.click(screen.getAllByLabelText("Remove version")[0]);
    await user.click(
      document.querySelector(".z-\\[60\\] .bg-black\\/30") as HTMLElement,
    );
    expect(
      screen.queryByText(/from all agent messages\?/),
    ).not.toBeInTheDocument();
  });

  it("renders none of the heading or version inputs for a plain test", async () => {
    renderDialog(jest.fn(), {
      mode: undefined,
      requireAssistantLastMessage: undefined,
      initialTab: "next-reply",
    });
    await waitForHistory();
    expect(screen.getAllByText("Agent").length).toBeGreaterThan(0);
    expect(
      screen.queryByLabelText("Heading for this agent message"),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByLabelText("Heading for this user message"),
    ).not.toBeInTheDocument();
    expect(screen.queryByLabelText("Version text")).not.toBeInTheDocument();
    expect(screen.queryByLabelText("Remove version")).not.toBeInTheDocument();
  });

  it("lets a version take a name that exists on every object, such as toString", async () => {
    const user = setupUser();
    const onSubmit = renderDialog();
    await waitForHistory();

    const hinglish = screen.getAllByLabelText(
      "Version name",
    )[2] as HTMLInputElement;
    await user.clear(hinglish);
    await user.type(hinglish, "toString");
    await user.click(screen.getByRole("button", { name: "Confirm version name" }));
    expect(hinglish.value).toBe("toString");

    await user.click(screen.getByRole("button", { name: "Save" }));
    const [config] = onSubmit.mock.calls[0];
    expect(Object.keys(config.history[1].versions)).toEqual([
      "English",
      "toString",
    ]);
  });

  it("trims a heading when saving", async () => {
    const user = setupUser();
    const onSubmit = renderDialog();
    await waitForHistory();

    await user.clear(agentHeadings()[0]);
    await user.type(agentHeadings()[0], "  Nurse draft  ");
    await user.click(screen.getByRole("button", { name: "Confirm heading" }));
    await user.click(screen.getByRole("button", { name: "Update all" }));

    await user.click(screen.getByRole("button", { name: "Save" }));
    const [config] = onSubmit.mock.calls[0];
    expect(config.history[1]).toMatchObject({ label: "Nurse draft" });
    expect(config.history[3]).toMatchObject({ label: "Nurse draft" });
  });

  const SHARED: TestConfig = {
    history: [
      { role: "user", content: "Namaste" },
      {
        role: "assistant",
        content: "Kaise ho?",
        versions: { English: "How are you?", Hinglish: "Kaise ho" },
      },
      { role: "user", content: "Theek hoon" },
      {
        role: "assistant",
        content: "Accha",
        versions: { English: "Good", Hinglish: "Accha" },
      },
    ],
    evaluation: { type: "response" },
  };

  const versionNames = () =>
    screen
      .getAllByLabelText("Version name")
      .map((i) => (i as HTMLInputElement).value);

  it("renames a version on every agent message or puts the old name back", async () => {
    const user = setupUser();
    const onSubmit = renderDialog(jest.fn(), { initialConfig: SHARED });
    await waitForHistory();

    const first = screen.getAllByLabelText("Version name")[0];
    await user.clear(first);
    await user.type(first, "Translation");
    expect(versionNames()[0]).toBe("Translation");
    expect(screen.queryByText(/on all agent messages\?/)).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Confirm version name" }));
    expect(
      screen.getByText('Rename "English" to "Translation" on all agent messages?'),
    ).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Cancel" }));
    expect(versionNames()).toEqual(["English", "Hinglish", "English", "Hinglish"]);

    await user.clear(first);
    await user.type(first, "Translation");
    await user.click(screen.getByRole("button", { name: "Confirm version name" }));
    await user.click(screen.getByRole("button", { name: "Rename all" }));
    expect(versionNames()).toEqual([
      "Translation",
      "Hinglish",
      "Translation",
      "Hinglish",
    ]);

    await user.click(screen.getByRole("button", { name: "Save" }));
    const [config] = onSubmit.mock.calls[0];
    expect(Object.keys(config.history[1].versions)).toEqual(["Translation", "Hinglish"]);
    expect(Object.keys(config.history[3].versions)).toEqual(["Translation", "Hinglish"]);
  });

  it("removes a version from every agent message", async () => {
    const user = setupUser();
    const onSubmit = renderDialog(jest.fn(), { initialConfig: SHARED });
    await waitForHistory();

    await user.click(screen.getAllByLabelText("Remove version")[1]);
    await user.click(screen.getByRole("button", { name: "Remove" }));
    expect(versionNames()).toEqual(["English", "English"]);

    await user.click(screen.getByRole("button", { name: "Save" }));
    const [config] = onSubmit.mock.calls[0];
    expect(config.history[1].versions).toEqual({ English: "How are you?" });
    expect(config.history[3].versions).toEqual({ English: "Good" });
  });

  it("puts a version name back when it is left blank", async () => {
    const user = setupUser();
    renderDialog(jest.fn(), { initialConfig: SHARED });
    await waitForHistory();

    const first = screen.getAllByLabelText("Version name")[0];
    await user.clear(first);
    await user.click(screen.getByRole("button", { name: "Confirm version name" }));
    expect(versionNames()[0]).toBe("English");
    expect(
      screen.queryByText('Rename "English" to "Translation" on all agent messages?'),
    ).not.toBeInTheDocument();
  });

  it("gives a new message the role's heading and version names, and needs every version filled", async () => {
    const user = setupUser();
    const onSubmit = renderDialog(jest.fn(), { initialConfig: SHARED });
    await waitForHistory();

    await user.click(screen.getAllByLabelText("Add message")[0]);
    const menu = screen.getByRole("button", { name: /Agent message/ });
    expect(menu.closest(".fixed")).not.toBeNull();
    expect(document.body.contains(menu)).toBe(true);
    await user.click(menu);

    expect(versionNames()).toEqual([
      "English",
      "Hinglish",
      "English",
      "Hinglish",
      "English",
      "Hinglish",
    ]);
    const texts = screen.getAllByLabelText("Version text") as HTMLTextAreaElement[];
    expect(texts[4].value).toBe("");
    expect(texts[4].placeholder).toBe("Enter this version");

    const bubbles = screen.getAllByPlaceholderText("Enter agent message");
    await user.type(bubbles[bubbles.length - 1], "Theek hai");
    await user.click(screen.getByRole("button", { name: "Save" }));
    expect(onSubmit).not.toHaveBeenCalled();
    expect(screen.getAllByText("Version cannot be empty")).toHaveLength(2);

    await user.type(texts[4], "Fine");
    await user.type(texts[5], "Theek hai");
    await user.click(screen.getByRole("button", { name: "Save" }));
    expect(onSubmit).toHaveBeenCalledTimes(1);
    const [config] = onSubmit.mock.calls[0];
    expect(config.history[4]).toEqual({
      role: "assistant",
      content: "Theek hai",
      versions: { English: "Fine", Hinglish: "Theek hai" },
    });
  });

  it("asks before closing when a message was added, even an empty one", async () => {
    const user = setupUser();
    const onClose = jest.fn();
    renderDialog(jest.fn(), { onClose });
    await waitForHistory();

    await user.click(screen.getAllByLabelText("Add message")[0]);
    await user.click(screen.getByRole("button", { name: /User message/ }));
    await user.click(screen.getByRole("button", { name: "Close" }));
    expect(screen.getByText("Discard changes?")).toBeInTheDocument();
    expect(onClose).not.toHaveBeenCalled();
  });

  it("closes the add-message menu when the backdrop is clicked", async () => {
    const user = setupUser();
    renderDialog();
    await waitForHistory();

    await user.click(screen.getAllByLabelText("Add message")[0]);
    expect(screen.getByRole("button", { name: /User message/ })).toBeInTheDocument();
    await user.click(
      document.querySelector("body > div .fixed.inset-0.z-\\[150\\], body > .fixed.inset-0.z-\\[150\\]") as HTMLElement,
    );
    expect(screen.queryByRole("button", { name: /User message/ })).not.toBeInTheDocument();
  });

  it("shows the default heading as editable text on focus and keeps nothing when it is left as is", async () => {
    const user = setupUser();
    const onSubmit = renderDialog();
    await waitForHistory();

    const second = agentHeadings()[1];
    expect(second.value).toBe("");
    await user.click(second);
    expect(second.value).toBe("Agent");
    await user.tab();
    expect(second.value).toBe("");
    expect(screen.queryByText(/on all agent messages\?/)).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Save" }));
    const [config] = onSubmit.mock.calls[0];
    expect(config.history[3]).toEqual({ role: "assistant", content: "Accha" });
  });

  it("drops a typed version name on Escape or its cross", async () => {
    const user = setupUser();
    renderDialog();
    await waitForHistory();

    const first = screen.getAllByLabelText("Version name")[0];
    await user.type(first, "X");
    expect(versionNames()[0]).toBe("EnglishX");
    await user.click(screen.getByRole("button", { name: "Cancel version name" }));
    expect(versionNames()[0]).toBe("English");

    await user.type(first, "Y{Escape}");
    expect(versionNames()[0]).toBe("English");
  });

  it("drops a typed heading on its cross and applies it with Enter", async () => {
    const user = setupUser();
    renderDialog();
    await waitForHistory();

    const first = agentHeadings()[0];
    await user.type(first, "X");
    expect(first.value).toBe("NurseX");
    await user.click(screen.getByRole("button", { name: "Cancel heading" }));
    expect(first.value).toBe("Nurse");

    await user.clear(first);
    await user.type(first, "Nurse{Enter}");
    expect(screen.queryByText(/on all agent messages\?/)).not.toBeInTheDocument();
    expect(first.value).toBe("Nurse");
  });

  it("keeps a typed heading open while another heading is being edited", async () => {
    const user = setupUser();
    renderDialog();
    await waitForHistory();

    const [first, second] = agentHeadings();
    await user.clear(first);
    await user.type(first, "Doctor");
    await user.click(second);
    expect(first.value).toBe("Doctor");
    expect(screen.getAllByRole("button", { name: "Confirm heading" })).toHaveLength(1);
  });

  it("applies Enter only to the version name it was pressed in", async () => {
    const user = setupUser();
    const onSubmit = renderDialog();
    await waitForHistory();

    const names = screen.getAllByLabelText("Version name") as HTMLInputElement[];
    await user.clear(names[1]);
    await user.type(names[1], "Translation");
    await user.click(names[2]);
    await user.keyboard("{Enter}");
    expect(names[1].value).toBe("Translation");
    expect(screen.getAllByRole("button", { name: "Confirm version name" })).toHaveLength(1);

    await user.click(screen.getByRole("button", { name: "Cancel version name" }));
    await user.click(screen.getByRole("button", { name: "Save" }));
    const [config] = onSubmit.mock.calls[0];
    expect(Object.keys(config.history[1].versions)).toEqual(["English", "Hinglish"]);
  });

  it("says a version name is taken and will not apply it", async () => {
    const user = setupUser();
    renderDialog(jest.fn(), { initialConfig: SHARED });
    await waitForHistory();

    const first = screen.getAllByLabelText("Version name")[0];
    await user.clear(first);
    await user.type(first, "Hinglish");
    expect(screen.getByText("Another version already has this name")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Confirm version name" })).toBeDisabled();
    await user.keyboard("{Enter}");
    expect(screen.queryByText(/on all agent messages\?/)).not.toBeInTheDocument();
    expect(versionNames()).toEqual(["Hinglish", "Hinglish", "English", "Hinglish"]);
  });

  it("gives a new message the role's heading and every version name used on that role", async () => {
    const user = setupUser();
    const mixed: TestConfig = {
      history: [
        { role: "user", content: "Namaste" },
        { role: "assistant", content: "Kaise ho?", label: "Doctor" },
        { role: "user", content: "Theek hoon" },
        { role: "assistant", content: "Accha", versions: { Hindi: "अच्छा" } },
      ],
      evaluation: { type: "response" },
    };
    renderDialog(jest.fn(), { initialConfig: mixed });
    await waitForHistory();

    await user.click(screen.getAllByLabelText("Add message")[0]);
    await user.click(screen.getByRole("button", { name: /Agent message/ }));
    const headings = agentHeadings();
    expect(headings[headings.length - 1].value).toBe("Doctor");
    expect(versionNames()).toEqual(["Hindi", "Hindi"]);
  });

  it("ignores Enter while a word is still being typed with an input method", async () => {
    renderDialog();
    await waitForHistory();

    const first = agentHeadings()[0];
    fireEvent.focus(first);
    fireEvent.change(first, { target: { value: "डॉक्टर" } });
    fireEvent.keyDown(first, { key: "Enter", isComposing: true });
    expect(screen.getByRole("button", { name: "Confirm heading" })).toBeInTheDocument();
    fireEvent.keyDown(first, { key: "Enter" });
    expect(screen.queryByRole("button", { name: "Confirm heading" })).not.toBeInTheDocument();
  });

  it("does not block saving a plain test whose history carries an empty version", async () => {
    const user = setupUser();
    const onSubmit = renderDialog(jest.fn(), {
      mode: undefined,
      requireAssistantLastMessage: undefined,
      initialConfig: {
        history: [
          { role: "user", content: "Namaste", versions: { Hindi: "" } },
        ],
        evaluation: { type: "response" },
      },
    });
    await waitFor(() =>
      expect(screen.getByDisplayValue("Namaste")).toBeInTheDocument(),
    );
    await user.click(screen.getByRole("button", { name: "Save" }));
    expect(onSubmit).toHaveBeenCalledTimes(1);
  });

  it("asks before closing when a version name was typed but not confirmed", async () => {
    const user = setupUser();
    const onClose = jest.fn();
    renderDialog(jest.fn(), { onClose });
    await waitForHistory();

    await user.type(screen.getAllByLabelText("Version name")[0], "X");
    await user.click(screen.getByRole("button", { name: "Close" }));
    expect(screen.getByText("Discard changes?")).toBeInTheDocument();
    expect(onClose).not.toHaveBeenCalled();
  });
});
