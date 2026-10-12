import { render, screen, setupUser, waitFor } from "@/test-utils";
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
        .getAllByLabelText("Heading for this version")
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
    await user.click(screen.getAllByLabelText("Remove version")[0]);
    await user.click(screen.getByRole("button", { name: "Remove" }));
    await user.click(screen.getByRole("button", { name: "Save" }));

    const [config] = onSubmit.mock.calls[0];
    expect(config.history[0]).toEqual({ role: "user", content: "Namaste" });
  });

  it("asks to relabel the other agent messages after a heading changes, and 'Update all' does so", async () => {
    const user = setupUser();
    const onSubmit = renderDialog();
    await waitForHistory();

    const [first, second] = agentHeadings();
    await user.clear(first);
    await user.type(first, "Doctor");
    expect(
      screen.queryByText('Use "Doctor" for the other agent messages too?'),
    ).not.toBeInTheDocument();
    await user.tab();
    expect(
      screen.getByText('Use "Doctor" for the other agent messages too?'),
    ).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Update all" }));
    expect(
      screen.queryByText('Use "Doctor" for the other agent messages too?'),
    ).not.toBeInTheDocument();
    expect(second.value).toBe("Doctor");
    expect(userHeadings().map((i) => i.value)).toEqual(["Mother", ""]);

    await user.click(screen.getByRole("button", { name: "Save" }));
    const [config] = onSubmit.mock.calls[0];
    expect(config.history[3]).toMatchObject({ label: "Doctor" });
  });

  it("'Only this message' leaves the other headings alone", async () => {
    const user = setupUser();
    renderDialog();
    await waitForHistory();

    const [first, second] = userHeadings();
    await user.type(second, "Father");
    await user.tab();
    expect(
      screen.getByText('Use "Father" for the other user messages too?'),
    ).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Only this message" }));
    expect(
      screen.queryByText('Use "Father" for the other user messages too?'),
    ).not.toBeInTheDocument();
    expect(first.value).toBe("Mother");
    expect(second.value).toBe("Father");
  });

  it("does not ask when the heading was not changed or every other message already matches", async () => {
    const user = setupUser();
    renderDialog();
    await waitForHistory();

    await user.click(agentHeadings()[0]);
    await user.tab();
    expect(screen.queryByText(/messages too\?/)).not.toBeInTheDocument();

    await user.type(agentHeadings()[1], "Nurse");
    await user.tab();
    expect(screen.queryByText(/messages too\?/)).not.toBeInTheDocument();
  });

  it("renames a version and edits its text, keeping the order", async () => {
    const user = setupUser();
    const onSubmit = renderDialog();
    await waitForHistory();

    const names = screen.getAllByLabelText("Heading for this version");
    await user.clear(names[1]);
    await user.type(names[1], "Translation");
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

  it("ignores a rename that would collide with another version's name", async () => {
    const user = setupUser();
    renderDialog();
    await waitForHistory();

    const hinglish = screen.getAllByLabelText(
      "Heading for this version",
    )[2] as HTMLInputElement;
    await user.clear(hinglish);
    await user.type(hinglish, "English");
    expect(hinglish.value).toBe("Englis");
  });

  it("asks before removing a version; Cancel keeps it and Remove deletes it", async () => {
    const user = setupUser();
    const onSubmit = renderDialog();
    await waitForHistory();

    await user.click(screen.getAllByLabelText("Remove version")[2]);
    expect(screen.getByText("Remove this version?")).toBeInTheDocument();
    expect(
      screen.getByText("Hinglish will no longer be shown to annotators"),
    ).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Cancel" }));
    expect(screen.queryByText("Remove this version?")).not.toBeInTheDocument();
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
    expect(screen.queryByText("Remove this version?")).not.toBeInTheDocument();
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
      "Heading for this version",
    )[2] as HTMLInputElement;
    await user.clear(hinglish);
    await user.type(hinglish, "toString");
    expect(hinglish.value).toBe("toString");

    await user.click(screen.getByRole("button", { name: "Save" }));
    const [config] = onSubmit.mock.calls[0];
    expect(Object.keys(config.history[1].versions)).toEqual([
      "English",
      "toString",
    ]);
  });

  it("trims headings and drops a version whose name was blanked when saving", async () => {
    const user = setupUser();
    const onSubmit = renderDialog();
    await waitForHistory();

    await user.clear(agentHeadings()[0]);
    await user.type(agentHeadings()[0], "  Nurse draft  ");
    const hinglish = screen.getAllByLabelText("Heading for this version")[2];
    await user.clear(hinglish);

    await user.click(screen.getByRole("button", { name: "Save" }));
    const [config] = onSubmit.mock.calls[0];
    expect(config.history[1]).toEqual({
      role: "assistant",
      content: "Kaise ho?",
      label: "Nurse draft",
      versions: { English: "How are you?" },
    });
  });
});
