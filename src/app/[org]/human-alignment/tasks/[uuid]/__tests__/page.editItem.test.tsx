/**
 * Editing an llm item through the real item dialog on the task page.
 */
import React from "react";
import { render, screen, setupUser, waitFor, within } from "@/test-utils";

jest.mock("next/navigation", () => ({
  __esModule: true,
  useRouter: () => ({ push: jest.fn(), replace: jest.fn(), back: jest.fn(), prefetch: jest.fn() }),
  usePathname: () => "/human-alignment/tasks/t-1",
  useSearchParams: () => new URLSearchParams("tab=items"),
  useParams: () => ({ uuid: "t-1" }),
  redirect: jest.fn(),
  notFound: jest.fn(),
}));

jest.mock("../../../../../../components/AppLayout", () => ({
  AppLayout: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  useHideFloatingButton: () => {},
}));

jest.mock("../../../../../../hooks", () => ({
  ...jest.requireActual("../../../../../../hooks"),
  useAccessToken: () => "test-token",
}));

jest.mock("jspdf", () => ({ jsPDF: class {} }));

jest.mock("../../../../../../components/ToolPicker", () => ({
  __esModule: true,
  getToolParams: jest.requireActual("../../../../../../components/ToolPicker")
    .getToolParams,
  ToolPicker: ({ onSelectCustomTool, availableTools }: any) => (
    <div>
      {availableTools.map((t: any) => (
        <button key={t.uuid} type="button" onClick={() => onSelectCustomTool(t)}>
          Pick {t.name}
        </button>
      ))}
    </div>
  ),
}));

const WEATHER = {
  uuid: "tool-weather",
  name: "get_weather",
  config: {
    parameters: {
      properties: { city: { type: "string" }, days: { type: "integer" } },
      required: ["city"],
    },
  },
};

const PAYLOAD = {
  name: "Weather check",
  chat_history: [{ role: "user", content: "Weather in Pune for 3 days?" }],
  agent_response: "",
  actual_tool_calls: [
    { tool: "get_weather", arguments: { city: "Pune", days: 3, metric: false } },
  ],
};

const mockApiCalls: { endpoint: string; options?: { method?: string; body?: unknown } }[] = [];

jest.mock("../../../../../../lib/api", () => ({
  ...jest.requireActual("../../../../../../lib/api"),
  apiClient: (endpoint: string, _token: string, options?: { method?: string; body?: unknown }) => {
    mockApiCalls.push({ endpoint, options });
    if (options?.method) return Promise.resolve({ updated_count: 1 });
    if (endpoint === "/annotation-tasks/t-1") {
      return Promise.resolve({
        uuid: "t-1",
        name: "Calls",
        type: "llm",
        evaluators: [
          { uuid: "ev-1", name: "Tone", evaluator_type: "llm", output_type: "binary", variables: [] },
        ],
        items: [],
      });
    }
    if (endpoint.startsWith("/annotation-tasks/t-1/summary")) {
      return Promise.resolve({
        task_id: "t-1",
        rows: [{ item_id: "i-1", payload: PAYLOAD }],
        evaluators: [],
        annotators: [],
        pagination: { total: 1, limit: 50, offset: 0 },
      });
    }
    return Promise.resolve([]);
  },
}));

import LabellingTaskPage from "../page";

const originalBackendUrl = process.env.NEXT_PUBLIC_BACKEND_URL;
beforeEach(() => {
  process.env.NEXT_PUBLIC_BACKEND_URL = "http://127.0.0.1:8000";
  global.fetch = jest.fn((url: string) =>
    Promise.resolve({
      ok: true,
      status: 200,
      json: async () =>
        String(url).includes("/tools") ? [WEATHER] : { items: [], total: 0 },
    }),
  ) as unknown as typeof fetch;
});
afterEach(() => {
  process.env.NEXT_PUBLIC_BACKEND_URL = originalBackendUrl;
});

it("keeps an added expected call while the name is typed, and saves the agent's calls as they were", async () => {
  const user = setupUser();
  render(<LabellingTaskPage />);
  await user.click(await screen.findByRole("button", { name: "Edit" }));
  await screen.findByDisplayValue("Weather in Pune for 3 days?");
  await waitFor(() =>
    expect(screen.getAllByText("get_weather").length).toBeGreaterThan(0),
  );

  await user.click(screen.getByRole("button", { name: "Add tool" }));
  await user.click(screen.getByRole("button", { name: "Pick get_weather" }));
  await user.type(screen.getByPlaceholderText("Expected value"), "Mumbai");

  const name = screen.getByDisplayValue("Weather check");
  await user.type(name, " v2");
  expect(screen.getByDisplayValue("Mumbai")).toBeInTheDocument();

  await user.click(screen.getByRole("button", { name: "Save" }));
  await waitFor(() =>
    expect(mockApiCalls.some((c) => c.options?.method === "PUT")).toBe(true),
  );
  const put = mockApiCalls.find((c) => c.options?.method === "PUT")!;
  const payload = JSON.parse(JSON.stringify(put.options?.body)).updates[0].payload;
  expect(payload.name).toBe("Weather check v2");
  expect(payload.chat_history).toEqual(PAYLOAD.chat_history);
  expect(payload.agent_response).toBe("");
  expect(payload.actual_tool_calls).toEqual(PAYLOAD.actual_tool_calls);
  expect(payload.expected_tool_calls).toEqual([
    {
      tool: "get_weather",
      arguments: { city: { match_type: "exact", value: "Mumbai" } },
      accept_any_arguments: false,
    },
  ]);
});
