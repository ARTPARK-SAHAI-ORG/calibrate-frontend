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
  (
    global as unknown as { ResizeObserver: typeof MockResizeObserver }
  ).ResizeObserver = MockResizeObserver;
  Element.prototype.scrollIntoView = jest.fn();
});

// ToolPicker is a heavy, self-contained child (search box, tool list, param
// preview). Stub it with a couple of buttons so tests can deterministically
// drive "select an inbuilt tool" / "select a custom tool" without depending
// on its internal search/filter logic.
// Making an evaluator is its own multi-step journey with its own tests; here
// only the handing back of the created one matters.
jest.mock("../evaluators/CreateEvaluatorFlow", () => ({
  __esModule: true,
  CreateEvaluatorFlow: ({
    open,
    onCreated,
    useCaseTypes,
  }: {
    open: boolean;
    onCreated: (evaluator: unknown) => void;
    useCaseTypes?: string[];
  }) =>
    open ? (
      <div data-testid="create-evaluator-flow">
        <span data-testid="create-evaluator-types">
          {(useCaseTypes ?? []).join(",")}
        </span>
        <button
          type="button"
          onClick={() =>
            onCreated({
              uuid: "ev-made",
              name: "Made just now",
              description: null,
              slug: null,
              is_default: false,
              evaluator_type: "llm",
              live_version: { variables: [] },
            })
          }
        >
          finish creating
        </button>
      </div>
    ) : null,
}));

