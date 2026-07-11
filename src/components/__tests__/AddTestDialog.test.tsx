import { render, screen, setupUser, waitFor, within } from "@/test-utils";
import { AddTestDialog, TestConfig } from "../AddTestDialog";

// jsdom has neither ResizeObserver nor scrollIntoView; the dialog uses both
// (AddBackChips' overflow measurement, and auto-scrolling the chat to the
// latest message). Stub them so the effects don't throw.
class MockResizeObserver {
  observe() {}
  unobserve() {}
  disconnect() {}
}

beforeAll(() => {
  (global as unknown as { ResizeObserver: typeof MockResizeObserver }).ResizeObserver =
    MockResizeObserver;
  Element.prototype.scrollIntoView = jest.fn();
});

// ToolPicker is a heavy, self-contained child (search box, tool list, param
// preview). Stub it with a couple of buttons so tests can deterministically
// drive "select an inbuilt tool" / "select a custom tool" without depending
// on its internal search/filter logic.
jest.mock("../ToolPicker", () => ({
  __esModule: true,
  ToolPicker: ({ onSelectInbuiltTool, onSelectCustomTool, availableTools }: any) => (
    <div data-testid="tool-picker">
      <button type="button" onClick={() => onSelectInbuiltTool("end_call", "End conversation")}>
        Pick inbuilt tool
      </button>
      {availableTools.map((t: any) => (
        <button key={t.uuid} type="button" onClick={() => onSelectCustomTool(t)}>
          Pick {t.name}
        </button>
      ))}
    </div>
  ),
}));

jest.mock("../../lib/reportError", () => ({
  __esModule: true,
  reportError: jest.fn(),
}));

const WEATHER_TOOL = {
  uuid: "tool-weather",
  name: "get_weather",
  config: {
    parameters: {
      properties: {
        city: { type: "string" },
        days: { type: "integer" },
      },
      required: ["city"],
    },
  },
  created_at: "2024-01-01T00:00:00Z",
  updated_at: "2024-01-01T00:00:00Z",
};

const CORRECTNESS_EVALUATOR = {
  uuid: "eval-correctness",
  name: "Correctness",
  description: "Checks correctness",
  slug: "default-llm-next-reply",
  owner_user_id: null,
  evaluator_type: "llm",
  live_version: { variables: [{ name: "criteria" }] },
};

const CONVERSATION_EVALUATOR = {
  uuid: "eval-conversation",
  name: "Conversation quality",
  description: "Checks the whole conversation",
  slug: null,
  owner_user_id: "user-1",
  evaluator_type: "conversation",
  live_version: { variables: [] },
};

const TONE_EVALUATOR = {
  uuid: "eval-tone",
  name: "Tone check",
  description: "Checks the reply's tone",
  slug: null,
  owner_user_id: "user-1",
  evaluator_type: "llm",
  live_version: { variables: [] },
};

function mockFetchImpl(
  tools: any[] = [WEATHER_TOOL],
  evaluators: any[] = [CORRECTNESS_EVALUATOR, CONVERSATION_EVALUATOR, TONE_EVALUATOR],
) {
  return jest.fn((url: string) => {
    if (url.includes("/evaluators")) {
      return Promise.resolve({
        ok: true,
        status: 200,
        json: async () => ({ items: evaluators, total: evaluators.length }),
      });
    }
    if (url.includes("/tools")) {
      return Promise.resolve({
        ok: true,
        status: 200,
        json: async () => tools,
      });
    }
    return Promise.resolve({ ok: false, status: 404, json: async () => ({}) });
  }) as unknown as typeof fetch;
}

function baseProps(overrides: Partial<Parameters<typeof AddTestDialog>[0]> = {}) {
  return {
    isOpen: true,
    onClose: jest.fn(),
    isEditing: false,
    isLoading: false,
    isCreating: false,
    createError: null,
    testName: "",
    setTestName: jest.fn(),
    validationAttempted: false,
    onSubmit: jest.fn(),
    ...overrides,
  };
}

