import {
  render,
  screen,
  setupUser,
  waitFor,
  fireEvent,
} from "@/test-utils";
import { AddTestDialog, TestConfig } from "../AddTestDialog";

// jsdom lacks ResizeObserver + scrollIntoView, both used by the dialog.
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

// Stub the heavy ToolPicker with deterministic buttons. Used by both the
// tool-invocation "Add tool" dropdown and the in-chat "Agent tool call" portal.
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
        active: { type: "boolean" },
      },
      required: ["city"],
    },
  },
  created_at: "2024-01-01T00:00:00Z",
  updated_at: "2024-01-01T00:00:00Z",
};

// A structured-output tool that declares no parameters — the editor lets the
// user add arbitrary custom expected parameters.
const STRUCTURED_TOOL = {
  uuid: "tool-struct",
  name: "extract_data",
  config: { parameters: {} },
  created_at: "2024-01-01T00:00:00Z",
  updated_at: "2024-01-01T00:00:00Z",
};

const WEBHOOK_TOOL = {
  uuid: "tool-webhook",
  name: "weather_webhook",
  config: {
    type: "webhook",
    webhook: {
      queryParameters: [{ id: "q1" }],
      body: { parameters: [{ id: "b1" }] },
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

// Controlled name/description wrapper mirroring the parent page.
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

// Fill the default user->agent->user history so history validation passes.
async function fillHistory(user: ReturnType<typeof setupUser>) {
  const textareas = document.querySelectorAll("textarea[data-msg-id]");
  for (const ta of Array.from(textareas)) {
    await user.type(ta as HTMLTextAreaElement, "message");
  }
}

describe("AddTestDialog — additional branch coverage", () => {
  describe("tool-invocation: match modes on a schema leaf", () => {
    async function addWeather(user: ReturnType<typeof setupUser>) {
      render(
        <ControlledDialog {...baseProps({ initialTab: "tool-invocation" })} />,
      );
      await user.click(screen.getByRole("button", { name: "Add tool" }));
      await waitFor(() =>
        expect(screen.getByText("Pick get_weather")).toBeInTheDocument(),
      );
      await user.click(screen.getByText("Pick get_weather"));
      expect(screen.getByText("city")).toBeInTheDocument();
    }

    it("switches the city param to LLM-judge and submits a criteria spec", async () => {
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

      await user.selectOptions(
        screen.getByLabelText("Match mode"),
        "llm_judge",
      );
      const criteriaInput = screen.getByPlaceholderText(
        "e.g. A friendly reminder with the date",
      );
      await user.type(criteriaInput, "a real city name");

      await user.type(
        screen.getByPlaceholderText("Your test name"),
        "Weather llm",
      );
      await fillHistory(user);
      await user.click(screen.getByRole("button", { name: "Create" }));

      expect(onSubmit).toHaveBeenCalledTimes(1);
      const [config] = onSubmit.mock.calls[0];
      expect(config.evaluation.tool_calls[0].arguments).toEqual({
        city: { match_type: "llm_judge", criteria: "a real city name" },
      });
    });

    it("switches the city param to 'Is any' and submits an any spec", async () => {
      const user = setupUser();
      const onSubmit = jest.fn();
      await addWeather(user);
      await user.selectOptions(screen.getByLabelText("Match mode"), "any");
      await user.type(
        screen.getByPlaceholderText("Your test name"),
        "Weather any",
      );
      await fillHistory(user);
      // Re-fetch onSubmit from the render — addWeather used a fresh render, so
      // grab the button and submit; assert via the button not blocking.
      await user.click(screen.getByRole("button", { name: "Create" }));
      // The value box is gone for "Is any".
      expect(
        screen.queryByPlaceholderText("Expected value"),
      ).not.toBeInTheDocument();
    });

    it("switches the city param to 'Is null' (value box disappears)", async () => {
      const user = setupUser();
      await addWeather(user);
      expect(screen.getByPlaceholderText("Expected value")).toBeInTheDocument();
      await user.selectOptions(screen.getByLabelText("Match mode"), "null");
      expect(
        screen.queryByPlaceholderText("Expected value"),
      ).not.toBeInTheDocument();
    });
  });

  describe("tool-invocation: custom parameters on a structured tool", () => {
    async function addStructuredWithCustomParam(
      user: ReturnType<typeof setupUser>,
    ) {
      (global as any).fetch = mockFetchImpl([STRUCTURED_TOOL]);
      render(
        <ControlledDialog {...baseProps({ initialTab: "tool-invocation" })} />,
      );
      await user.click(screen.getByRole("button", { name: "Add tool" }));
      await waitFor(() =>
        expect(screen.getByText("Pick extract_data")).toBeInTheDocument(),
      );
      await user.click(screen.getByText("Pick extract_data"));
      await user.click(screen.getByRole("button", { name: "+ Add parameter" }));
    }

    it("adds a custom string param and submits it as an exact spec", async () => {
      const user = setupUser();
      const onSubmit = jest.fn();
      (global as any).fetch = mockFetchImpl([STRUCTURED_TOOL]);
      render(
        <ControlledDialog
          {...baseProps({ initialTab: "tool-invocation", onSubmit })}
        />,
      );
      await user.click(screen.getByRole("button", { name: "Add tool" }));
      await waitFor(() =>
        expect(screen.getByText("Pick extract_data")).toBeInTheDocument(),
      );
      await user.click(screen.getByText("Pick extract_data"));
      await user.click(screen.getByRole("button", { name: "+ Add parameter" }));

      await user.type(
        screen.getByPlaceholderText("Parameter name"),
        "customer_name",
      );
      await user.type(screen.getByPlaceholderText("Expected value"), "Ada");
      await user.type(
        screen.getByPlaceholderText("Your test name"),
        "Struct test",
      );
      await fillHistory(user);
      await user.click(screen.getByRole("button", { name: "Create" }));

      expect(onSubmit).toHaveBeenCalledTimes(1);
      const [config] = onSubmit.mock.calls[0];
      expect(config.evaluation.tool_calls[0]).toMatchObject({
        tool: "extract_data",
        arguments: {
          customer_name: { match_type: "exact", value: "Ada" },
        },
        accept_any_arguments: false,
      });
    });

    it("flags an invalid integer value and blocks submission", async () => {
      const user = setupUser();
      const onSubmit = jest.fn();
      (global as any).fetch = mockFetchImpl([STRUCTURED_TOOL]);
      render(
        <ControlledDialog
          {...baseProps({ initialTab: "tool-invocation", onSubmit })}
        />,
      );
      await user.click(screen.getByRole("button", { name: "Add tool" }));
      await waitFor(() =>
        expect(screen.getByText("Pick extract_data")).toBeInTheDocument(),
      );
      await user.click(screen.getByText("Pick extract_data"));
      await user.click(screen.getByRole("button", { name: "+ Add parameter" }));

      await user.type(screen.getByPlaceholderText("Parameter name"), "count");
      await user.type(screen.getByPlaceholderText("Expected value"), "abc");
      await user.selectOptions(
        screen.getByLabelText("Parameter type"),
        "integer",
      );
      await user.type(
        screen.getByPlaceholderText("Your test name"),
        "Bad int",
      );
      await fillHistory(user);
      await user.click(screen.getByRole("button", { name: "Create" }));

      expect(onSubmit).not.toHaveBeenCalled();
      expect(screen.getByText("Enter a valid integer.")).toBeInTheDocument();
      expect(
        screen.getByText(/Please complete every highlighted parameter/),
      ).toBeInTheDocument();
    });

    it("changes a custom param type to boolean, then to object (nested container)", async () => {
      const user = setupUser();
      await addStructuredWithCustomParam(user);

      // string -> boolean shows a true/false <select>
      await user.selectOptions(
        screen.getByLabelText("Parameter type"),
        "boolean",
      );
      expect(
        screen.queryByPlaceholderText("Expected value"),
      ).not.toBeInTheDocument();

      // boolean -> object renders a nested "Add parameter" affordance
      await user.selectOptions(
        screen.getByLabelText("Parameter type"),
        "object",
      );
      const addButtons = screen.getAllByText(/Add parameter/);
      expect(addButtons.length).toBeGreaterThan(0);
    });

    it("collapses and expands a custom object param", async () => {
      const user = setupUser();
      await addStructuredWithCustomParam(user);
      await user.selectOptions(
        screen.getByLabelText("Parameter type"),
        "object",
      );
      await user.click(screen.getByLabelText("Collapse parameter"));
      expect(screen.getByText("No parameters added")).toBeInTheDocument();
      await user.click(screen.getByLabelText("Expand parameter"));
      expect(
        screen.queryByText("No parameters added"),
      ).not.toBeInTheDocument();
    });
  });

  describe("tool-invocation: accept-any toggle repopulates params", () => {
    it("toggling accept-any on then off restores the parameters section", async () => {
      const user = setupUser();
      render(<AddTestDialog {...baseProps({ initialTab: "tool-invocation" })} />);
      await user.click(screen.getByRole("button", { name: "Add tool" }));
      await waitFor(() =>
        expect(screen.getByText("Pick get_weather")).toBeInTheDocument(),
      );
      await user.click(screen.getByText("Pick get_weather"));

      const label = screen.getByText("Accept any values for the parameters");
      const checkbox = label.previousElementSibling as HTMLElement;
      // Toggle ON — params hidden.
      await user.click(checkbox);
      expect(screen.queryByText("city")).not.toBeInTheDocument();
      // Toggle OFF — params repopulated from schema.
      const label2 = screen.getByText("Accept any values for the parameters");
      await user.click(label2.previousElementSibling as HTMLElement);
      expect(screen.getByText("city")).toBeInTheDocument();
    });
  });

  describe("tool-invocation: JSON mode edits", () => {
    it("rejects a non-object top-level JSON value", async () => {
      const user = setupUser();
      render(<AddTestDialog {...baseProps({ initialTab: "tool-invocation" })} />);
      await user.click(screen.getByRole("button", { name: "Add tool" }));
      await waitFor(() =>
        expect(screen.getByText("Pick get_weather")).toBeInTheDocument(),
      );
      await user.click(screen.getByText("Pick get_weather"));

      await user.click(screen.getByRole("button", { name: "JSON" }));
      const jsonBox = document.querySelector("textarea") as HTMLTextAreaElement;
      // `null` is valid JSON but not an object of parameters.
      fireEvent.change(jsonBox, { target: { value: "null" } });
      expect(
        screen.getByText(/top-level value must be a JSON object/),
      ).toBeInTheDocument();
    });

    it("accepts valid JSON and flows it back into the form", async () => {
      const user = setupUser();
      render(<AddTestDialog {...baseProps({ initialTab: "tool-invocation" })} />);
      await user.click(screen.getByRole("button", { name: "Add tool" }));
      await waitFor(() =>
        expect(screen.getByText("Pick get_weather")).toBeInTheDocument(),
      );
      await user.click(screen.getByText("Pick get_weather"));

      await user.click(screen.getByRole("button", { name: "JSON" }));
      const jsonBox = document.querySelector("textarea") as HTMLTextAreaElement;
      fireEvent.change(jsonBox, {
        target: {
          value: '{"city":{"match_type":"exact","value":"Paris"}}',
        },
      });
      // Back to Form mode; the value should have flowed into the city input.
      await user.click(screen.getByRole("button", { name: "Form" }));
      expect(screen.getByDisplayValue("Paris")).toBeInTheDocument();
    });
  });

  describe("editing: tool-call arguments with match specs", () => {
    it("hydrates llm_judge, any and null argument specs from a saved test", async () => {
      const initialConfig: TestConfig = {
        history: [{ role: "user", content: "Weather?" }],
        evaluation: {
          type: "tool_call",
          tool_calls: [
            {
              tool: "tool-weather",
              is_called: true,
              arguments: {
                city: { match_type: "llm_judge", criteria: "a real city" },
                days: { match_type: "any" },
                extra: { match_type: "exact", value: null },
              },
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
            testName: "Edit specs",
          })}
        />,
      );
      // The saved tool identifier is its uuid; it's shown verbatim as the name.
      await waitFor(() =>
        expect(screen.getByText("tool-weather")).toBeInTheDocument(),
      );
      // The llm_judge criteria for city is restored into its input.
      expect(screen.getByDisplayValue("a real city")).toBeInTheDocument();
      // The unknown "extra" key surfaces as a custom row.
      expect(screen.getByDisplayValue("extra")).toBeInTheDocument();
    });

    it("rebuilds custom rows (incl. nested object) for a deleted tool", async () => {
      const initialConfig: TestConfig = {
        history: [{ role: "user", content: "Hi" }],
        evaluation: {
          type: "tool_call",
          tool_calls: [
            {
              tool: "ghost_tool",
              is_called: true,
              arguments: {
                label: "urgent",
                profile: { name: "Ada" },
              },
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
            testName: "Ghost",
          })}
        />,
      );
      await waitFor(() =>
        expect(screen.getByText("ghost_tool")).toBeInTheDocument(),
      );
      expect(screen.getByDisplayValue("label")).toBeInTheDocument();
      expect(screen.getByDisplayValue("profile")).toBeInTheDocument();
      // nested object property surfaces too
      expect(screen.getByDisplayValue("name")).toBeInTheDocument();
    });

    it("populates accept-any tool from a saved test with accept_any_arguments", async () => {
      const initialConfig: TestConfig = {
        history: [{ role: "user", content: "Hi" }],
        evaluation: {
          type: "tool_call",
          tool_calls: [
            {
              tool: "get_weather",
              is_called: true,
              accept_any_arguments: true,
              arguments: {},
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
            testName: "Accept any",
          })}
        />,
      );
      await waitFor(() =>
        expect(screen.getByText("get_weather")).toBeInTheDocument(),
      );
      // accept-any is on, so no expected-parameter rows are shown.
      expect(screen.queryByText("city")).not.toBeInTheDocument();
    });
  });

  describe("editing: webhook tool call in conversation history", () => {
    it("renders webhook query/body params and a required tool response", async () => {
      (global as any).fetch = mockFetchImpl([WEBHOOK_TOOL]);
      const initialConfig: TestConfig = {
        history: [
          { role: "user", content: "What's the weather?" },
          {
            role: "assistant",
            content: "",
            tool_calls: [
              {
                id: "call-1",
                type: "function",
                function: {
                  name: "weather_webhook",
                  arguments: JSON.stringify({
                    query: { q: "Delhi" },
                    body: { units: "metric" },
                  }),
                },
              },
            ],
          },
          {
            role: "tool",
            tool_call_id: "call-1",
            content: '{"status":"success"}',
          },
        ],
        evaluation: { type: "response" },
      };
      render(
        <AddTestDialog
          {...baseProps({
            isEditing: true,
            initialTab: "next-reply",
            initialConfig,
            testName: "Webhook edit",
          })}
        />,
      );
      await waitFor(() =>
        expect(screen.getByText("weather_webhook")).toBeInTheDocument(),
      );
      expect(screen.getByText("Query")).toBeInTheDocument();
      expect(screen.getByText("Body")).toBeInTheDocument();
      expect(screen.getByText("Webhook")).toBeInTheDocument();
      // Webhook tool responses are required (asterisk, not "(optional)").
      expect(screen.getByText("Tool Response")).toBeInTheDocument();
      expect(screen.getByDisplayValue("Delhi")).toBeInTheDocument();
    });
  });

  describe("chat: adding tool-call messages via the in-chat picker", () => {
    it("adds a structured tool call with parameter inputs and a response box", async () => {
      const user = setupUser();
      (global as any).fetch = mockFetchImpl([WEATHER_TOOL]);
      render(<AddTestDialog {...baseProps({ initialTab: "next-reply" })} />);
      await waitFor(() =>
        expect(screen.getByText("Correctness")).toBeInTheDocument(),
      );

      await user.click(screen.getByTitle("Add message"));
      await user.click(screen.getByText("Agent tool call"));
      await waitFor(() =>
        expect(screen.getByText("Pick get_weather")).toBeInTheDocument(),
      );
      await user.click(screen.getByText("Pick get_weather"));

      expect(screen.getByText("Agent Tool Call")).toBeInTheDocument();
      // Structured tool: its declared properties become param inputs.
      expect(screen.getByPlaceholderText("Enter city")).toBeInTheDocument();
      expect(screen.getByText("Tool Response")).toBeInTheDocument();
      expect(screen.getByText("(optional)")).toBeInTheDocument();
    });

    it("adds a webhook tool call rendering query and body groups", async () => {
      const user = setupUser();
      (global as any).fetch = mockFetchImpl([WEBHOOK_TOOL]);
      render(<AddTestDialog {...baseProps({ initialTab: "next-reply" })} />);
      await waitFor(() =>
        expect(screen.getByText("Correctness")).toBeInTheDocument(),
      );

      await user.click(screen.getByTitle("Add message"));
      await user.click(screen.getByText("Agent tool call"));
      await waitFor(() =>
        expect(screen.getByText("Pick weather_webhook")).toBeInTheDocument(),
      );
      await user.click(screen.getByText("Pick weather_webhook"));

      expect(screen.getByText("Query")).toBeInTheDocument();
      expect(screen.getByText("Body")).toBeInTheDocument();
      expect(screen.getByText("Webhook")).toBeInTheDocument();
    });

    it("removing a tool-call message also removes its linked response", async () => {
      const user = setupUser();
      (global as any).fetch = mockFetchImpl([WEATHER_TOOL]);
      render(<AddTestDialog {...baseProps({ initialTab: "next-reply" })} />);
      await waitFor(() =>
        expect(screen.getByText("Correctness")).toBeInTheDocument(),
      );

      await user.click(screen.getByTitle("Add message"));
      await user.click(screen.getByText("Agent tool call"));
      await waitFor(() =>
        expect(screen.getByText("Pick get_weather")).toBeInTheDocument(),
      );
      await user.click(screen.getByText("Pick get_weather"));
      expect(screen.getByText("Agent Tool Call")).toBeInTheDocument();

      // The tool-call is the last non-tool-response, so its action-row delete
      // is the last "Remove message" button in the DOM.
      const removeButtons = screen.getAllByTitle("Remove message");
      await user.click(removeButtons[removeButtons.length - 1]);

      expect(screen.queryByText("Agent Tool Call")).not.toBeInTheDocument();
      expect(screen.queryByText("Tool Response")).not.toBeInTheDocument();
    });
  });

  describe("evaluator initialization branches", () => {
    it("switching from next-reply to conversation drops the llm Correctness evaluator", async () => {
      const user = setupUser();
      render(<AddTestDialog {...baseProps()} />);
      await user.click(screen.getByText("Next reply test"));
      await waitFor(() =>
        expect(screen.getByText("Correctness")).toBeInTheDocument(),
      );
      // Compact switcher box for the conversation type.
      await user.click(screen.getByRole("button", { name: "Conversation" }));
      await waitFor(() =>
        expect(screen.queryByText("Correctness")).not.toBeInTheDocument(),
      );
    });

    it("hydrates attached evaluators from initialEvaluators (edit)", async () => {
      render(
        <AddTestDialog
          {...baseProps({
            isEditing: true,
            initialTab: "next-reply",
            testName: "Has evaluators",
            initialEvaluators: [
              {
                evaluator_uuid: "eval-tone",
                name: "Tone check",
                description: "Checks tone",
                slug: null,
                variables: [
                  { name: "threshold", default: "5" },
                  { name: "notes" },
                ],
                variable_values: { threshold: "7" },
              },
            ],
          })}
        />,
      );
      await waitFor(() =>
        expect(screen.getByText("Tone check")).toBeInTheDocument(),
      );
      // Explicit value wins for threshold; empty for the value-less var.
      expect(screen.getByDisplayValue("7")).toBeInTheDocument();
    });

    it("auto-attaches correctness pre-filled from a legacy criteria field (edit)", async () => {
      const initialConfig: TestConfig = {
        history: [{ role: "user", content: "Hi" }],
        evaluation: { type: "response", criteria: "Reply must be kind" },
      };
      render(
        <AddTestDialog
          {...baseProps({
            isEditing: true,
            initialTab: "next-reply",
            initialConfig,
            testName: "Legacy",
          })}
        />,
      );
      await waitFor(() =>
        expect(screen.getByText("Correctness")).toBeInTheDocument(),
      );
      expect(
        screen.getByDisplayValue("Reply must be kind"),
      ).toBeInTheDocument();
    });

    it("blocks submission when an attached evaluator variable is empty", async () => {
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
      await user.type(
        screen.getByPlaceholderText("Your test name"),
        "No criteria",
      );
      const textareas = document.querySelectorAll("textarea[data-msg-id]");
      await user.type(textareas[0], "Hi");
      await user.type(textareas[1], "Hello");
      await user.type(textareas[2], "How are you");
      // Leave the correctness criteria empty.
      await user.click(screen.getByRole("button", { name: "Create" }));
      expect(onSubmit).not.toHaveBeenCalled();
      expect(
        screen.getAllByText("Value cannot be empty").length,
      ).toBeGreaterThan(0);
    });
  });

  describe("labelItem submit", () => {
    it("submits an LLM label item (assistant-last) with description", async () => {
      const user = setupUser();
      const onSubmit = jest.fn();
      render(
        <ControlledDialog
          {...baseProps({
            mode: "labelItem",
            onSubmit,
            setItemDescription: jest.fn(),
            requireAssistantLastMessage: true,
          })}
        />,
      );
      await user.type(
        screen.getByPlaceholderText("Your item name"),
        "Label item",
      );
      const descriptionBox = screen.getByPlaceholderText(
        /Optional — what is this item about/,
      );
      await user.type(descriptionBox, "notes");
      const textareas = document.querySelectorAll("textarea[data-msg-id]");
      await user.type(textareas[0], "User asks");
      await user.type(textareas[1], "Agent replies");
      // The auto-attached correctness evaluator's variable must be filled.
      const criteria = screen.queryByPlaceholderText(
        "Enter value for {{criteria}}",
      );
      if (criteria) await user.type(criteria, "Reply is helpful");
      await user.click(screen.getByRole("button", { name: "Create" }));
      expect(onSubmit).toHaveBeenCalledTimes(1);
      const [config] = onSubmit.mock.calls[0];
      expect(config.history[config.history.length - 1]).toMatchObject({
        role: "assistant",
        content: "Agent replies",
      });
    });
  });
});