jest.mock("../ToolPicker", () => ({
  __esModule: true,
  ToolPicker: ({
    onSelectInbuiltTool,
    onSelectCustomTool,
    availableTools,
  }: any) => (
    <div data-testid="tool-picker">
      <button
        type="button"
        onClick={() => onSelectInbuiltTool("end_call", "End conversation")}
      >
        Pick inbuilt tool
      </button>
      {availableTools.map((t: any) => (
        <button
          key={t.uuid}
          type="button"
          onClick={() => onSelectCustomTool(t)}
        >
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
  is_default: true,
  evaluator_type: "llm",
  live_version: { variables: [{ name: "criteria" }] },
};

const CONVERSATION_EVALUATOR = {
  uuid: "eval-conversation",
  name: "Conversation quality",
  description: "Checks the whole conversation",
  slug: null,
  is_default: false,
  evaluator_type: "conversation",
  live_version: { variables: [] },
};

const TONE_EVALUATOR = {
  uuid: "eval-tone",
  name: "Tone check",
  description: "Checks the reply's tone",
  slug: null,
  is_default: false,
  evaluator_type: "llm",
  live_version: { variables: [] },
};

function mockFetchImpl(
  tools: any[] = [WEATHER_TOOL],
  evaluators: any[] = [
    CORRECTNESS_EVALUATOR,
    CONVERSATION_EVALUATOR,
    TONE_EVALUATOR,
  ],
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

function baseProps(
  overrides: Partial<Parameters<typeof AddTestDialog>[0]> = {},
) {
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

// Pick a type on the intro picker and confirm it: tapping the option opens a
// preview of what that test type looks like, and Next is what actually
// enters the full editor.
async function pickTestType(
  user: ReturnType<typeof setupUser>,
  title: string,
) {
  await user.click(screen.getByText(title));
  await user.click(screen.getByRole("button", { name: "Next" }));
}

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
    const { container } = render(
      <AddTestDialog {...baseProps({ isOpen: false })} />,
    );
    expect(container).toBeEmptyDOMElement();
  });

  it("offers next reply and tool call on the create-phase type intro picker", async () => {
    render(<AddTestDialog {...baseProps()} />);
    expect(screen.getByText("Create a test")).toBeInTheDocument();
    expect(
      screen.getByText("Does the agent give the right reply?"),
    ).toBeInTheDocument();
    expect(
      screen.getByText("Does the agent use the right tool?"),
    ).toBeInTheDocument();
  });

  it("does not offer the conversation type when creating a test", async () => {
    render(<AddTestDialog {...baseProps()} />);
    expect(screen.queryByText("Conversation test")).not.toBeInTheDocument();
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
    const backdrop = container.querySelector(
      ".absolute.inset-0.bg-black\\/50",
    ) as HTMLElement;
    await user.click(backdrop);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("shows a preview, then enters the full editor once Create is confirmed", async () => {
    const user = setupUser();
    render(<AddTestDialog {...baseProps()} />);
    await user.click(screen.getByText("Does the agent give the right reply?"));
    // Preview shown, editor not entered yet.
    expect(screen.getByText("Conversation history")).toBeInTheDocument();
    expect(screen.queryByText("Test name")).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Next" }));
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
    // Straight into the editor: no intro picker, and no way to switch the
    // type (no type header or switcher exists in the editor at all).
    expect(screen.queryByText("Create a test")).not.toBeInTheDocument();
    expect(screen.getByText("Test name")).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Tool call" }),
    ).not.toBeInTheDocument();
  });

  it("shows the loading spinner instead of the form while isLoading", () => {
    const { container } = render(
      <AddTestDialog
        {...baseProps({ initialTab: "next-reply", isLoading: true })}
      />,
    );
    expect(container.querySelector(".animate-spin")).toBeInTheDocument();
    expect(screen.queryByText("Test name")).not.toBeInTheDocument();
  });

  it("renders the createError message in the footer", () => {
    render(
      <AddTestDialog
        {...baseProps({
          initialTab: "next-reply",
          createError: "Name already exists",
        })}
      />,
    );
    expect(screen.getByText("Name already exists")).toBeInTheDocument();
  });

  it("renders the nameError message next to the name input", () => {
    render(
      <AddTestDialog
        {...baseProps({
          initialTab: "next-reply",
          nameError: "Duplicate name",
        })}
      />,
    );
    expect(screen.getByText("Duplicate name")).toBeInTheDocument();
  });

  describe("next-reply tab", () => {
    it("auto-attaches the default correctness evaluator once evaluators load", async () => {
      render(<AddTestDialog {...baseProps({ initialTab: "next-reply" })} />);
      await waitFor(() =>
        expect(screen.getByText("Correctness")).toBeInTheDocument(),
      );
    });

    it("auto-attaches the org default correctness fork via source_default_slug", async () => {
      const forkCorrectness = {
        uuid: "eval-correctness-fork",
        name: "Correctness",
        description: "Checks correctness",
        slug: null,
        source_default_slug: "default-llm-next-reply",
        is_default: true,
        evaluator_type: "llm",
        live_version: { variables: [{ name: "criteria" }] },
      };
      global.fetch = mockFetchImpl(
        [WEATHER_TOOL],
        [forkCorrectness, TONE_EVALUATOR, CONVERSATION_EVALUATOR],
      );
      render(<AddTestDialog {...baseProps({ initialTab: "next-reply" })} />);
      await waitFor(() =>
        expect(screen.getByText("Correctness")).toBeInTheDocument(),
      );
    });

    it("splits the evaluator picker into Default and My evaluators sections", async () => {
      const defaultTone = {
        uuid: "eval-default-tone",
        name: "Default tone",
        description: "Built-in tone check",
        slug: null,
        source_default_slug: "default-tone",
        is_default: true,
        evaluator_type: "llm",
        live_version: { variables: [] },
      };
      global.fetch = mockFetchImpl(
        [WEATHER_TOOL],
        [
          CORRECTNESS_EVALUATOR,
          defaultTone,
          TONE_EVALUATOR,
          CONVERSATION_EVALUATOR,
        ],
      );
      const user = setupUser();
      render(<AddTestDialog {...baseProps({ initialTab: "next-reply" })} />);
      await waitFor(() =>
        expect(screen.getByText("Correctness")).toBeInTheDocument(),
      );

      await user.click(screen.getByRole("button", { name: "Add evaluator" }));
      expect(screen.getByText("Default")).toBeInTheDocument();
      expect(screen.getByText("My evaluators")).toBeInTheDocument();
      expect(screen.getByText("Default tone")).toBeInTheDocument();
      expect(screen.getByText("Tone check")).toBeInTheDocument();
    });

    it("blocks submission and shows validation errors when name/messages/criteria are empty", async () => {
      const user = setupUser();
      const onSubmit = jest.fn();
      render(
        <ControlledDialog
          {...baseProps({ initialTab: "next-reply", onSubmit })}
        />,
      );
      await waitFor(() =>
        expect(screen.getByText("Correctness")).toBeInTheDocument(),
      );

      await user.click(screen.getByRole("button", { name: "Create" }));

      expect(onSubmit).not.toHaveBeenCalled();
      expect(screen.getByText("Test name cannot be empty")).toBeInTheDocument();
      expect(
        screen.getAllByText("Message cannot be empty").length,
      ).toBeGreaterThan(0);
    });

    it("submits a fully-filled next-reply test with the built config and evaluator payload", async () => {
      const user = setupUser();
      const onSubmit = jest.fn();
      render(
        <ControlledDialog
          {...baseProps({ initialTab: "next-reply", onSubmit })}
        />,
      );
      await waitFor(() =>
        expect(screen.getByText("Correctness")).toBeInTheDocument(),
      );

      await user.type(screen.getByPlaceholderText("Your test name"), "My test");

      const textareas = document.querySelectorAll("textarea[data-msg-id]");
      expect(textareas.length).toBe(3); // default user -> agent -> user
      await user.type(textareas[0], "Hi there");
      await user.type(textareas[1], "Hello!");
      await user.type(textareas[2], "How are you?");

      const criteriaInput = screen.getByPlaceholderText(
        "Enter value for {{criteria}}",
      );
      await user.type(criteriaInput, "Reply is polite");

      await user.click(screen.getByRole("button", { name: "Create" }));

      expect(onSubmit).toHaveBeenCalledTimes(1);
      const [config, evaluators] = onSubmit.mock.calls[0];
      expect(config.evaluation.type).toBe("response");
      expect(config.history).toHaveLength(3);
      expect(config.history[0]).toMatchObject({
        role: "user",
        content: "Hi there",
      });
      expect(evaluators).toEqual([
        {
          evaluator_uuid: "eval-correctness",
          variable_values: { criteria: "Reply is polite" },
        },
      ]);
    });

    async function fillRequiredNextReplyFields(
      user: ReturnType<typeof setupUser>,
    ) {
      await user.type(screen.getByPlaceholderText("Your test name"), "My test");
      const textareas = document.querySelectorAll("textarea[data-msg-id]");
      await user.type(textareas[0], "Hi there");
      await user.type(textareas[1], "Hello!");
      await user.type(textareas[2], "How are you?");
      const criteriaInput = screen.getByPlaceholderText(
        "Enter value for {{criteria}}",
      );
      await user.type(criteriaInput, "Reply is polite");
    }

    it("submits only the custom-input values that differ from the agent default", async () => {
      const user = setupUser();
      const onSubmit = jest.fn();
      render(
        <ControlledDialog
          {...baseProps({
            initialTab: "next-reply",
            onSubmit,
            agentDefaultInputs: { cond: "x" },
          })}
        />,
      );
      await waitFor(() =>
        expect(screen.getByText("Correctness")).toBeInTheDocument(),
      );
      await fillRequiredNextReplyFields(user);

      // The agent's field is seeded (locked name), value editable. Override it.
      const valueInput = screen.getByDisplayValue("x");
      await user.clear(valueInput);
      await user.type(valueInput, "y");

      await user.click(screen.getByRole("button", { name: "Create" }));

      expect(onSubmit).toHaveBeenCalledTimes(1);
      const [config] = onSubmit.mock.calls[0];
      expect(config.inputs).toEqual({ cond: "y" });
    });

    it("omits custom inputs when the value is left at the agent default", async () => {
      const user = setupUser();
      const onSubmit = jest.fn();
      render(
        <ControlledDialog
          {...baseProps({
            initialTab: "next-reply",
            onSubmit,
            agentDefaultInputs: { cond: "x" },
          })}
        />,
      );
      await waitFor(() =>
        expect(screen.getByText("Correctness")).toBeInTheDocument(),
      );
      await fillRequiredNextReplyFields(user);

      await user.click(screen.getByRole("button", { name: "Create" }));

      expect(onSubmit).toHaveBeenCalledTimes(1);
      const [config] = onSubmit.mock.calls[0];
      expect(config.inputs).toBeUndefined();
    });

    it("hides the custom-inputs section when the agent has no custom fields", () => {
      render(<AddTestDialog {...baseProps({ initialTab: "next-reply" })} />);
      expect(screen.queryByText("Custom inputs")).not.toBeInTheDocument();
    });

    it("seeds custom-input rows from the agent fields with per-case overrides layered on", () => {
      const initialConfig: TestConfig = {
        history: [
          { role: "user", content: "Hi" },
          { role: "assistant", content: "Hello" },
        ],
        evaluation: { type: "response" },
        inputs: { cond: "override" },
      };
      render(
        <AddTestDialog
          {...baseProps({
            isEditing: true,
            initialTab: "next-reply",
            initialConfig,
            agentDefaultInputs: { cond: "x", extra: "e" },
          })}
        />,
      );
      // Names shown read-only; the per-case override value wins over the default.
      expect(screen.getByText("cond")).toBeInTheDocument();
      expect(screen.getByText("extra")).toBeInTheDocument();
      expect(screen.getByDisplayValue("override")).toBeInTheDocument();
      expect(screen.getByDisplayValue("e")).toBeInTheDocument();
    });

    it("keeps custom-input edits when the agent-defaults prop identity changes", async () => {
      const user = setupUser();
      const { rerender } = render(
        <AddTestDialog
          {...baseProps({
            initialTab: "next-reply",
            agentDefaultInputs: { cond: "x" },
          })}
        />,
      );
      await waitFor(() =>
        expect(screen.getByText("Correctness")).toBeInTheDocument(),
      );

      const valueInput = screen.getByDisplayValue("x");
      await user.clear(valueInput);
      await user.type(valueInput, "y");

      // Parent re-renders and hands a fresh object with the same content. The
      // in-progress edit must survive (no re-seed on default-prop identity).
      rerender(
        <AddTestDialog
          {...baseProps({
            initialTab: "next-reply",
            agentDefaultInputs: { cond: "x" },
          })}
        />,
      );

      expect(screen.getByDisplayValue("y")).toBeInTheDocument();
    });

    it("adds and removes a user message via the Add message dropdown", async () => {
      const user = setupUser();
      render(<AddTestDialog {...baseProps({ initialTab: "next-reply" })} />);
      await waitFor(() =>
        expect(screen.getByText("Correctness")).toBeInTheDocument(),
      );

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
      await waitFor(() =>
        expect(screen.getByText("Correctness")).toBeInTheDocument(),
      );

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
      await waitFor(() =>
        expect(screen.getByText("Correctness")).toBeInTheDocument(),
      );

      await user.click(screen.getByRole("button", { name: "Add evaluator" }));
      // Only "llm"-type evaluators are offered on the next-reply tab; the
      // conversation-type evaluator must not appear, and the already-attached
      // Correctness evaluator isn't offered again.
      expect(
        screen.queryByText("Conversation quality"),
      ).not.toBeInTheDocument();
      expect(screen.getByText("Tone check")).toBeInTheDocument();

      await user.type(
        screen.getByPlaceholderText("Search evaluators"),
        "nonexistent",
      );
      expect(screen.getByText(/No evaluators match/)).toBeInTheDocument();

      await user.clear(screen.getByPlaceholderText("Search evaluators"));
      await user.type(screen.getByPlaceholderText("Search evaluators"), "tone");
      await user.click(screen.getByRole("checkbox", { name: /Tone check/i }));
      await user.click(screen.getByRole("button", { name: "Add (1)" }));

      // The picker closes and the evaluator is now attached (appears outside
      // the picker, as a card with its own remove control).
      expect(
        screen.queryByPlaceholderText("Search evaluators"),
      ).not.toBeInTheDocument();
    });

    it("makes an evaluator from the picker and attaches it to the test", async () => {
      const user = setupUser();
      render(<AddTestDialog {...baseProps({ initialTab: "next-reply" })} />);
      await waitFor(() =>
        expect(screen.getByText("Correctness")).toBeInTheDocument(),
      );

      await user.click(screen.getByRole("button", { name: "Add evaluator" }));
      await user.click(
        screen.getByRole("button", { name: "Create evaluator" }),
      );

      // The picker closes behind the flow, which is offered the kind this tab
      // needs so it can skip asking what the evaluator is for.
      expect(
        screen.queryByPlaceholderText("Search evaluators"),
      ).not.toBeInTheDocument();
      expect(screen.getByTestId("create-evaluator-types")).toHaveTextContent(
        "llm",
      );

      await user.click(screen.getByRole("button", { name: "finish creating" }));

      // The new evaluator is on the test straight away.
      expect(screen.getByText("Made just now")).toBeInTheDocument();
      expect(
        screen.getByRole("button", { name: "Remove Made just now" }),
      ).toBeInTheDocument();
    });

    it("removes an attached evaluator", async () => {
      const user = setupUser();
      render(<AddTestDialog {...baseProps({ initialTab: "next-reply" })} />);
      await waitFor(() =>
        expect(screen.getByText("Correctness")).toBeInTheDocument(),
      );

      await user.click(screen.getByRole("button", { name: "Add evaluator" }));
      await user.click(screen.getByRole("checkbox", { name: /Tone check/i }));
      await user.click(screen.getByRole("button", { name: "Add (1)" }));
      expect(screen.getByText("Tone check")).toBeInTheDocument();

      await user.click(
        screen.getByRole("button", { name: "Remove Tone check" }),
      );
      expect(screen.queryByText("Tone check")).not.toBeInTheDocument();
    });
  });

  describe("conversation tab", () => {
    it("offers the conversation-type evaluator only on an existing conversation test", async () => {
      const user = setupUser();
      // The type can no longer be picked when creating, so an existing
      // conversation test opens straight onto its own tab.
      render(<AddTestDialog {...baseProps({ initialTab: "conversation" })} />);

      await waitFor(() =>
        expect(
          screen.getByRole("button", { name: "Add evaluator" }),
        ).toBeEnabled(),
      );
      await user.click(screen.getByRole("button", { name: "Add evaluator" }));
      expect(screen.getByText("Conversation quality")).toBeInTheDocument();
    });

    it("shows six default messages ending on an agent-allowed transcript when allowAgentLastMessage", () => {
      render(
        <AddTestDialog
          {...baseProps({
            initialTab: "conversation",
            allowAgentLastMessage: true,
          })}
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
      render(
        <AddTestDialog
          {...baseProps({ initialTab: "tool-invocation", onSubmit })}
        />,
      );

      await user.click(screen.getByRole("button", { name: "Create" }));
      expect(onSubmit).not.toHaveBeenCalled();
      expect(screen.getByRole("button", { name: "Add tool" })).toHaveClass(
        "border-red-500",
      );
    });

    it("adds a custom tool with a schema, fills required params, and submits", async () => {
      const user = setupUser();
      const onSubmit = jest.fn();
      render(
        <ControlledDialog
          {...baseProps({ initialTab: "tool-invocation", onSubmit })}
        />,
      );

      await user.click(screen.getByRole("button", { name: "Add tool" }));
      await waitFor(() =>
        expect(screen.getByText("Pick get_weather")).toBeInTheDocument(),
      );
      await user.click(screen.getByText("Pick get_weather"));

      expect(screen.getByText("get_weather")).toBeInTheDocument();
      // Required "city" param is pre-selected; optional "days" is offered as
      // an add-back chip instead.
      expect(screen.getByText("city")).toBeInTheDocument();
      expect(screen.getByRole("button", { name: /days/ })).toBeInTheDocument();

      await user.type(
        screen.getByPlaceholderText("Your test name"),
        "Weather test",
      );
      await user.type(
        screen.getByPlaceholderText("Expected value"),
        "Bangalore",
      );

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
      render(
        <AddTestDialog {...baseProps({ initialTab: "tool-invocation" })} />,
      );

      await user.click(screen.getByRole("button", { name: "Add tool" }));
      await waitFor(() =>
        expect(screen.getByText("Pick get_weather")).toBeInTheDocument(),
      );
      await user.click(screen.getByText("Pick get_weather"));

      await user.click(screen.getByRole("button", { name: /days/ }));
      expect(screen.getByText("days")).toBeInTheDocument();

      const removeButtons = screen.getAllByLabelText("Remove parameter");
      await user.click(removeButtons[removeButtons.length - 1]);
      expect(screen.getByRole("button", { name: /days/ })).toBeInTheDocument();
    });

    it("toggles Accept any parameter values and hides the expected-parameters section", async () => {
      const user = setupUser();
      render(
        <AddTestDialog {...baseProps({ initialTab: "tool-invocation" })} />,
      );

      await user.click(screen.getByRole("button", { name: "Add tool" }));
      await waitFor(() =>
        expect(screen.getByText("Pick get_weather")).toBeInTheDocument(),
      );
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
      render(
        <AddTestDialog {...baseProps({ initialTab: "tool-invocation" })} />,
      );

      await user.click(screen.getByRole("button", { name: "Add tool" }));
      await waitFor(() =>
        expect(screen.getByText("Pick get_weather")).toBeInTheDocument(),
      );
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
      render(
        <AddTestDialog {...baseProps({ initialTab: "tool-invocation" })} />,
      );

      await user.click(screen.getByRole("button", { name: "Add tool" }));
      await waitFor(() =>
        expect(screen.getByText("Pick get_weather")).toBeInTheDocument(),
      );
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
      render(
        <AddTestDialog {...baseProps({ initialTab: "tool-invocation" })} />,
      );

      await user.click(screen.getByRole("button", { name: "Add tool" }));
      await waitFor(() =>
        expect(screen.getByText("Pick inbuilt tool")).toBeInTheDocument(),
      );
      await user.click(screen.getByText("Pick inbuilt tool"));

      expect(screen.getByText("End conversation")).toBeInTheDocument();
      expect(screen.getByText("Should have been called")).toBeInTheDocument();
      // No parameters section for an inbuilt tool.
      expect(
        screen.queryByText("Accept any values for the parameters"),
      ).not.toBeInTheDocument();
    });
  });

  describe("discard-changes guard", () => {
    it("closes immediately on backdrop click when the form is pristine", async () => {
      const user = setupUser();
      const onClose = jest.fn();
      const { container } = render(
        <AddTestDialog {...baseProps({ initialTab: "next-reply", onClose })} />,
      );
      await waitFor(() =>
        expect(screen.getByText("Correctness")).toBeInTheDocument(),
      );

      const backdrop = container.querySelector(
        ".absolute.inset-0.bg-black\\/50",
      ) as HTMLElement;
      await user.click(backdrop);
      expect(onClose).toHaveBeenCalledTimes(1);
    });

    it("shows the discard confirmation after an edit, and Cancel keeps the dialog open", async () => {
      const user = setupUser();
      const onClose = jest.fn();
      const { container } = render(
        <ControlledDialog
          {...baseProps({ initialTab: "next-reply", onClose })}
        />,
      );
      await waitFor(() =>
        expect(screen.getByText("Correctness")).toBeInTheDocument(),
      );

      await user.type(screen.getByPlaceholderText("Your test name"), "Edited");

      const backdrop = container.querySelector(
        ".absolute.inset-0.bg-black\\/50",
      ) as HTMLElement;
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
        <ControlledDialog
          {...baseProps({ initialTab: "next-reply", onClose })}
        />,
      );
      await waitFor(() =>
        expect(screen.getByText("Correctness")).toBeInTheDocument(),
      );

      await user.type(screen.getByPlaceholderText("Your test name"), "Edited");
      const backdrop = container.querySelector(
        ".absolute.inset-0.bg-black\\/50",
      ) as HTMLElement;
      await user.click(backdrop);

      await user.click(screen.getByRole("button", { name: "Discard" }));
      expect(onClose).toHaveBeenCalledTimes(1);
    });

    it("the top-right Close icon calls onClose directly (no discard guard)", async () => {
      const user = setupUser();
      const onClose = jest.fn();
      render(
        <AddTestDialog {...baseProps({ initialTab: "next-reply", onClose })} />,
      );
      await waitFor(() =>
        expect(screen.getByText("Correctness")).toBeInTheDocument(),
      );
      await user.click(screen.getByLabelText("Close"));
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
            {
              tool: "tool-weather",
              arguments: { city: "Delhi" },
              is_called: true,
            },
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

      await waitFor(() =>
        expect(screen.getByText("get_weather")).toBeInTheDocument(),
      );
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
          {...baseProps({
            initialTab: "next-reply",
            isCreating: true,
            testName: "New",
          })}
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
          {...baseProps({
            initialTab: "next-reply",
            initialConfig,
            testName: "T",
          })}
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
      render(
        <ControlledDialog
          {...baseProps({ mode: "labelItem", setItemDescription: jest.fn() })}
        />,
      );
      const descriptionBox = screen.getByPlaceholderText(
        /Optional — what is this item about/,
      );
      await user.type(descriptionBox, "Some notes");
      expect(descriptionBox).toHaveValue("Some notes");
    });

    it("never offers the run shortcut even when showRunAfterSave is set", () => {
      render(
        <AddTestDialog
          {...baseProps({
            mode: "labelItem",
            itemDescription: "",
            setItemDescription: jest.fn(),
            showRunAfterSave: true,
          })}
        />,
      );
      expect(
        screen.queryByRole("button", { name: /Run test/ }),
      ).not.toBeInTheDocument();
    });
  });

  describe("save-and-run shortcut", () => {
    it("does not render the run button unless showRunAfterSave is set", async () => {
      render(<AddTestDialog {...baseProps({ initialTab: "next-reply" })} />);
      await waitFor(() =>
        expect(screen.getByText("Correctness")).toBeInTheDocument(),
      );
      expect(
        screen.queryByRole("button", { name: /Run test/ }),
      ).not.toBeInTheDocument();
    });

    it("renders 'Run test' when editing with showRunAfterSave", async () => {
      const initialConfig: TestConfig = {
        history: [
          { role: "user", content: "Hi" },
          { role: "assistant", content: "Hello" },
          { role: "user", content: "How are you?" },
        ],
        evaluation: { type: "response" },
      };
      render(
        <AddTestDialog
          {...baseProps({
            isEditing: true,
            initialTab: "next-reply",
            initialConfig,
            testName: "Existing",
            showRunAfterSave: true,
          })}
        />,
      );
      await waitFor(() =>
        expect(
          screen.getByRole("button", { name: /Run test/ }),
        ).toBeInTheDocument(),
      );
    });

    it("submits with runAfterSave:true when the run button is clicked, and false for the plain create", async () => {
      const user = setupUser();
      const onSubmit = jest.fn();
      render(
        <ControlledDialog
          {...baseProps({
            initialTab: "next-reply",
            onSubmit,
            showRunAfterSave: true,
          })}
        />,
      );
      await waitFor(() =>
        expect(screen.getByText("Correctness")).toBeInTheDocument(),
      );

      await user.type(screen.getByPlaceholderText("Your test name"), "My test");
      const textareas = document.querySelectorAll("textarea[data-msg-id]");
      await user.type(textareas[0], "Hi there");
      await user.type(textareas[1], "Hello!");
      await user.type(textareas[2], "How are you?");
      await user.type(
        screen.getByPlaceholderText("Enter value for {{criteria}}"),
        "Reply is polite",
      );

      await user.click(screen.getByRole("button", { name: /Run test/ }));
      expect(onSubmit).toHaveBeenCalledTimes(1);
      expect(onSubmit.mock.calls[0][2]).toEqual({ runAfterSave: true });

      await user.click(screen.getByRole("button", { name: "Create" }));
      expect(onSubmit).toHaveBeenCalledTimes(2);
      expect(onSubmit.mock.calls[1][2]).toEqual({ runAfterSave: false });
    });

    it("shows the spinner on the run button while creating after a run-click", async () => {
      const user = setupUser();
      // A controlled wrapper that flips isCreating on once the run button is
      // clicked, so we can assert the spinner lands on the run button (not the
      // plain Create button).
      function CreatingWrapper() {
        const React = require("react");
        const [creating, setCreating] = React.useState(false);
        return (
          <ControlledDialog
            {...baseProps({
              initialTab: "next-reply",
              showRunAfterSave: true,
              isCreating: creating,
              onSubmit: () => setCreating(true),
            })}
          />
        );
      }
      render(<CreatingWrapper />);
      await waitFor(() =>
        expect(screen.getByText("Correctness")).toBeInTheDocument(),
      );

      await user.type(screen.getByPlaceholderText("Your test name"), "My test");
      const textareas = document.querySelectorAll("textarea[data-msg-id]");
      await user.type(textareas[0], "Hi there");
      await user.type(textareas[1], "Hello!");
      await user.type(textareas[2], "How are you?");
      await user.type(
        screen.getByPlaceholderText("Enter value for {{criteria}}"),
        "Reply is polite",
      );

      const runButton = screen.getByRole("button", { name: /Run test/ });
      await user.click(runButton);
      // The run button keeps its label and gains a spinner; the plain button
      // shows "Creating..." only when it was the trigger — here it should not.
      expect(within(runButton).queryByRole("img")).not.toBeInTheDocument();
      expect(runButton.querySelector(".animate-spin")).toBeInTheDocument();
      expect(screen.queryByText("Creating...")).not.toBeInTheDocument();
    });

    const editConfig: TestConfig = {
      history: [
        { role: "user", content: "Hi" },
        { role: "assistant", content: "Hello" },
        { role: "user", content: "How are you?" },
      ],
      evaluation: { type: "response" },
    };
    // Passing initialEvaluators hydrates an attached evaluator on edit (the
    // default correctness auto-attach only runs for brand-new tests). The
    // criteria is pre-filled so the form loads clean and valid.
    const editEvaluators = [
      {
        evaluator_uuid: "eval-correctness",
        name: "Correctness",
        slug: "default-llm-next-reply",
        variables: [{ name: "criteria" }],
        variable_values: { criteria: "Reply is polite" },
      },
    ];

    function renderEdit(
      overrides: Partial<Parameters<typeof AddTestDialog>[0]> = {},
    ) {
      return render(
        <ControlledDialog
          {...baseProps({
            isEditing: true,
            initialTab: "next-reply",
            initialConfig: editConfig,
            initialEvaluators: editEvaluators,
            testName: "Existing",
            showRunAfterSave: true,
            ...overrides,
          })}
        />,
      );
    }

    it("runs the saved test directly (no save, no prompt) when editing with no unsaved changes", async () => {
      const user = setupUser();
      const onSubmit = jest.fn();
      const onRun = jest.fn();
      renderEdit({ onSubmit, onRun });
      await waitFor(() =>
        expect(screen.getByDisplayValue("Reply is polite")).toBeInTheDocument(),
      );

      await user.click(screen.getByRole("button", { name: /Run test/ }));
      expect(onRun).toHaveBeenCalledTimes(1);
      expect(onSubmit).not.toHaveBeenCalled();
      expect(screen.queryByText("Unsaved changes")).not.toBeInTheDocument();
    });

    it("prompts on Run when editing with unsaved changes; Cancel dismisses without running", async () => {
      const user = setupUser();
      const onSubmit = jest.fn();
      const onRun = jest.fn();
      renderEdit({ onSubmit, onRun });
      const criteria = await screen.findByDisplayValue("Reply is polite");

      await user.type(criteria, "!"); // edit makes the form dirty
      await user.click(screen.getByRole("button", { name: /Run test/ }));

      expect(screen.getByText("Unsaved changes")).toBeInTheDocument();
      await user.click(screen.getByRole("button", { name: "Cancel" }));
      expect(screen.queryByText("Unsaved changes")).not.toBeInTheDocument();
      expect(onSubmit).not.toHaveBeenCalled();
      expect(onRun).not.toHaveBeenCalled();
    });

    it("'Save and run' from the prompt saves with runAfterSave and does not call onRun", async () => {
      const user = setupUser();
      const onSubmit = jest.fn();
      const onRun = jest.fn();
      renderEdit({ onSubmit, onRun });
      const criteria = await screen.findByDisplayValue("Reply is polite");

      await user.type(criteria, "!");
      await user.click(screen.getByRole("button", { name: /Run test/ }));
      await user.click(screen.getByRole("button", { name: "Save and run" }));

      expect(onSubmit).toHaveBeenCalledTimes(1);
      expect(onSubmit.mock.calls[0][2]).toEqual({ runAfterSave: true });
      expect(onRun).not.toHaveBeenCalled();
    });

    it("'Discard and run' from the prompt runs the saved test without saving", async () => {
      const user = setupUser();
      const onSubmit = jest.fn();
      const onRun = jest.fn();
      renderEdit({ onSubmit, onRun });
      const criteria = await screen.findByDisplayValue("Reply is polite");

      await user.type(criteria, "!");
      await user.click(screen.getByRole("button", { name: /Run test/ }));
      await user.click(screen.getByRole("button", { name: "Discard and run" }));

      expect(onRun).toHaveBeenCalledTimes(1);
      expect(onSubmit).not.toHaveBeenCalled();
    });

    it("falls back to save-and-run on a clean edit when no onRun is provided", async () => {
      const user = setupUser();
      const onSubmit = jest.fn();
      renderEdit({ onSubmit }); // no onRun
      await waitFor(() =>
        expect(screen.getByDisplayValue("Reply is polite")).toBeInTheDocument(),
      );

      await user.click(screen.getByRole("button", { name: /Run test/ }));
      expect(onSubmit).toHaveBeenCalledTimes(1);
      expect(onSubmit.mock.calls[0][2]).toEqual({ runAfterSave: true });
    });

    it("falls back to save-and-run on 'Discard and run' when no onRun is provided", async () => {
      const user = setupUser();
      const onSubmit = jest.fn();
      renderEdit({ onSubmit }); // no onRun
      const criteria = await screen.findByDisplayValue("Reply is polite");

      await user.type(criteria, "!");
      await user.click(screen.getByRole("button", { name: /Run test/ }));
      await user.click(screen.getByRole("button", { name: "Discard and run" }));
      expect(onSubmit).toHaveBeenCalledTimes(1);
      expect(onSubmit.mock.calls[0][2]).toEqual({ runAfterSave: true });
    });
  });

  describe("agentNature", () => {
    it("still offers the reply and tool questions when agentNature is omitted (conversation, unchanged)", () => {
      render(<AddTestDialog {...baseProps()} />);
      expect(
        screen.getByText("Does the agent give the right reply?"),
      ).toBeInTheDocument();
      expect(
        screen.getByText("Does the agent use the right tool?"),
      ).toBeInTheDocument();
      // Conversation is hidden for every agent, not just general ones.
      expect(screen.queryByText("Conversation test")).not.toBeInTheDocument();
    });

    it("does not seed the conversation-agent Correctness default for a general agent", async () => {
      render(
        <AddTestDialog
          {...baseProps({ initialTab: "next-reply", agentNature: "general" })}
        />,
      );
      // The editor renders (the info banner is gone outside labelling mode)
      // and the llm-type Correctness default is not seeded.
      await waitFor(() =>
        expect(screen.getByText("Test name")).toBeInTheDocument(),
      );
      expect(screen.queryByText("Correctness")).not.toBeInTheDocument();
    });

    it("seeds a general agent's next-reply evaluators from llm-general, not llm, and skips the default-correctness fallback", async () => {
      // TONE_EVALUATOR is an "llm" evaluator linked to the agent. For a
      // general agent the seeding looks for "llm-general" evaluators
      // instead, so it should find nothing here, and — unlike the
      // conversation-agent case — must not fall back to the seeded default
      // correctness evaluator either.
      render(
        <AddTestDialog
          {...baseProps({
            initialTab: "next-reply",
            agentNature: "general",
            agentEvaluatorUuids: [TONE_EVALUATOR.uuid],
          })}
        />,
      );
      await waitFor(() =>
        expect(
          screen.getByText("Add at least one evaluator to grade the agent's next reply"),
        ).toBeInTheDocument(),
      );
      expect(screen.queryByText("Correctness")).not.toBeInTheDocument();
      expect(screen.queryByText("Tone check")).not.toBeInTheDocument();
    });

    it("still seeds the default-correctness evaluator for a conversation agent with no agent evaluators", async () => {
      render(
        <AddTestDialog
          {...baseProps({
            initialTab: "next-reply",
            agentNature: "conversation",
          })}
        />,
      );
      await waitFor(() => expect(screen.getByText("Correctness")).toBeInTheDocument());
    });

    const GENERAL_EVALUATOR = {
      uuid: "eval-general",
      name: "Output check",
      description: "Checks the output",
      slug: null,
      is_default: false,
      evaluator_type: "llm-general",
      live_version: { variables: [] },
    };

    it("shows a single input box instead of the conversation builder for a general agent's Output tab", async () => {
      render(
        <AddTestDialog
          {...baseProps({ initialTab: "next-reply", agentNature: "general" })}
        />,
      );
      await waitFor(() =>
        expect(screen.getByPlaceholderText("Enter the input given to the agent")).toBeInTheDocument(),
      );
      // The multi-turn chat-message builder is gone entirely for this case.
      expect(document.querySelectorAll("textarea[data-msg-id]").length).toBe(0);
      expect(screen.queryByText("Add message")).not.toBeInTheDocument();
    });

    it("blocks submission when a general agent's input is empty", async () => {
      const user = setupUser();
      const onSubmit = jest.fn();
      global.fetch = mockFetchImpl([WEATHER_TOOL], [GENERAL_EVALUATOR]);
      render(
        <ControlledDialog
          {...baseProps({
            initialTab: "next-reply",
            agentNature: "general",
            agentEvaluatorUuids: [GENERAL_EVALUATOR.uuid],
            onSubmit,
          })}
        />,
      );
      await waitFor(() => expect(screen.getByText("Output check")).toBeInTheDocument());
      await user.type(screen.getByPlaceholderText("Your test name"), "General test");

      await user.click(screen.getByRole("button", { name: "Create" }));

      expect(onSubmit).not.toHaveBeenCalled();
      expect(screen.getByText("Input cannot be empty")).toBeInTheDocument();
    });

    it("submits a general test with `input`, `evaluation.type: general`, and no history key", async () => {
      const user = setupUser();
      const onSubmit = jest.fn();
      global.fetch = mockFetchImpl([WEATHER_TOOL], [GENERAL_EVALUATOR]);
      render(
        <ControlledDialog
          {...baseProps({
            initialTab: "next-reply",
            agentNature: "general",
            agentEvaluatorUuids: [GENERAL_EVALUATOR.uuid],
            onSubmit,
          })}
        />,
      );
      await waitFor(() => expect(screen.getByText("Output check")).toBeInTheDocument());
      await user.type(screen.getByPlaceholderText("Your test name"), "General test");
      await user.type(
        screen.getByPlaceholderText("Enter the input given to the agent"),
        "Summarize this article: ...",
      );

      await user.click(screen.getByRole("button", { name: "Create" }));

      expect(onSubmit).toHaveBeenCalledTimes(1);
      const [config, evaluators] = onSubmit.mock.calls[0];
      expect(config).toEqual({
        input: "Summarize this article: ...",
        evaluation: { type: "general" },
      });
      expect(config.history).toBeUndefined();
      expect(evaluators).toEqual([{ evaluator_uuid: "eval-general" }]);
    });

    it("treats an existing general test as general even with no agentNature (the /tests page)", async () => {
      // The standalone /tests page has no agent, so it cannot pass
      // agentNature. Without recognising the test's own type, the dialog
      // would show the conversation builder and save it back as a
      // `response` test, losing the input.
      const user = setupUser();
      const onSubmit = jest.fn();
      const initialConfig: TestConfig = {
        input: "Summarise this article",
        evaluation: { type: "general" },
      };
      global.fetch = mockFetchImpl([WEATHER_TOOL], [GENERAL_EVALUATOR]);
      render(
        <AddTestDialog
          {...baseProps({
            isEditing: true,
            initialTab: "next-reply",
            initialConfig,
            initialEvaluators: [
              {
                evaluator_uuid: GENERAL_EVALUATOR.uuid,
                name: "Output check",
                slug: null,
                variables: [],
              },
            ],
            testName: "Existing general test",
            onSubmit,
          })}
        />,
      );

      // The single input box is shown, holding the test's own input.
      await waitFor(() =>
        expect(
          screen.getByDisplayValue("Summarise this article"),
        ).toBeInTheDocument(),
      );

      await user.click(screen.getByRole("button", { name: "Save" }));
      expect(onSubmit).toHaveBeenCalledTimes(1);
      const [config] = onSubmit.mock.calls[0];
      // Saved back as a general test, not converted to a response one.
      expect(config.evaluation.type).toBe("general");
      expect(config.input).toBe("Summarise this article");
      expect(config.history).toBeUndefined();
    });

    it("populates the input box from an existing general test's config.input on edit", async () => {
      const initialConfig: TestConfig = {
        input: "What is the capital of France?",
        evaluation: { type: "general" },
      };
      global.fetch = mockFetchImpl([WEATHER_TOOL], [GENERAL_EVALUATOR]);
      render(
        <AddTestDialog
          {...baseProps({
            isEditing: true,
            initialTab: "next-reply",
            agentNature: "general",
            initialConfig,
            testName: "Existing general test",
          })}
        />,
      );
      await waitFor(() =>
        expect(
          screen.getByDisplayValue("What is the capital of France?"),
        ).toBeInTheDocument(),
      );
    });

    it("shows a single input box instead of the conversation builder on a general agent's Tool call tab", async () => {
      render(
        <AddTestDialog
          {...baseProps({
            initialTab: "tool-invocation",
            agentNature: "general",
          })}
        />,
      );
      await waitFor(() =>
        expect(
          screen.getByPlaceholderText("Enter the input given to the agent"),
        ).toBeInTheDocument(),
      );
      // The multi-turn chat-message builder is gone; the tool picker stays.
      expect(document.querySelectorAll("textarea[data-msg-id]").length).toBe(0);
      expect(screen.getByText("Tools to test")).toBeInTheDocument();
    });

    it("submits a general agent's tool call test with `input`, no history, and evaluation.type tool_call", async () => {
      const user = setupUser();
      const onSubmit = jest.fn();
      render(
        <ControlledDialog
          {...baseProps({
            initialTab: "tool-invocation",
            agentNature: "general",
            onSubmit,
          })}
        />,
      );

      await user.click(screen.getByRole("button", { name: "Add tool" }));
      await waitFor(() =>
        expect(screen.getByText("Pick get_weather")).toBeInTheDocument(),
      );
      await user.click(screen.getByText("Pick get_weather"));

      await user.type(
        screen.getByPlaceholderText("Your test name"),
        "Weather tool test",
      );
      await user.type(
        screen.getByPlaceholderText("Expected value"),
        "Bangalore",
      );
      await user.type(
        screen.getByPlaceholderText("Enter the input given to the agent"),
        "What is the weather in Bangalore?",
      );

      await user.click(screen.getByRole("button", { name: "Create" }));

      expect(onSubmit).toHaveBeenCalledTimes(1);
      const [config] = onSubmit.mock.calls[0];
      expect(config).toEqual({
        input: "What is the weather in Bangalore?",
        evaluation: {
          type: "tool_call",
          tool_calls: [
            {
              tool: "get_weather",
              arguments: { city: { match_type: "exact", value: "Bangalore" } },
              accept_any_arguments: false,
            },
          ],
        },
      });
      expect(config.history).toBeUndefined();
    });

    it("blocks submission when a general agent's tool call test has an empty input", async () => {
      const user = setupUser();
      const onSubmit = jest.fn();
      render(
        <ControlledDialog
          {...baseProps({
            initialTab: "tool-invocation",
            agentNature: "general",
            onSubmit,
          })}
        />,
      );

      await user.click(screen.getByRole("button", { name: "Add tool" }));
      await waitFor(() =>
        expect(screen.getByText("Pick get_weather")).toBeInTheDocument(),
      );
      await user.click(screen.getByText("Pick get_weather"));

      await user.type(
        screen.getByPlaceholderText("Your test name"),
        "Weather tool test",
      );
      await user.type(
        screen.getByPlaceholderText("Expected value"),
        "Bangalore",
      );

      await user.click(screen.getByRole("button", { name: "Create" }));

      expect(onSubmit).not.toHaveBeenCalled();
      expect(screen.getByText("Input cannot be empty")).toBeInTheDocument();
    });

    it("keeps a conversation agent's tool call test on history, with no input", async () => {
      const user = setupUser();
      const onSubmit = jest.fn();
      render(
        <ControlledDialog
          {...baseProps({
            initialTab: "tool-invocation",
            agentNature: "conversation",
            onSubmit,
          })}
        />,
      );

      await user.click(screen.getByRole("button", { name: "Add tool" }));
      await waitFor(() =>
        expect(screen.getByText("Pick get_weather")).toBeInTheDocument(),
      );
      await user.click(screen.getByText("Pick get_weather"));

      await user.type(
        screen.getByPlaceholderText("Your test name"),
        "Weather tool test",
      );
      await user.type(
        screen.getByPlaceholderText("Expected value"),
        "Bangalore",
      );
      expect(
        screen.queryByPlaceholderText("Enter the input given to the agent"),
      ).not.toBeInTheDocument();
      const textareas = document.querySelectorAll("textarea[data-msg-id]");
      for (const ta of Array.from(textareas)) {
        await user.type(ta, "message");
      }

      await user.click(screen.getByRole("button", { name: "Create" }));

      expect(onSubmit).toHaveBeenCalledTimes(1);
      const [config] = onSubmit.mock.calls[0];
      expect(config.input).toBeUndefined();
      expect(Array.isArray(config.history)).toBe(true);
      expect(config.history.length).toBeGreaterThan(0);
      expect(config.evaluation.type).toBe("tool_call");
    });

    it("opens a saved tool call test that carries `input` on the input box, with no agentNature", async () => {
      const initialConfig: TestConfig = {
        input: "What is the weather in Bangalore?",
        evaluation: {
          type: "tool_call",
          tool_calls: [
            {
              tool: "get_weather",
              arguments: { city: { match_type: "exact", value: "Bangalore" } },
              accept_any_arguments: false,
            },
          ],
        },
      };
      render(
        <AddTestDialog
          {...baseProps({
            isEditing: true,
            initialTab: "tool-invocation",
            initialConfig,
            testName: "Saved general tool call test",
          })}
        />,
      );
      await waitFor(() =>
        expect(
          screen.getByDisplayValue("What is the weather in Bangalore?"),
        ).toBeInTheDocument(),
      );
      expect(document.querySelectorAll("textarea[data-msg-id]").length).toBe(0);
    });
  });
});