const originalBackendUrl = process.env.NEXT_PUBLIC_BACKEND_URL;

beforeEach(() => {
  process.env.NEXT_PUBLIC_BACKEND_URL = "http://127.0.0.1:8000";
  localStorage.setItem("access_token", "test-token");
  (global as any).fetch = mockFetchImpl();
});

afterEach(() => {
  process.env.NEXT_PUBLIC_BACKEND_URL = originalBackendUrl;
  localStorage.clear();
  jest.restoreAllMocks();
});

// Drive a controlled `testName` prop from a stateful wrapper so typing in the
// name field is reflected back into the dialog, mirroring how the real
// parent page manages this state.
function ControlledDialog(props: any) {
  const [name, setName] = require("react").useState(props.testName ?? "");
  const [description, setDescription] = require("react").useState(
    props.itemDescription ?? "",
  );
  return (
    <AddTestDialog
      {...props}
      testName={name}
      setTestName={setName}
      itemDescription={props.setItemDescription ? description : undefined}
      setItemDescription={props.setItemDescription ? setDescription : undefined}
    />
  );
}

describe("AddTestDialog", () => {
  it("renders nothing when closed", () => {
    const { container } = render(<AddTestDialog {...baseProps({ isOpen: false })} />);
    expect(container).toBeEmptyDOMElement();
  });

  it("shows the create-phase type intro picker with three test types", async () => {
    render(<AddTestDialog {...baseProps()} />);
    expect(screen.getByText("Create a test")).toBeInTheDocument();
    expect(screen.getByText("Next reply test")).toBeInTheDocument();
    expect(screen.getByText("Tool call test")).toBeInTheDocument();
    expect(screen.getByText("Conversation test")).toBeInTheDocument();
  });

  it("closes from the intro picker via the X button without a discard prompt", async () => {
    const user = setupUser();
    const onClose = jest.fn();
    render(<AddTestDialog {...baseProps({ onClose })} />);
    await user.click(screen.getByLabelText("Close"));
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(screen.queryByText("Discard changes?")).not.toBeInTheDocument();
  });

  it("closes from the intro picker via backdrop click without a discard prompt", async () => {
    const user = setupUser();
    const onClose = jest.fn();
    const { container } = render(<AddTestDialog {...baseProps({ onClose })} />);
    const backdrop = container.querySelector(".absolute.inset-0.bg-black\\/50") as HTMLElement;
    await user.click(backdrop);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("enters the full editor after picking Next reply test", async () => {
    const user = setupUser();
    render(<AddTestDialog {...baseProps()} />);
    await user.click(screen.getByText("Next reply test"));
    expect(screen.getByText("Test name")).toBeInTheDocument();
    expect(screen.getByText("Evaluators")).toBeInTheDocument();
  });

  it("skips the intro picker when initialTab is provided (duplicate flow)", () => {
    render(<AddTestDialog {...baseProps({ initialTab: "tool-invocation" })} />);
    expect(screen.queryByText("Create a test")).not.toBeInTheDocument();
    expect(screen.getByText("Tools to test")).toBeInTheDocument();
  });

  it("skips the intro picker in labelItem mode and shows Item copy", () => {
    render(
      <AddTestDialog
        {...baseProps({
          mode: "labelItem",
          itemDescription: "",
          setItemDescription: jest.fn(),
        })}
      />,
    );
    expect(screen.queryByText("Create a test")).not.toBeInTheDocument();
    expect(screen.getByText("Item name")).toBeInTheDocument();
    expect(screen.getByText("Description")).toBeInTheDocument();
  });

  it("skips the intro picker when editing and shows a static, non-switchable type header", () => {
    const initialConfig: TestConfig = {
      history: [
        { role: "user", content: "Hi" },
        { role: "assistant", content: "Hello" },
      ],
      evaluation: { type: "response" },
    };
    render(
      <AddTestDialog
        {...baseProps({
          isEditing: true,
          initialTab: "next-reply",
          initialConfig,
        })}
      />,
    );
    expect(screen.getByText("Next reply test")).toBeInTheDocument();
    // Compact type-switcher boxes ("Tool call", "Conversation" buttons) are
    // only rendered in create mode; editing shows a static header instead.
    expect(screen.queryByRole("button", { name: "Tool call" })).not.toBeInTheDocument();
  });

  it("shows the loading spinner instead of the form while isLoading", () => {
    const { container } = render(
      <AddTestDialog {...baseProps({ initialTab: "next-reply", isLoading: true })} />,
    );
    expect(container.querySelector(".animate-spin")).toBeInTheDocument();
    expect(screen.queryByText("Test name")).not.toBeInTheDocument();
  });

  it("renders the createError message in the footer", () => {
    render(
      <AddTestDialog
        {...baseProps({ initialTab: "next-reply", createError: "Name already exists" })}
      />,
    );
    expect(screen.getByText("Name already exists")).toBeInTheDocument();
  });

  it("renders the nameError message next to the name input", () => {
    render(
      <AddTestDialog
        {...baseProps({ initialTab: "next-reply", nameError: "Duplicate name" })}
      />,
    );
    expect(screen.getByText("Duplicate name")).toBeInTheDocument();
  });

  describe("next-reply tab", () => {
    it("auto-attaches the default correctness evaluator once evaluators load", async () => {
      render(<AddTestDialog {...baseProps({ initialTab: "next-reply" })} />);
      await waitFor(() => expect(screen.getByText("Correctness")).toBeInTheDocument());
    });

    it("blocks submission and shows validation errors when name/messages/criteria are empty", async () => {
      const user = setupUser();
      const onSubmit = jest.fn();
      render(<ControlledDialog {...baseProps({ initialTab: "next-reply", onSubmit })} />);
      await waitFor(() => expect(screen.getByText("Correctness")).toBeInTheDocument());

      await user.click(screen.getByRole("button", { name: "Create" }));

      expect(onSubmit).not.toHaveBeenCalled();
      expect(screen.getByText("Test name cannot be empty")).toBeInTheDocument();
      expect(screen.getAllByText("Message cannot be empty").length).toBeGreaterThan(0);
    });

    it("submits a fully-filled next-reply test with the built config and evaluator payload", async () => {
      const user = setupUser();
      const onSubmit = jest.fn();
      render(<ControlledDialog {...baseProps({ initialTab: "next-reply", onSubmit })} />);
      await waitFor(() => expect(screen.getByText("Correctness")).toBeInTheDocument());

      await user.type(screen.getByPlaceholderText("Your test name"), "My test");

      const textareas = document.querySelectorAll("textarea[data-msg-id]");
      expect(textareas.length).toBe(3); // default user -> agent -> user
      await user.type(textareas[0], "Hi there");
      await user.type(textareas[1], "Hello!");
      await user.type(textareas[2], "How are you?");

      const criteriaInput = screen.getByPlaceholderText("Enter value for {{criteria}}");
      await user.type(criteriaInput, "Reply is polite");

      await user.click(screen.getByRole("button", { name: "Create" }));

      expect(onSubmit).toHaveBeenCalledTimes(1);
      const [config, evaluators] = onSubmit.mock.calls[0];
      expect(config.evaluation.type).toBe("response");
      expect(config.history).toHaveLength(3);
      expect(config.history[0]).toMatchObject({ role: "user", content: "Hi there" });
      expect(evaluators).toEqual([
        { evaluator_uuid: "eval-correctness", variable_values: { criteria: "Reply is polite" } },
      ]);
    });

    it("adds and removes a user message via the Add message dropdown", async () => {
      const user = setupUser();
      render(<AddTestDialog {...baseProps({ initialTab: "next-reply" })} />);
      await waitFor(() => expect(screen.getByText("Correctness")).toBeInTheDocument());

      let textareas = document.querySelectorAll("textarea[data-msg-id]");
      expect(textareas.length).toBe(3);

      await user.click(screen.getByTitle("Add message"));
      await user.click(screen.getByText("User message"));

      textareas = document.querySelectorAll("textarea[data-msg-id]");
      expect(textareas.length).toBe(4);

      const removeButtons = screen.getAllByTitle("Remove message");
      await user.click(removeButtons[removeButtons.length - 1]);

      textareas = document.querySelectorAll("textarea[data-msg-id]");
      expect(textareas.length).toBe(3);
    });

    it("adds an inbuilt tool call message via the Add message dropdown", async () => {
      const user = setupUser();
      render(<AddTestDialog {...baseProps({ initialTab: "next-reply" })} />);
      await waitFor(() => expect(screen.getByText("Correctness")).toBeInTheDocument());

      await user.click(screen.getByTitle("Add message"));
      await user.click(screen.getByText("Agent tool call"));
      await user.click(screen.getByText("Pick inbuilt tool"));

      expect(screen.getByText("End conversation")).toBeInTheDocument();
      // Inbuilt tools don't get a paired tool-response box.
      expect(screen.queryByText("Tool response")).not.toBeInTheDocument();
    });

    it("opens the evaluator picker, excludes conversation-type evaluators, searches, and attaches a match", async () => {
      const user = setupUser();
      render(<AddTestDialog {...baseProps({ initialTab: "next-reply" })} />);
      await waitFor(() => expect(screen.getByText("Correctness")).toBeInTheDocument());

      await user.click(screen.getByRole("button", { name: "Add evaluator" }));
      // Only "llm"-type evaluators are offered on the next-reply tab; the
      // conversation-type evaluator must not appear, and the already-attached
      // Correctness evaluator isn't offered again.
      expect(screen.queryByText("Conversation quality")).not.toBeInTheDocument();
      expect(screen.getByText("Tone check")).toBeInTheDocument();

      await user.type(screen.getByPlaceholderText("Search evaluators"), "nonexistent");
      expect(screen.getByText(/No evaluators match/)).toBeInTheDocument();

      await user.clear(screen.getByPlaceholderText("Search evaluators"));
      await user.type(screen.getByPlaceholderText("Search evaluators"), "tone");
      await user.click(screen.getByText("Tone check"));

      // The picker closes and the evaluator is now attached (appears outside
      // the picker, as a card with its own remove control).
      expect(screen.queryByPlaceholderText("Search evaluators")).not.toBeInTheDocument();
    });

    it("removes an attached evaluator", async () => {
      const user = setupUser();
      render(<AddTestDialog {...baseProps({ initialTab: "next-reply" })} />);
      await waitFor(() => expect(screen.getByText("Correctness")).toBeInTheDocument());

      await user.click(screen.getByRole("button", { name: "Add evaluator" }));
      await user.click(screen.getByText("Tone check"));
      expect(screen.getByText("Tone check")).toBeInTheDocument();

      await user.click(screen.getByRole("button", { name: "Remove Tone check" }));
      expect(screen.queryByText("Tone check")).not.toBeInTheDocument();
    });
  });

  describe("conversation tab", () => {
    it("switches to the conversation tab and offers the conversation-type evaluator only", async () => {
      const user = setupUser();
      render(<AddTestDialog {...baseProps()} />);
      await user.click(screen.getByText("Conversation test"));

      await waitFor(() =>
        expect(screen.getByRole("button", { name: "Add evaluator" })).toBeEnabled(),
      );
      await user.click(screen.getByRole("button", { name: "Add evaluator" }));
      expect(screen.getByText("Conversation quality")).toBeInTheDocument();
    });

    it("shows six default messages ending on an agent-allowed transcript when allowAgentLastMessage", () => {
      render(
        <AddTestDialog
          {...baseProps({ initialTab: "conversation", allowAgentLastMessage: true })}
        />,
      );
      const textareas = document.querySelectorAll("textarea[data-msg-id]");
      expect(textareas.length).toBe(6);
    });
  });

  describe("tool-invocation tab", () => {
    it("blocks submission when name is empty and no tools are selected", async () => {
      const user = setupUser();
      const onSubmit = jest.fn();
      render(<AddTestDialog {...baseProps({ initialTab: "tool-invocation", onSubmit })} />);

      await user.click(screen.getByRole("button", { name: "Create" }));
      expect(onSubmit).not.toHaveBeenCalled();
      expect(screen.getByRole("button", { name: "Add tool" })).toHaveClass("border-red-500");
    });

    it("adds a custom tool with a schema, fills required params, and submits", async () => {
      const user = setupUser();
      const onSubmit = jest.fn();
      render(<ControlledDialog {...baseProps({ initialTab: "tool-invocation", onSubmit })} />);

      await user.click(screen.getByRole("button", { name: "Add tool" }));
      await waitFor(() => expect(screen.getByText("Pick get_weather")).toBeInTheDocument());
      await user.click(screen.getByText("Pick get_weather"));

      expect(screen.getByText("get_weather")).toBeInTheDocument();
      // Required "city" param is pre-selected; optional "days" is offered as
      // an add-back chip instead.
      expect(screen.getByText("city")).toBeInTheDocument();
      expect(screen.getByRole("button", { name: /days/ })).toBeInTheDocument();

      await user.type(screen.getByPlaceholderText("Your test name"), "Weather test");
      await user.type(screen.getByPlaceholderText("Expected value"), "Bangalore");

      // The conversation-history messages (right column) are validated on
      // submit too, regardless of tab.
      const textareas = document.querySelectorAll("textarea[data-msg-id]");
      for (const ta of Array.from(textareas)) {
        await user.type(ta, "message");
      }

      await user.click(screen.getByRole("button", { name: "Create" }));

      expect(onSubmit).toHaveBeenCalledTimes(1);
      const [config] = onSubmit.mock.calls[0];
      expect(config.evaluation.type).toBe("tool_call");
      expect(config.evaluation.tool_calls).toEqual([
        {
          tool: "get_weather",
          arguments: { city: { match_type: "exact", value: "Bangalore" } },
          accept_any_arguments: false,
        },
      ]);
    });

    it("adds back an optional parameter chip and removes it again", async () => {
      const user = setupUser();
      render(<AddTestDialog {...baseProps({ initialTab: "tool-invocation" })} />);

      await user.click(screen.getByRole("button", { name: "Add tool" }));
      await waitFor(() => expect(screen.getByText("Pick get_weather")).toBeInTheDocument());
      await user.click(screen.getByText("Pick get_weather"));

      await user.click(screen.getByRole("button", { name: /days/ }));
      expect(screen.getByText("days")).toBeInTheDocument();

      const removeButtons = screen.getAllByLabelText("Remove parameter");
      await user.click(removeButtons[removeButtons.length - 1]);
      expect(screen.getByRole("button", { name: /days/ })).toBeInTheDocument();
    });

    it("toggles Accept any parameter values and hides the expected-parameters section", async () => {
      const user = setupUser();
      render(<AddTestDialog {...baseProps({ initialTab: "tool-invocation" })} />);

      await user.click(screen.getByRole("button", { name: "Add tool" }));
      await waitFor(() => expect(screen.getByText("Pick get_weather")).toBeInTheDocument());
      await user.click(screen.getByText("Pick get_weather"));

      expect(screen.getByText("city")).toBeInTheDocument();
      const label = screen.getByText("Accept any values for the parameters");
      // The checkbox is a sibling <button>, not a <label>-wrapped input —
      // click it directly rather than the text.
      await user.click(label.previousElementSibling as HTMLElement);
      expect(screen.queryByText("city")).not.toBeInTheDocument();
    });

    it("removes a selected tool", async () => {
      const user = setupUser();
      render(<AddTestDialog {...baseProps({ initialTab: "tool-invocation" })} />);

      await user.click(screen.getByRole("button", { name: "Add tool" }));
      await waitFor(() => expect(screen.getByText("Pick get_weather")).toBeInTheDocument());
      await user.click(screen.getByText("Pick get_weather"));
      expect(screen.getByText("get_weather")).toBeInTheDocument();

      // The tool-name display box and its trailing remove (trash) button.
      const toolNameBox = screen.getByText("get_weather");
      const removeBtn = toolNameBox.parentElement?.querySelector("button");
      expect(removeBtn).toBeTruthy();
      await user.click(removeBtn as HTMLElement);
      expect(screen.queryByText("get_weather")).not.toBeInTheDocument();
    });

    it("switches a tool's parameter editor into JSON mode and edits raw JSON", async () => {
      const user = setupUser();
      render(<AddTestDialog {...baseProps({ initialTab: "tool-invocation" })} />);

      await user.click(screen.getByRole("button", { name: "Add tool" }));
      await waitFor(() => expect(screen.getByText("Pick get_weather")).toBeInTheDocument());
      await user.click(screen.getByText("Pick get_weather"));

      await user.click(screen.getByRole("button", { name: "JSON" }));
      const jsonBox = document.querySelector("textarea") as HTMLTextAreaElement;
      expect(jsonBox).toBeTruthy();
      expect(jsonBox.value).toContain("city");

      await user.clear(jsonBox);
      await user.type(jsonBox, "not json", { skipClick: true });
      expect(screen.getByText(/Invalid JSON/)).toBeInTheDocument();

      await user.click(screen.getByRole("button", { name: "Form" }));
      expect(screen.queryByText(/Invalid JSON/)).not.toBeInTheDocument();
    });

    it("selects an inbuilt tool with no configurable parameters", async () => {
      const user = setupUser();
      render(<AddTestDialog {...baseProps({ initialTab: "tool-invocation" })} />);

      await user.click(screen.getByRole("button", { name: "Add tool" }));
      await waitFor(() => expect(screen.getByText("Pick inbuilt tool")).toBeInTheDocument());
      await user.click(screen.getByText("Pick inbuilt tool"));

      expect(screen.getByText("End conversation")).toBeInTheDocument();
      expect(screen.getByText("Should have been called")).toBeInTheDocument();
      // No parameters section for an inbuilt tool.
      expect(screen.queryByText("Accept any values for the parameters")).not.toBeInTheDocument();
    });
  });

  describe("discard-changes guard", () => {
    it("closes immediately on backdrop click when the form is pristine", async () => {
      const user = setupUser();
      const onClose = jest.fn();
      const { container } = render(
        <AddTestDialog {...baseProps({ initialTab: "next-reply", onClose })} />,
      );
      await waitFor(() => expect(screen.getByText("Correctness")).toBeInTheDocument());

      const backdrop = container.querySelector(".absolute.inset-0.bg-black\\/50") as HTMLElement;
      await user.click(backdrop);
      expect(onClose).toHaveBeenCalledTimes(1);
    });

    it("shows the discard confirmation after an edit, and Cancel keeps the dialog open", async () => {
      const user = setupUser();
      const onClose = jest.fn();
      const { container } = render(
        <ControlledDialog {...baseProps({ initialTab: "next-reply", onClose })} />,
      );
      await waitFor(() => expect(screen.getByText("Correctness")).toBeInTheDocument());

      await user.type(screen.getByPlaceholderText("Your test name"), "Edited");

      const backdrop = container.querySelector(".absolute.inset-0.bg-black\\/50") as HTMLElement;
      await user.click(backdrop);

      expect(screen.getByText("Discard changes?")).toBeInTheDocument();
      await user.click(screen.getByRole("button", { name: "Cancel" }));
      expect(screen.queryByText("Discard changes?")).not.toBeInTheDocument();
      expect(onClose).not.toHaveBeenCalled();
    });

    it("confirms discard and calls onClose", async () => {
      const user = setupUser();
      const onClose = jest.fn();
      const { container } = render(
        <ControlledDialog {...baseProps({ initialTab: "next-reply", onClose })} />,
      );
      await waitFor(() => expect(screen.getByText("Correctness")).toBeInTheDocument());

      await user.type(screen.getByPlaceholderText("Your test name"), "Edited");
      const backdrop = container.querySelector(".absolute.inset-0.bg-black\\/50") as HTMLElement;
      await user.click(backdrop);

      await user.click(screen.getByRole("button", { name: "Discard" }));
      expect(onClose).toHaveBeenCalledTimes(1);
    });

    it("Back button calls onClose directly (no discard guard)", async () => {
      const user = setupUser();
      const onClose = jest.fn();
      render(<AddTestDialog {...baseProps({ initialTab: "next-reply", onClose })} />);
      await waitFor(() => expect(screen.getByText("Correctness")).toBeInTheDocument());
      await user.click(screen.getByRole("button", { name: "Back" }));
      expect(onClose).toHaveBeenCalledTimes(1);
    });
  });

  describe("editing mode", () => {
    it("populates a tool-invocation test's history and tool calls from initialConfig", async () => {
      const initialConfig: TestConfig = {
        history: [
          { role: "user", content: "Book a flight" },
          {
            role: "assistant",
            content: "",
            tool_calls: [
              {
                id: "call-1",
                type: "function",
                function: {
                  name: "get_weather",
                  arguments: JSON.stringify({ city: "Delhi" }),
                },
              },
            ],
          },
        ],
        evaluation: {
          type: "tool_call",
          tool_calls: [
            { tool: "tool-weather", arguments: { city: "Delhi" }, is_called: true },
          ],
        },
      };
      render(
        <AddTestDialog
          {...baseProps({
            isEditing: true,
            initialTab: "tool-invocation",
            initialConfig,
            testName: "Existing test",
          })}
        />,
      );

      await waitFor(() => expect(screen.getByText("get_weather")).toBeInTheDocument());
      expect(screen.getByRole("button", { name: "Save" })).toBeInTheDocument();
      expect(screen.getByDisplayValue("Book a flight")).toBeInTheDocument();
    });

    it("shows Saving... while isCreating during an edit submit", () => {
      render(
        <AddTestDialog
          {...baseProps({
            isEditing: true,
            initialTab: "next-reply",
            isCreating: true,
            testName: "Existing",
          })}
        />,
      );
      expect(screen.getByText("Saving...")).toBeInTheDocument();
    });

    it("shows Creating... while isCreating during a fresh create submit", () => {
      render(
        <AddTestDialog
          {...baseProps({ initialTab: "next-reply", isCreating: true, testName: "New" })}
        />,
      );
      expect(screen.getByText("Creating...")).toBeInTheDocument();
    });

    it("disables the Create button while the last message is an agent message (next-reply)", async () => {
      const initialConfig: TestConfig = {
        history: [
          { role: "user", content: "Hi" },
          { role: "assistant", content: "Hello" },
        ],
        evaluation: { type: "response" },
      };
      render(
        <AddTestDialog
          {...baseProps({ initialTab: "next-reply", initialConfig, testName: "T" })}
        />,
      );
      await waitFor(() =>
        expect(screen.getByRole("button", { name: "Create" })).toBeDisabled(),
      );
    });
  });

  describe("labelItem mode", () => {
    it("requires the last message to be from the agent when requireAssistantLastMessage", async () => {
      render(
        <AddTestDialog
          {...baseProps({
            mode: "labelItem",
            itemDescription: "",
            setItemDescription: jest.fn(),
            requireAssistantLastMessage: true,
          })}
        />,
      );
      const textareas = document.querySelectorAll("textarea[data-msg-id]");
      expect(textareas.length).toBe(2); // user -> agent
      expect(screen.getByRole("button", { name: "Create" })).toBeEnabled();
    });

    it("updates the description field", async () => {
      const user = setupUser();
      render(<ControlledDialog {...baseProps({ mode: "labelItem", setItemDescription: jest.fn() })} />);
      const descriptionBox = screen.getByPlaceholderText(/Optional — what is this item about/);
      await user.type(descriptionBox, "Some notes");
      expect(descriptionBox).toHaveValue("Some notes");
    });
  });
});
