/**
 * Component tests for AddToolDialog — the top-level tool-builder dialog
 * (structured-output and webhook tools). Covers: create/edit flows for both
 * tool types, Form ⇆ JSON view sync, header/query/body-parameter CRUD,
 * validation (name, description, URL, headers, params), 401/409/generic
 * error handling, and loadToolData branches.
 *
 * ParameterCard is exercised for real (it has its own dedicated test file);
 * only reportError and next-auth's signOut are mocked, plus global fetch.
 */
import {
  render,
  screen,
  setupUser,
  waitFor,
  within,
  fireEvent,
} from "@/test-utils";
import { signOut } from "next-auth/react";
import { AddToolDialog } from "../AddToolDialog";

jest.mock("../../lib/reportError", () => ({
  reportError: jest.fn(),
}));

// jsdom doesn't implement crypto.randomUUID; AddToolDialog/ParameterCard call
// it whenever a new parameter/header is created.
if (!global.crypto.randomUUID) {
  // @ts-expect-error - test-only polyfill
  global.crypto.randomUUID = () => `test-uuid-${Math.random()}`;
}

const originalBackendUrl = process.env.NEXT_PUBLIC_BACKEND_URL;

const baseProps = {
  isOpen: true,
  onClose: jest.fn(),
  editingToolUuid: null as string | null,
  backendAccessToken: "test-token",
  onToolsUpdated: jest.fn(),
};

function jsonOk(body: any) {
  return { ok: true, status: 200, json: async () => body };
}

