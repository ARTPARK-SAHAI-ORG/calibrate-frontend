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

const WEATHER_TOOL = {
  uuid: "tool-weather",
  name: "get_weather",
  config: { parameters: { properties: { city: { type: "string" } } } },
  created_at: "2024-01-01T00:00:00Z",
  updated_at: "2024-01-01T00:00:00Z",
};
const RENAMED = { ...WEATHER_TOOL, name: "get_city_weather" };

// The tool side panel has its own tests. Here it only has to hand back the
// workspace list after a save, with the tool renamed.
jest.mock("../AddToolDialog", () => ({
  __esModule: true,
  AddToolDialog: ({
    onToolsUpdated,
    onClose,
  }: {
    onToolsUpdated: (tools: unknown[]) => void;
    onClose: () => void;
  }) => (
    <button
      type="button"
      onClick={() => {
        onToolsUpdated([RENAMED]);
        onClose();
      }}
    >
      Save renamed tool
    </button>
  ),
}));

jest.mock("../../lib/reportError", () => ({
  __esModule: true,
  reportError: jest.fn(),
}));

const originalBackendUrl = process.env.NEXT_PUBLIC_BACKEND_URL;

beforeEach(() => {
  process.env.NEXT_PUBLIC_BACKEND_URL = "http://127.0.0.1:8000";
  localStorage.setItem("access_token", "test-token");
  global.fetch = jest.fn((url: string) =>
    Promise.resolve(
      url.includes("/tools")
        ? { ok: true, status: 200, json: async () => [WEATHER_TOOL] }
        : url.includes("/evaluators")
          ? { ok: true, status: 200, json: async () => ({ items: [] }) }
          : { ok: false, status: 404, json: async () => ({}) },
    ),
  ) as unknown as typeof fetch;
});

afterEach(() => {
  process.env.NEXT_PUBLIC_BACKEND_URL = originalBackendUrl;
  localStorage.clear();
});

const baseProps = (
  overrides: Partial<Parameters<typeof AddTestDialog>[0]> = {},
) => ({
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
});

async function openAndRename(user: ReturnType<typeof setupUser>) {
  await user.click(
    await screen.findByRole("button", { name: "Open get_weather" }),
  );
  await user.click(screen.getByRole("button", { name: "Save renamed tool" }));
}

it("renames a tool already picked into Tools to test", async () => {
  const user = setupUser();
  render(<AddTestDialog {...baseProps({ initialTab: "tool-invocation" })} />);

  await user.click(screen.getByRole("button", { name: "Add tool" }));
  await user.click(await screen.findByText("get_weather"));
  expect(screen.getByText("get_weather")).toBeInTheDocument();

  // Opened from the Open button on the picked tool's card.
  await openAndRename(user);

  await waitFor(() =>
    expect(screen.getByText("get_city_weather")).toBeInTheDocument(),
  );
  expect(screen.queryByText("get_weather")).not.toBeInTheDocument();
});

it("renames a tool call already in the conversation", async () => {
  const user = setupUser();
  render(<AddTestDialog {...baseProps({ initialTab: "next-reply" })} />);

  await user.click(screen.getByLabelText("Add message"));
  await user.click(screen.getByText("Agent tool call"));
  await user.click(await screen.findByText("get_weather"));
  expect(screen.getByText("get_weather")).toBeInTheDocument();

  // Opened from the Open button on the tool call's card.
  await openAndRename(user);

  await waitFor(() =>
    expect(screen.getByText("get_city_weather")).toBeInTheDocument(),
  );
  expect(screen.queryByText("get_weather")).not.toBeInTheDocument();
});

it("renames a tool loaded from a saved test", async () => {
  const user = setupUser();
  const initialConfig: TestConfig = {
    history: [{ role: "user", content: "Weather in Delhi?" }],
    evaluation: {
      type: "tool_call",
      tool_calls: [{ tool: "get_weather", arguments: {}, is_called: true }],
    },
  };
  render(
    <AddTestDialog
      {...baseProps({
        isEditing: true,
        initialTab: "tool-invocation",
        initialConfig,
        testName: "Existing",
      })}
    />,
  );

  await waitFor(() =>
    expect(screen.getByText("get_weather")).toBeInTheDocument(),
  );
  // Opened from the Open button on the tool call's card.
  await openAndRename(user);

  await waitFor(() =>
    expect(screen.getByText("get_city_weather")).toBeInTheDocument(),
  );
  expect(screen.queryByText("get_weather")).not.toBeInTheDocument();
});

it("opens a tool from the tool list as well as from a card", async () => {
  const user = setupUser();
  render(<AddTestDialog {...baseProps({ initialTab: "next-reply" })} />);

  await user.click(screen.getByLabelText("Add message"));
  await user.click(screen.getByText("Agent tool call"));
  await openAndRename(user);
  await waitFor(() =>
    expect(screen.getByText("get_city_weather")).toBeInTheDocument(),
  );
});

it("shows no Open button on a card whose tool is not in the workspace", async () => {
  const initialConfig: TestConfig = {
    history: [{ role: "user", content: "Hi" }],
    evaluation: {
      type: "tool_call",
      tool_calls: [{ tool: "deleted_tool", arguments: {}, is_called: true }],
    },
  };
  render(
    <AddTestDialog
      {...baseProps({
        isEditing: true,
        initialTab: "tool-invocation",
        initialConfig,
        testName: "Existing",
      })}
    />,
  );
  await waitFor(() =>
    expect(screen.getByText("deleted_tool")).toBeInTheDocument(),
  );
  expect(
    screen.queryByRole("button", { name: "Open deleted_tool" }),
  ).not.toBeInTheDocument();
});