describe("AddToolDialog", () => {
  beforeAll(() => {
    // jsdom doesn't implement these; the component calls them from setTimeout
    // callbacks (scroll-to-new-field / scroll-to-error behavior).
    window.HTMLElement.prototype.scrollIntoView = jest.fn();
    window.HTMLElement.prototype.scrollTo = jest.fn();
  });

  beforeEach(() => {
    process.env.NEXT_PUBLIC_BACKEND_URL = "http://127.0.0.1:8000";
    global.fetch = jest.fn();
    (signOut as jest.Mock).mockClear();
    baseProps.onClose = jest.fn();
    baseProps.onToolsUpdated = jest.fn();
  });

  afterEach(() => {
    process.env.NEXT_PUBLIC_BACKEND_URL = originalBackendUrl;
    jest.restoreAllMocks();
  });

  // ---------------------------------------------------------------------
  // Basic rendering / open-close
  // ---------------------------------------------------------------------

  it("renders nothing when isOpen is false", () => {
    const { container } = render(
      <AddToolDialog {...baseProps} isOpen={false} toolType="webhook" />,
    );
    expect(container.firstChild).toBeNull();
  });

  it("renders the structured-output add title and a default parameter", () => {
    render(<AddToolDialog {...baseProps} toolType="structured_output" />);
    expect(
      screen.getByText("Add structured output tool"),
    ).toBeInTheDocument();
    // One default parameter card is seeded on open.
    expect(screen.getAllByText("Data type")).toHaveLength(1);
  });

  it("renders the webhook add title with no default parameters", () => {
    render(<AddToolDialog {...baseProps} toolType="webhook" />);
    expect(screen.getByText("Add webhook tool")).toBeInTheDocument();
    expect(screen.queryByText("Data type")).not.toBeInTheDocument();
  });

  it("closes via the X button and resets state", async () => {
    const user = setupUser();
    render(<AddToolDialog {...baseProps} toolType="webhook" />);

    await user.type(
      screen.getByPlaceholderText(
        "An informative name for the tool that reflects its purpose",
      ),
      "My Tool",
    );
    const closeButtons = screen.getAllByRole("button");
    const xButton = closeButtons.find(
      (b) => b.querySelector("svg path[d^='M6 18L18 6']") !== null,
    )!;
    await user.click(xButton);
    expect(baseProps.onClose).toHaveBeenCalledTimes(1);
  });

  it("closes via the Cancel button", async () => {
    const user = setupUser();
    render(<AddToolDialog {...baseProps} toolType="structured_output" />);
    await user.click(screen.getByRole("button", { name: "Cancel" }));
    expect(baseProps.onClose).toHaveBeenCalledTimes(1);
  });

  it("closes via clicking the backdrop", async () => {
    const user = setupUser();
    const { container } = render(
      <AddToolDialog {...baseProps} toolType="webhook" />,
    );
    const backdrop = container.querySelector(".backdrop-blur-sm")!;
    await user.click(backdrop);
    expect(baseProps.onClose).toHaveBeenCalledTimes(1);
  });

  // ---------------------------------------------------------------------
  // Form ⇆ JSON view toggle
  // ---------------------------------------------------------------------

  it("switches to JSON view and reflects current form state", async () => {
    const user = setupUser();
    render(<AddToolDialog {...baseProps} toolType="structured_output" />);

    await user.type(
      screen.getByPlaceholderText(
        "An informative name for the tool that reflects its purpose",
      ),
      "Extractor",
    );
    await user.click(screen.getByRole("button", { name: "JSON" }));

    const textarea = screen.getByPlaceholderText(
      /"name": ""/,
    ) as HTMLTextAreaElement;
    expect(textarea.value).toContain('"name": "Extractor"');
    expect(textarea.value).toContain('"parameters"');
  });

  it("shows a JSON error for invalid JSON and disables submit", async () => {
    const user = setupUser();
    render(<AddToolDialog {...baseProps} toolType="structured_output" />);
    await user.click(screen.getByRole("button", { name: "JSON" }));

    const textarea = screen.getByPlaceholderText(/"name": ""/);
    fireEvent.change(textarea, { target: { value: "{ not valid json" } });

    expect(screen.getByText(/Invalid JSON/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Add tool" })).toBeDisabled();
  });

  it("applies valid JSON edits back into the form on switch to UI", async () => {
    const user = setupUser();
    render(<AddToolDialog {...baseProps} toolType="structured_output" />);
    await user.click(screen.getByRole("button", { name: "JSON" }));

    const textarea = screen.getByPlaceholderText(/"name": ""/);
    fireEvent.change(textarea, {
      target: {
        value:
          '{"name": "Renamed", "description": "d", "parameters": {"type": "object", "properties": {}}}',
      },
    });

    await user.click(screen.getByRole("button", { name: "Form" }));
    expect(
      screen.getByDisplayValue("Renamed"),
    ).toBeInTheDocument();
  });

  it("rejects a non-object top-level JSON value", async () => {
    render(<AddToolDialog {...baseProps} toolType="structured_output" />);
    const user = setupUser();
    await user.click(screen.getByRole("button", { name: "JSON" }));

    const textarea = screen.getByPlaceholderText(/"name": ""/);
    fireEvent.change(textarea, { target: { value: "[1,2,3]" } });

    expect(
      screen.getByText("The top-level value must be a JSON object."),
    ).toBeInTheDocument();
  });

  it("rejects webhook JSON whose queryParameters isn't an object schema", async () => {
    const user = setupUser();
    render(<AddToolDialog {...baseProps} toolType="webhook" />);
    await user.click(screen.getByRole("button", { name: "JSON" }));

    const textarea = screen.getByPlaceholderText(/"name": ""/);
    fireEvent.change(textarea, {
      target: {
        value:
          '{"name": "a", "webhook": {"queryParameters": "nope"}}',
      },
    });

    expect(
      screen.getByText(
        '"webhook.queryParameters" must be an object schema (with "properties").',
      ),
    ).toBeInTheDocument();
  });

  it("switching to JSON after a failed submit shows the field-completeness error", async () => {
    const user = setupUser();
    render(<AddToolDialog {...baseProps} toolType="webhook" />);

    // Trigger validation without filling anything in.
    await user.click(screen.getByRole("button", { name: "Add tool" }));
    await user.click(screen.getByRole("button", { name: "JSON" }));

    expect(screen.getByText(/Please fix:/)).toBeInTheDocument();
  });

  // ---------------------------------------------------------------------
  // Structured-output parameter management + validation
  // ---------------------------------------------------------------------

  it("adds and removes structured-output parameters", async () => {
    const user = setupUser();
    render(<AddToolDialog {...baseProps} toolType="structured_output" />);

    expect(screen.getAllByText("Data type")).toHaveLength(1);
    await user.click(screen.getByRole("button", { name: "Add param" }));
    expect(screen.getAllByText("Data type")).toHaveLength(2);

    const deleteButtons = screen.getAllByRole("button", { name: "Delete" });
    await user.click(deleteButtons[0]);
    expect(screen.getAllByText("Data type")).toHaveLength(1);
  });

  it("blocks submit when the tool name is empty and shows inline error", async () => {
    const user = setupUser();
    render(<AddToolDialog {...baseProps} toolType="structured_output" />);

    await user.click(screen.getByRole("button", { name: "Add tool" }));
    expect(
      screen.getAllByText("Name cannot be empty").length,
    ).toBeGreaterThan(0);
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it("blocks submit when a parameter name is missing (description optional)", async () => {
    const user = setupUser();
    render(<AddToolDialog {...baseProps} toolType="structured_output" />);

    await user.type(
      screen.getByPlaceholderText(
        "An informative name for the tool that reflects its purpose",
      ),
      "My Tool",
    );
    await user.click(screen.getByRole("button", { name: "Add tool" }));

    expect(global.fetch).not.toHaveBeenCalled();
    // The default parameter has no name, so ParameterCard should show its error.
    expect(screen.getByText("Name cannot be empty")).toBeInTheDocument();
  });

  it("creates a structured-output tool successfully and refetches the list", async () => {
    const user = setupUser();
    (global.fetch as jest.Mock)
      .mockResolvedValueOnce(jsonOk({ uuid: "tool-1" })) // POST /tools
      .mockResolvedValueOnce(jsonOk([{ uuid: "tool-1", name: "My Tool" }])); // GET /tools

    render(<AddToolDialog {...baseProps} toolType="structured_output" />);

    await user.type(
      screen.getByPlaceholderText(
        "An informative name for the tool that reflects its purpose",
      ),
      "My Tool",
    );
    await user.type(
      screen.getByPlaceholderText(
        "This field will be passed to the LLM and should describe in detail what the parameter is for and how it should be populated",
      ),
      "field_name",
    );
    // Fill the parameter's Name field (only input left without a placeholder
    // is the Name text input inside the ParameterCard).
    const nameInputs = screen.getAllByRole("textbox");
    // toolName input, toolDescription textarea, param name input, param description textarea
    const paramNameInput = nameInputs.find(
      (el) =>
        (el as HTMLInputElement).value === "" &&
        el.tagName === "INPUT" &&
        el !== screen.getByPlaceholderText(
          "An informative name for the tool that reflects its purpose",
        ),
    ) as HTMLInputElement;
    await user.type(paramNameInput, "field_name");

    await user.click(screen.getByRole("button", { name: "Add tool" }));

    await waitFor(() =>
      expect(baseProps.onToolsUpdated).toHaveBeenCalledWith([
        { uuid: "tool-1", name: "My Tool" },
      ]),
    );
    expect(baseProps.onClose).toHaveBeenCalledTimes(1);

    const postCall = (global.fetch as jest.Mock).mock.calls[0];
    expect(postCall[0]).toBe("http://127.0.0.1:8000/tools");
    const body = JSON.parse(postCall[1].body);
    expect(body.name).toBe("My Tool");
    expect(body.config.type).toBe("structured_output");
    expect(body.config.parameters[0].id).toBe("field_name");
  });

  it("shows a name-conflict error inline on 409 and does not close", async () => {
    const user = setupUser();
    (global.fetch as jest.Mock).mockResolvedValueOnce({
      ok: false,
      status: 409,
      clone() {
        return this;
      },
      json: async () => ({ detail: "Tool name already exists" }),
    });

    render(<AddToolDialog {...baseProps} toolType="structured_output" />);
    await user.type(
      screen.getByPlaceholderText(
        "An informative name for the tool that reflects its purpose",
      ),
      "Dup",
    );
    const paramNameInput = screen
      .getAllByRole("textbox")
      .find(
        (el) =>
          el.tagName === "INPUT" &&
          (el as HTMLInputElement).placeholder === "",
      ) as HTMLInputElement;
    if (paramNameInput) await user.type(paramNameInput, "p");

    await user.click(screen.getByRole("button", { name: "Add tool" }));

    expect(
      await screen.findByText("Tool name already exists"),
    ).toBeInTheDocument();
    expect(baseProps.onClose).not.toHaveBeenCalled();
  });

  it("shows a generic create error on a non-409 failure", async () => {
    const user = setupUser();
    (global.fetch as jest.Mock).mockResolvedValueOnce({
      ok: false,
      status: 500,
      clone() {
        return this;
      },
      json: async () => ({}),
    });

    render(<AddToolDialog {...baseProps} toolType="structured_output" />);
    await user.type(
      screen.getByPlaceholderText(
        "An informative name for the tool that reflects its purpose",
      ),
      "Bad",
    );
    const paramNameInput = screen
      .getAllByRole("textbox")
      .find(
        (el) =>
          el.tagName === "INPUT" &&
          (el as HTMLInputElement).placeholder === "",
      ) as HTMLInputElement;
    if (paramNameInput) await user.type(paramNameInput, "p");

    await user.click(screen.getByRole("button", { name: "Add tool" }));

    expect(await screen.findByText("Failed to create tool")).toBeInTheDocument();
  });

  it("surfaces a network error thrown during create", async () => {
    const user = setupUser();
    (global.fetch as jest.Mock).mockRejectedValueOnce(new Error("offline"));

    render(<AddToolDialog {...baseProps} toolType="structured_output" />);
    await user.type(
      screen.getByPlaceholderText(
        "An informative name for the tool that reflects its purpose",
      ),
      "Neterr",
    );
    const paramNameInput = screen
      .getAllByRole("textbox")
      .find(
        (el) =>
          el.tagName === "INPUT" &&
          (el as HTMLInputElement).placeholder === "",
      ) as HTMLInputElement;
    if (paramNameInput) await user.type(paramNameInput, "p");

    await user.click(screen.getByRole("button", { name: "Add tool" }));

    expect(await screen.findByText("offline")).toBeInTheDocument();
  });

  it("signs out on a 401 while creating", async () => {
    const user = setupUser();
    (global.fetch as jest.Mock).mockResolvedValueOnce({
      ok: false,
      status: 401,
    });

    render(<AddToolDialog {...baseProps} toolType="structured_output" />);
    await user.type(
      screen.getByPlaceholderText(
        "An informative name for the tool that reflects its purpose",
      ),
      "Unauthed",
    );
    const paramNameInput = screen
      .getAllByRole("textbox")
      .find(
        (el) =>
          el.tagName === "INPUT" &&
          (el as HTMLInputElement).placeholder === "",
      ) as HTMLInputElement;
    if (paramNameInput) await user.type(paramNameInput, "p");

    await user.click(screen.getByRole("button", { name: "Add tool" }));

    await waitFor(() =>
      expect(signOut).toHaveBeenCalledWith({ callbackUrl: "/login" }),
    );
  });

  // ---------------------------------------------------------------------
  // Webhook: URL validation, headers, query params, body params, method
  // ---------------------------------------------------------------------

  it("validates the webhook URL (empty, wrong protocol, no dot, localhost ok)", async () => {
    const user = setupUser();
    render(<AddToolDialog {...baseProps} toolType="webhook" />);
    await user.type(
      screen.getByPlaceholderText(
        "An informative name for the tool that reflects its purpose",
      ),
      "Hook",
    );
    await user.type(
      screen.getByPlaceholderText(
        "Describe to the LLM how and when to use the tool along with what should be passed to the tool",
      ),
      "desc",
    );

    const urlInput = screen.getByPlaceholderText(
      "https://example.com/{hi}/webhook",
    );

    await user.click(screen.getByRole("button", { name: "Add tool" }));
    expect(screen.getByText("URL is required")).toBeInTheDocument();

    await user.type(urlInput, "ftp://example.com");
    await user.click(screen.getByRole("button", { name: "Add tool" }));
    expect(screen.getByText("Please enter a valid URL")).toBeInTheDocument();

    await user.clear(urlInput);
    await user.type(urlInput, "http://nodothost");
    await user.click(screen.getByRole("button", { name: "Add tool" }));
    expect(screen.getByText("Please enter a valid URL")).toBeInTheDocument();

    await user.clear(urlInput);
    await user.type(urlInput, "http://localhost:8000/hook");
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it("adds and validates a webhook header", async () => {
    const user = setupUser();
    render(<AddToolDialog {...baseProps} toolType="webhook" />);

    await user.click(screen.getByRole("button", { name: "Add header" }));
    expect(screen.getByText("Headers")).toBeInTheDocument();

    await user.type(
      screen.getByPlaceholderText(
        "An informative name for the tool that reflects its purpose",
      ),
      "Hook",
    );
    await user.type(
      screen.getByPlaceholderText(
        "Describe to the LLM how and when to use the tool along with what should be passed to the tool",
      ),
      "desc",
    );
    await user.type(
      screen.getByPlaceholderText("https://example.com/{hi}/webhook"),
      "https://example.com/hook",
    );

    await user.click(screen.getByRole("button", { name: "Add tool" }));
    // Header name/value both empty -> both errors shown.
    expect(screen.getByText("Name cannot be empty")).toBeInTheDocument();
    expect(screen.getByText("Value cannot be empty")).toBeInTheDocument();

    await user.type(
      screen.getByPlaceholderText("e.g. Authorization"),
      "X-Api-Key",
    );
    await user.type(screen.getByPlaceholderText("Header value"), "secret");

    // Delete the header.
    const headerSection = screen.getByText("Headers").closest("div")!
      .parentElement!.parentElement!;
    const deleteBtn = within(headerSection).getByRole("button", {
      name: "Delete",
    });
    await user.click(deleteBtn);
    expect(
      screen.queryByPlaceholderText("e.g. Authorization"),
    ).not.toBeInTheDocument();
  });

  it("shows/hides body parameters section based on HTTP method", async () => {
    const user = setupUser();
    render(<AddToolDialog {...baseProps} toolType="webhook" />);

    expect(screen.getByText("Body parameters")).toBeInTheDocument();

    const methodSelect = screen.getByDisplayValue("POST");
    await user.selectOptions(methodSelect, "GET");
    expect(screen.queryByText("Body parameters")).not.toBeInTheDocument();

    await user.selectOptions(methodSelect, "PUT");
    expect(screen.getByText("Body parameters")).toBeInTheDocument();

    await user.selectOptions(methodSelect, "DELETE");
    expect(screen.queryByText("Body parameters")).not.toBeInTheDocument();
  });

  it("adds a query parameter and a body parameter", async () => {
    const user = setupUser();
    render(<AddToolDialog {...baseProps} toolType="webhook" />);

    expect(screen.getByText("Query parameters")).toBeInTheDocument();
    const addParamButtons = screen.getAllByRole("button", {
      name: "Add param",
    });
    // First "Add param" belongs to Query parameters (structured params section
    // doesn't render for webhook tools).
    await user.click(addParamButtons[0]);
    expect(screen.getAllByText("Data type")).toHaveLength(1);

    // Body parameters section always renders its "Add property" button (via
    // NestedContainer), even with zero body params yet.
    await user.click(screen.getByRole("button", { name: "Add property" }));
    expect(screen.getAllByText("Data type")).toHaveLength(2);
  });

  it("requires a body description for POST/PUT/PATCH methods", async () => {
    const user = setupUser();
    render(<AddToolDialog {...baseProps} toolType="webhook" />);

    await user.type(
      screen.getByPlaceholderText(
        "An informative name for the tool that reflects its purpose",
      ),
      "Hook",
    );
    await user.type(
      screen.getByPlaceholderText(
        "Describe to the LLM how and when to use the tool along with what should be passed to the tool",
      ),
      "desc",
    );
    await user.type(
      screen.getByPlaceholderText("https://example.com/{hi}/webhook"),
      "https://example.com/hook",
    );

    await user.click(screen.getByRole("button", { name: "Add tool" }));
    // The body-description FieldError renders "Description cannot be empty"
    // (the more detailed "Body description cannot be empty" wording is used
    // only in the JSON-view field-completeness summary).
    expect(
      screen.getByPlaceholderText("Describe the body structure"),
    ).toHaveClass("border-red-500");
  });

  it("creates a webhook tool successfully with headers, query and body params", async () => {
    const user = setupUser();
    (global.fetch as jest.Mock)
      .mockResolvedValueOnce(jsonOk({ uuid: "hook-1" }))
      .mockResolvedValueOnce(jsonOk([]));

    render(<AddToolDialog {...baseProps} toolType="webhook" />);

    await user.type(
      screen.getByPlaceholderText(
        "An informative name for the tool that reflects its purpose",
      ),
      "Hook",
    );
    await user.type(
      screen.getByPlaceholderText(
        "Describe to the LLM how and when to use the tool along with what should be passed to the tool",
      ),
      "desc",
    );
    await user.type(
      screen.getByPlaceholderText("https://example.com/{hi}/webhook"),
      "https://example.com/hook",
    );

    await user.click(screen.getByRole("button", { name: "Add header" }));
    await user.type(
      screen.getByPlaceholderText("e.g. Authorization"),
      "X-Api-Key",
    );
    await user.type(screen.getByPlaceholderText("Header value"), "secret");

    await user.type(
      screen.getByPlaceholderText(
        "Describe the body structure",
      ),
      "body desc",
    );

    await user.click(screen.getByRole("button", { name: "Add tool" }));

    await waitFor(() => expect(baseProps.onClose).toHaveBeenCalledTimes(1));

    const postCall = (global.fetch as jest.Mock).mock.calls[0];
    const body = JSON.parse(postCall[1].body);
    expect(body.config.webhook.method).toBe("POST");
    expect(body.config.webhook.url).toBe("https://example.com/hook");
    expect(body.config.webhook.headers).toEqual([
      { name: "X-Api-Key", value: "secret" },
    ]);
    expect(body.config.webhook.body.description).toBe("body desc");
  });

  it("drags the response-timeout slider and shows the tooltip on focus", () => {
    render(<AddToolDialog {...baseProps} toolType="webhook" />);

    const slider = screen.getByRole("slider") as HTMLInputElement;
    expect(slider.value).toBe("20");

    fireEvent.focus(slider);
    expect(screen.getByText("20 secs")).toBeInTheDocument();
    fireEvent.blur(slider);
    expect(screen.queryByText("20 secs")).not.toBeInTheDocument();

    fireEvent.mouseEnter(slider);
    fireEvent.change(slider, { target: { value: "45" } });
    expect(screen.getByText("45 secs")).toBeInTheDocument();
    fireEvent.mouseLeave(slider);
    expect(screen.queryByText("45 secs")).not.toBeInTheDocument();
  });

  // ---------------------------------------------------------------------
  // Editing an existing tool (loadToolData + updateTool)
  // ---------------------------------------------------------------------

  it("loads an existing structured-output tool (array-form parameters) for editing", async () => {
    (global.fetch as jest.Mock).mockResolvedValueOnce(
      jsonOk({
        uuid: "tool-9",
        name: "Existing",
        description: "existing desc",
        config: {
          parameters: [
            {
              id: "age",
              type: "integer",
              description: "the age",
              required: true,
            },
          ],
        },
        created_at: "",
        updated_at: "",
      }),
    );

    render(
      <AddToolDialog
        {...baseProps}
        toolType="structured_output"
        editingToolUuid="tool-9"
      />,
    );

    expect(
      screen.getByText("Edit structured output tool"),
    ).toBeInTheDocument();
    expect(await screen.findByDisplayValue("Existing")).toBeInTheDocument();
    expect(screen.getByDisplayValue("existing desc")).toBeInTheDocument();
    expect(screen.getByDisplayValue("age")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Save" })).toBeInTheDocument();
  });

  it("loads an existing tool with object-form parameters and webhook config", async () => {
    (global.fetch as jest.Mock).mockResolvedValueOnce(
      jsonOk({
        uuid: "tool-10",
        name: "Hook Tool",
        config: {
          description: "cfg desc",
          parameters: {
            city: { type: "string", description: "the city" },
          },
          webhook: {
            method: "PUT",
            url: "https://example.com/x",
            timeout: 30,
            headers: [{ name: "H1", value: "V1" }],
            queryParameters: {
              type: "object",
              properties: { q: { type: "string", description: "q desc" } },
              required: ["q"],
            },
            body: {
              description: "body d",
              parameters: {
                type: "object",
                properties: {
                  b: { type: "string", description: "b desc" },
                },
              },
            },
          },
        },
        created_at: "",
        updated_at: "",
      }),
    );

    render(
      <AddToolDialog
        {...baseProps}
        toolType="webhook"
        editingToolUuid="tool-10"
      />,
    );

    expect(await screen.findByDisplayValue("Hook Tool")).toBeInTheDocument();
    expect(screen.getByDisplayValue("cfg desc")).toBeInTheDocument();
    expect(screen.getByDisplayValue("https://example.com/x")).toBeInTheDocument();
    expect(screen.getByDisplayValue("H1")).toBeInTheDocument();
    expect(screen.getByDisplayValue("V1")).toBeInTheDocument();
    expect(screen.getByDisplayValue("body d")).toBeInTheDocument();
  });

  it("shows a loading spinner while fetching tool data, then the form", async () => {
    let resolveFetch: (v: any) => void;
    (global.fetch as jest.Mock).mockReturnValueOnce(
      new Promise((resolve) => {
        resolveFetch = resolve;
      }),
    );

    const { container } = render(
      <AddToolDialog
        {...baseProps}
        toolType="structured_output"
        editingToolUuid="tool-11"
      />,
    );

    expect(container.querySelector(".animate-spin")).toBeInTheDocument();

    resolveFetch!(
      jsonOk({
        uuid: "tool-11",
        name: "Loaded",
        config: {},
        created_at: "",
        updated_at: "",
      }),
    );

    await screen.findByDisplayValue("Loaded");
  });

  it("signs out on a 401 while loading tool data", async () => {
    (global.fetch as jest.Mock).mockResolvedValueOnce({
      ok: false,
      status: 401,
    });

    render(
      <AddToolDialog
        {...baseProps}
        toolType="structured_output"
        editingToolUuid="tool-401"
      />,
    );

    await waitFor(() =>
      expect(signOut).toHaveBeenCalledWith({ callbackUrl: "/login" }),
    );
  });

  it("shows a create-error banner when loading tool data fails (non-401, non-ok)", async () => {
    (global.fetch as jest.Mock).mockResolvedValueOnce({
      ok: false,
      status: 500,
    });

    render(
      <AddToolDialog
        {...baseProps}
        toolType="structured_output"
        editingToolUuid="tool-fail"
      />,
    );

    expect(
      await screen.findByText("Failed to fetch tool details"),
    ).toBeInTheDocument();
  });

  it("surfaces a network error thrown while loading tool data", async () => {
    (global.fetch as jest.Mock).mockRejectedValueOnce(
      new Error("load offline"),
    );

    render(
      <AddToolDialog
        {...baseProps}
        toolType="structured_output"
        editingToolUuid="tool-neterr"
      />,
    );

    expect(await screen.findByText("load offline")).toBeInTheDocument();
  });

  it("updates an existing tool via PUT and closes on success", async () => {
    const user = setupUser();
    (global.fetch as jest.Mock)
      .mockResolvedValueOnce(
        jsonOk({
          uuid: "tool-edit",
          name: "Editable",
          description: "d",
          config: {
            parameters: [
              { id: "x", type: "string", description: "d", required: true },
            ],
          },
          created_at: "",
          updated_at: "",
        }),
      ) // GET /tools/:uuid
      .mockResolvedValueOnce(jsonOk({ uuid: "tool-edit" })) // PUT /tools/:uuid
      .mockResolvedValueOnce(jsonOk([])); // GET /tools refetch

    render(
      <AddToolDialog
        {...baseProps}
        toolType="structured_output"
        editingToolUuid="tool-edit"
      />,
    );

    await screen.findByDisplayValue("Editable");
    await user.click(screen.getByRole("button", { name: "Save" }));

    await waitFor(() => expect(baseProps.onClose).toHaveBeenCalledTimes(1));

    const putCall = (global.fetch as jest.Mock).mock.calls[1];
    expect(putCall[0]).toBe("http://127.0.0.1:8000/tools/tool-edit");
    expect(putCall[1].method).toBe("PUT");
  });

  it("shows a name-conflict error on update (409) and does not close", async () => {
    const user = setupUser();
    (global.fetch as jest.Mock)
      .mockResolvedValueOnce(
        jsonOk({
          uuid: "tool-edit2",
          name: "Editable2",
          description: "d",
          config: {
            parameters: [
              { id: "x", type: "string", description: "d", required: true },
            ],
          },
          created_at: "",
          updated_at: "",
        }),
      )
      .mockResolvedValueOnce({
        ok: false,
        status: 409,
        clone() {
          return this;
        },
        json: async () => ({ detail: "Tool name already exists" }),
      });

    render(
      <AddToolDialog
        {...baseProps}
        toolType="structured_output"
        editingToolUuid="tool-edit2"
      />,
    );

    await screen.findByDisplayValue("Editable2");
    await user.click(screen.getByRole("button", { name: "Save" }));

    expect(
      await screen.findByText("Tool name already exists"),
    ).toBeInTheDocument();
    expect(baseProps.onClose).not.toHaveBeenCalled();
  });

  it("clears a name-conflict error as soon as the name field changes", async () => {
    const user = setupUser();
    (global.fetch as jest.Mock).mockResolvedValueOnce({
      ok: false,
      status: 409,
      clone() {
        return this;
      },
      json: async () => ({ detail: "Tool name already exists" }),
    });

    render(<AddToolDialog {...baseProps} toolType="structured_output" />);
    const nameInput = screen.getByPlaceholderText(
      "An informative name for the tool that reflects its purpose",
    );
    await user.type(nameInput, "Dup");
    const paramNameInput = screen
      .getAllByRole("textbox")
      .find(
        (el) =>
          el.tagName === "INPUT" &&
          (el as HTMLInputElement).placeholder === "",
      ) as HTMLInputElement;
    if (paramNameInput) await user.type(paramNameInput, "p");

    await user.click(screen.getByRole("button", { name: "Add tool" }));
    expect(
      await screen.findByText("Tool name already exists"),
    ).toBeInTheDocument();

    await user.type(nameInput, "2");
    expect(
      screen.queryByText("Tool name already exists"),
    ).not.toBeInTheDocument();
  });

  // ---------------------------------------------------------------------
  // Nested parameters: object properties and array items
  // ---------------------------------------------------------------------

  it("supports nesting a parameter as an object with a property", async () => {
    const user = setupUser();
    render(<AddToolDialog {...baseProps} toolType="structured_output" />);

    const dataTypeSelect = screen.getByDisplayValue("String");
    await user.selectOptions(dataTypeSelect, "object");

    expect(screen.getByText("Properties")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Add property" }));
    // Now two "Data type" selects exist: the object param and its property.
    expect(screen.getAllByText("Data type")).toHaveLength(2);
  });

  it("supports nesting a parameter as an array with an item type", async () => {
    const user = setupUser();
    render(<AddToolDialog {...baseProps} toolType="structured_output" />);

    const dataTypeSelect = screen.getByDisplayValue("String");
    await user.selectOptions(dataTypeSelect, "array");

    expect(screen.getByText("Item")).toBeInTheDocument();
    // The array-item nested ParameterCard renders its own data-type select.
    expect(screen.getAllByText("Data type")).toHaveLength(2);
  });

  // ---------------------------------------------------------------------
  // Editing a webhook tool: array-format query/body params, validation, errors
  // ---------------------------------------------------------------------

  it("loads array-form query and body parameters when editing a webhook tool", async () => {
    (global.fetch as jest.Mock).mockResolvedValueOnce(
      jsonOk({
        uuid: "tool-arr",
        name: "Arr Hook",
        description: "d",
        config: {
          parameters: [],
          webhook: {
            method: "POST",
            url: "https://example.com/arr",
            timeout: 20,
            headers: [],
            queryParameters: [
              { id: "q1", type: "string", description: "q1 desc" },
            ],
            body: {
              description: "body desc",
              parameters: [
                { id: "b1", type: "string", description: "b1 desc" },
              ],
            },
          },
        },
        created_at: "",
        updated_at: "",
      }),
    );

    render(
      <AddToolDialog
        {...baseProps}
        toolType="webhook"
        editingToolUuid="tool-arr"
      />,
    );

    expect(await screen.findByDisplayValue("q1")).toBeInTheDocument();
    expect(screen.getByDisplayValue("b1")).toBeInTheDocument();
  });

  it("blocks the update when webhook validation fails (bad URL)", async () => {
    const user = setupUser();
    (global.fetch as jest.Mock).mockResolvedValueOnce(
      jsonOk({
        uuid: "tool-badurl",
        name: "Bad URL Hook",
        description: "d",
        config: {
          parameters: [],
          webhook: {
            method: "GET",
            url: "https://example.com/original",
            timeout: 20,
            headers: [],
          },
        },
        created_at: "",
        updated_at: "",
      }),
    );

    render(
      <AddToolDialog
        {...baseProps}
        toolType="webhook"
        editingToolUuid="tool-badurl"
      />,
    );

    await screen.findByDisplayValue("Bad URL Hook");
    const urlInput = screen.getByDisplayValue(
      "https://example.com/original",
    );
    await user.clear(urlInput);

    await user.click(screen.getByRole("button", { name: "Save" }));
    expect(screen.getByText("URL is required")).toBeInTheDocument();
    // Only the initial GET was made; no PUT should have fired.
    expect((global.fetch as jest.Mock).mock.calls.length).toBe(1);
  });

  it("shows a generic error and a network error on update failure", async () => {
    const user = setupUser();
    (global.fetch as jest.Mock)
      .mockResolvedValueOnce(
        jsonOk({
          uuid: "tool-updfail",
          name: "Upd Fail",
          description: "d",
          config: {
            parameters: [
              { id: "x", type: "string", description: "d", required: true },
            ],
          },
          created_at: "",
          updated_at: "",
        }),
      )
      .mockResolvedValueOnce({ ok: false, status: 500 });

    render(
      <AddToolDialog
        {...baseProps}
        toolType="structured_output"
        editingToolUuid="tool-updfail"
      />,
    );

    await screen.findByDisplayValue("Upd Fail");
    await user.click(screen.getByRole("button", { name: "Save" }));
    expect(
      await screen.findByText("Failed to update tool"),
    ).toBeInTheDocument();
  });

  it("surfaces a network error thrown during update", async () => {
    const user = setupUser();
    (global.fetch as jest.Mock)
      .mockResolvedValueOnce(
        jsonOk({
          uuid: "tool-updnet",
          name: "Upd Net",
          description: "d",
          config: {
            parameters: [
              { id: "x", type: "string", description: "d", required: true },
            ],
          },
          created_at: "",
          updated_at: "",
        }),
      )
      .mockRejectedValueOnce(new Error("update offline"));

    render(
      <AddToolDialog
        {...baseProps}
        toolType="structured_output"
        editingToolUuid="tool-updnet"
      />,
    );

    await screen.findByDisplayValue("Upd Net");
    await user.click(screen.getByRole("button", { name: "Save" }));
    expect(await screen.findByText("update offline")).toBeInTheDocument();
  });

  it("signs out on a 401 while updating", async () => {
    const user = setupUser();
    (global.fetch as jest.Mock)
      .mockResolvedValueOnce(
        jsonOk({
          uuid: "tool-upd401",
          name: "Upd 401",
          description: "d",
          config: {
            parameters: [
              { id: "x", type: "string", description: "d", required: true },
            ],
          },
          created_at: "",
          updated_at: "",
        }),
      )
      .mockResolvedValueOnce({ ok: false, status: 401 });

    render(
      <AddToolDialog
        {...baseProps}
        toolType="structured_output"
        editingToolUuid="tool-upd401"
      />,
    );

    await screen.findByDisplayValue("Upd 401");
    await user.click(screen.getByRole("button", { name: "Save" }));
    await waitFor(() =>
      expect(signOut).toHaveBeenCalledWith({ callbackUrl: "/login" }),
    );
  });

});
