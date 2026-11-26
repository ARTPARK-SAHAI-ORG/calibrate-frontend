/**
 * The Score reliability section on a labelling task's Overview tab. The page
 * chrome is stubbed so only the tab runs.
 */
import React from "react";
import { render, screen, setupUser, waitFor, within } from "@/test-utils";

let mockSearch = "tab=overview";

jest.mock("next/navigation", () => ({
  __esModule: true,
  useRouter: () => ({ push: jest.fn(), replace: jest.fn(), back: jest.fn(), prefetch: jest.fn() }),
  usePathname: () => "/human-alignment/tasks/t-1",
  useSearchParams: () => new URLSearchParams(mockSearch),
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


// The item dialogs have their own tests. Here they only hand back what the
// page passed them, so a test can call their onSubmit directly.
const mockDialogProps: { llm: any[]; general: any[]; assign: any[]; manage: any[] } = {
  llm: [],
  general: [],
  assign: [],
  manage: [],
};
jest.mock("../../../../../../components/human-labelling/ManageEvaluatorsDialog", () => ({
  ManageEvaluatorsDialog: (props: unknown) => {
    mockDialogProps.manage.push(props);
    return null;
  },
}));
jest.mock("../../../../../../components/human-labelling/AssignAnnotatorsDialog", () => ({
  AssignAnnotatorsDialog: (props: unknown) => {
    mockDialogProps.assign.push(props);
    return null;
  },
}));
jest.mock("../../../../../../components/AddTestDialog", () => ({
  AddTestDialog: (props: unknown) => {
    mockDialogProps.llm.push(props);
    return null;
  },
}));
jest.mock("../../../../../../components/human-labelling/AddLlmGeneralItemsDialog", () => ({
  AddLlmGeneralItemsDialog: (props: unknown) => {
    mockDialogProps.general.push(props);
    return null;
  },
}));

const mockExportProps: { getRows: () => Promise<any> }[] = [];
jest.mock("../../../../../../components/ExportResultsButton", () => ({
  ...jest.requireActual("../../../../../../components/ExportResultsButton"),
  ExportResultsButton: (props: { getRows: () => Promise<any> }) => {
    mockExportProps.push(props);
    return null;
  },
}));

const mockToastError = jest.fn();
jest.mock("sonner", () => ({
  __esModule: true,
  toast: { error: (...args: unknown[]) => mockToastError(...args), success: jest.fn() },
}));

// The bulk upload dialogs build sample PDFs; nothing here downloads one.
jest.mock("jspdf", () => ({ jsPDF: class {} }));

const TASK = {
  uuid: "t-1",
  name: "Calls",
  type: "llm",
  evaluators: [
    { uuid: "ev-1", name: "Tone", evaluator_type: "llm", output_type: "binary" },
    { uuid: "ev-2", name: "Brevity", evaluator_type: "llm", output_type: "binary" },
  ],
};

const AGREEMENT = {
  human_human: { current: 0.7, pair_count: 6 },
  evaluators_with_humans: { current: 0.85, pair_count: 8 },
  evaluators: [
    {
      evaluator_id: "ev-1",
      name: "Tone",
      current: 0.9,
      pair_count: 4,
      kappa: 0.5,
      kappa_type: "cohen",
      inter_annotator: { current: 0.75, pair_count: 3 },
      result: { count: 4, true_count: 3 },
    },
    {
      evaluator_id: "ev-2",
      name: "Brevity",
      current: 0.8,
      pair_count: 4,
      kappa: 0.2,
      kappa_type: "cohen",
      inter_annotator: { current: 0.6, pair_count: 3 },
      result: { count: 4, true_count: 2 },
    },
  ],
};

let mockAgreement: unknown = AGREEMENT;
let mockTask: unknown = TASK;
let mockSummary: unknown = {
  items: [],
  rows: [],
  evaluators: [],
  annotators: [],
  pagination: { total: 0, limit: 50, offset: 0 },
};
const mockApiCalls: { endpoint: string; options?: { method?: string; body?: unknown } }[] = [];

jest.mock("../../../../../../lib/api", () => ({
  ...jest.requireActual("../../../../../../lib/api"),
  apiClient: (endpoint: string, _token: string, options?: { method?: string; body?: unknown }) => {
    mockApiCalls.push({ endpoint, options });
    if (options?.method === "POST") return Promise.resolve({ job_uuid: "job-1" });
    if (endpoint === "/annotation-tasks/t-1/evaluators") {
      return Promise.resolve(
        ["ev-1", "ev-tc"].map((uuid) => ({
          uuid,
          versions: [{ uuid: `${uuid}-v1`, version_number: 1 }],
          live_version_id: `${uuid}-v1`,
        })),
      );
    }
    return Promise.resolve(
      endpoint === "/annotation-tasks/t-1"
        ? mockTask
        : endpoint === "/annotation-tasks/t-1/agreement"
          ? mockAgreement
          : endpoint.startsWith("/annotation-tasks/t-1/summary")
            ? mockSummary
            : endpoint === "/annotation-tasks/t-1/evaluator-runs"
              ? { runs: [], evaluators: [] }
              : [],
    );
  },
}));

import LabellingTaskPage from "../page";

it("shows Score reliability as the Overview's cards and table, one row per linked evaluator", async () => {
  render(<LabellingTaskPage />);
  const section = (await screen.findByText("Score reliability")).closest(
    "section",
  ) as HTMLElement;
  const card = (label: string) =>
    within(section)
      .getAllByText(label)
      .find((el) => el.closest("span.rounded-md"))!
      .closest(".rounded-lg") as HTMLElement;
  expect(card("Annotator agreement")).toHaveTextContent(
    "Annotator agreement70%",
  );
  expect(card("Evaluator agreement with humans")).toHaveTextContent(
    "Evaluator agreement with humans85%",
  );
  const table = within(section)
    .getByRole("button", { name: /^Evaluator$/ })
    .closest(".md\\:block") as HTMLElement;
  const rows = [...table.querySelectorAll(".grid")].slice(1) as HTMLElement[];
  // Highest agreement with humans first, the sort the Overview starts on.
  expect(rows.map((r) => within(r).getAllByRole("button")[0].textContent)).toEqual([
    "Tone",
    "Brevity",
  ]);
  expect(rows[0]).toHaveTextContent("75%");
  expect(rows[0]).toHaveTextContent("90%");
});

it("says what is missing when Score reliability has no number yet", async () => {
  // One annotator, and no score from the evaluator's live version.
  mockAgreement = {
    human_human: { current: null, pair_count: 0 },
    evaluators_with_humans: { current: null, pair_count: 0 },
    evaluators: [
      {
        evaluator_id: "ev-1",
        name: "Tone",
        current: null,
        pair_count: 0,
        inter_annotator: { current: null, pair_count: 0 },
        result: null,
        human_result: { count: 4, true_count: 4 },
      },
    ],
  };
  render(<LabellingTaskPage />);
  const section = (await screen.findByText("Score reliability")).closest(
    "section",
  ) as HTMLElement;
  expect(within(section).getByText("No agreement yet")).toBeInTheDocument();
  expect(section).toHaveTextContent(
    "Annotator agreement appears once two annotators label the same items.",
  );
  expect(section).toHaveTextContent(
    "Evaluator agreement appears once the evaluator's live version is run on items annotators have labelled.",
  );
  mockAgreement = AGREEMENT;
});

it("offers only the evaluators that fit the chosen rows, and sends them to the run", async () => {
  const user = setupUser();
  mockSearch = "tab=items";
  mockTask = {
    ...TASK,
    evaluators: [
      { uuid: "ev-1", name: "Tone", evaluator_type: "llm", output_type: "binary" },
      { uuid: "ev-tc", name: "Tool call correctness", evaluator_type: "tool-call", output_type: "binary" },
    ],
    items: [
      {
        id: 1,
        uuid: "i-1",
        task_id: "t-1",
        payload: {},
        is_tool_call: true,
        created_at: "2026-01-01 00:00:00",
      },
    ],
  };
  mockSummary = {
    task_id: "t-1",
    rows: [
      {
        item_id: "i-1",
        payload: {
          name: "Books a flight",
          chat_history: [{ role: "user", content: "Book it" }],
          agent_response: "",
          actual_tool_calls: [{ tool: "book_flight", arguments: {} }],
        },
      },
    ],
    evaluators: [],
    annotators: [],
    pagination: { total: 1, limit: 50, offset: 0 },
  };
  render(<LabellingTaskPage />);
  const evaluate = await screen.findByRole("button", { name: "Evaluate" });
  expect(evaluate).toBeEnabled();
  await user.click(evaluate);
  const dialog = (await screen.findByText("Run evaluators")).closest(
    ".fixed",
  ) as HTMLElement;
  expect(within(dialog).getByText("Tool call correctness")).toBeInTheDocument();
  expect(within(dialog).queryByText("Tone")).not.toBeInTheDocument();
  const run = within(dialog).getByRole("button", { name: "Run" });
  await waitFor(() => expect(run).toBeEnabled());
  await user.click(run);
  await waitFor(() =>
    expect(
      mockApiCalls.find(
        (c) => c.endpoint === "/annotation-tasks/t-1/evaluator-runs" && c.options?.method === "POST",
      ),
    ).toBeTruthy(),
  );
  const post = mockApiCalls.find(
    (c) => c.endpoint === "/annotation-tasks/t-1/evaluator-runs" && c.options?.method === "POST",
  )!;
  expect(post.options?.body).toEqual({
    evaluators: [{ evaluator_id: "ev-tc", evaluator_version_id: "ev-tc-v1" }],
    item_ids: ["i-1"],
  });
});

it("says why and keeps Run evaluators closed when no linked evaluator fits the chosen items", async () => {
  const user = setupUser();
  mockSearch = "tab=items";
  mockTask = {
    ...TASK,
    evaluators: [{ uuid: "ev-1", name: "Tone", evaluator_type: "llm", output_type: "binary" }],
    items: [{ id: 1, uuid: "i-1", task_id: "t-1", payload: {}, is_tool_call: true, created_at: "2026-01-01 00:00:00" }],
  };
  mockSummary = {
    task_id: "t-1",
    rows: [
      {
        item_id: "i-1",
        payload: {
          name: "Books a flight",
          chat_history: [{ role: "user", content: "Book it" }],
          agent_response: "",
          actual_tool_calls: [{ tool: "book_flight", arguments: {} }],
        },
      },
    ],
    evaluators: [],
    annotators: [],
    pagination: { total: 1, limit: 50, offset: 0 },
  };
  render(<LabellingTaskPage />);
  await user.click(await screen.findByRole("button", { name: "Evaluate" }));
  expect(mockToastError).toHaveBeenCalledWith(
    "None of this task's evaluators fit the chosen items. Tool-call items need a tool-call evaluator, and every other item needs an evaluator that is not a tool-call evaluator.",
  );
  expect(screen.queryByText("Run evaluators")).not.toBeInTheDocument();
});

function itemsTabWith(type: string, payload: Record<string, unknown>) {
  mockSearch = "tab=items";
  mockApiCalls.length = 0;
  mockTask = { ...TASK, type, items: [] };
  mockSummary = {
    task_id: "t-1",
    rows: [{ item_id: "i-1", payload }],
    evaluators: [],
    annotators: [],
    pagination: { total: 1, limit: 50, offset: 0 },
  };
}

const putPayload = () => {
  const put = mockApiCalls.find(
    (c) => c.endpoint === "/annotation-tasks/t-1/items" && c.options?.method === "PUT",
  )!;
  const body = JSON.parse(JSON.stringify(put.options?.body));
  return body.updates[0].payload;
};

it("drops the old tool calls from an llm item edited to end on a text reply", async () => {
  const user = setupUser();
  itemsTabWith("llm", {
    name: "Books a flight",
    chat_history: [{ role: "user", content: "Book it" }],
    agent_response: "",
    actual_tool_calls: [{ tool: "book_flight", arguments: {} }],
    expected_tool_calls: [{ tool: "book_flight", arguments: {} }],
  });
  render(<LabellingTaskPage />);
  await user.click(await screen.findByRole("button", { name: "Edit" }));
  const props = mockDialogProps.llm.filter((p) => p.isEditing).at(-1);
  expect(props.initialConfig.evaluation.tool_calls).toEqual([
    { tool: "book_flight", arguments: {} },
  ]);
  await props.onSubmit(
    {
      history: [
        { role: "user", content: "Book it" },
        { role: "assistant", content: "Booked" },
      ],
      evaluation: { type: "response" },
    },
    [],
  );
  const payload = putPayload();
  expect(payload.agent_response).toBe("Booked");
  expect(payload).not.toHaveProperty("actual_tool_calls");
  expect(payload).not.toHaveProperty("expected_tool_calls");
});

it("drops the old tool calls from an llm-general item when the edit removes them", async () => {
  const user = setupUser();
  itemsTabWith("llm-general", {
    name: "Books a flight",
    input: "Book it",
    output: "",
    actual_tool_calls: [{ tool: "book_flight", arguments: {} }],
    expected_tool_calls: [{ tool: "book_flight", arguments: {} }],
  });
  render(<LabellingTaskPage />);
  await user.click(await screen.findByRole("button", { name: "Edit" }));
  const props = mockDialogProps.general.filter((p) => p.isOpen && p.mode === "edit").at(-1);
  expect(props.initialRows[0].expectedToolCalls).toEqual([
    { tool: "book_flight", arguments: {} },
  ]);
  await props.onSubmit([
    {
      uuid: "i-1",
      name: "Books a flight",
      description: "",
      input: "Book it",
      output: "Booked",
      inputExtras: {},
      outputExtras: {},
      toolCalls: [],
      expectedToolCalls: [],
      evaluator_variables: {},
      metadata: [],
    },
  ]);
  const payload = putPayload();
  expect(payload.output).toBe("Booked");
  expect(payload).not.toHaveProperty("actual_tool_calls");
  expect(payload).not.toHaveProperty("expected_tool_calls");
});

it("shows and saves llm-general calls stored under tool_calls", async () => {
  const user = setupUser();
  const calls = [{ tool: "book_flight", arguments: {} }];
  itemsTabWith("llm-general", { name: "Books", input: "Book it", output: "", tool_calls: calls });
  render(<LabellingTaskPage />);
  await user.click(await screen.findByRole("button", { name: "Edit" }));
  const props = mockDialogProps.general.filter((p) => p.isOpen && p.mode === "edit").at(-1);
  expect(props.initialRows[0].toolCalls).toEqual(calls);
  await props.onSubmit([{ ...props.initialRows[0], output: "Booked", toolCalls: [] }]);
  const payload = putPayload();
  expect(payload).not.toHaveProperty("tool_calls");
  expect(payload).not.toHaveProperty("actual_tool_calls");
});

it("keeps old tool_calls an llm-general item with a text answer never showed", async () => {
  const user = setupUser();
  const calls = [{ tool: "book_flight", arguments: {} }];
  itemsTabWith("llm-general", { name: "Books", input: "Book it", output: "Booked", tool_calls: calls });
  render(<LabellingTaskPage />);
  await user.click(await screen.findByRole("button", { name: "Edit" }));
  const props = mockDialogProps.general.filter((p) => p.isOpen && p.mode === "edit").at(-1);
  expect(props.initialRows[0].toolCalls).toEqual([]);
  await props.onSubmit([{ ...props.initialRows[0], name: "Books a flight" }]);
  expect(putPayload().tool_calls).toEqual(calls);
});

it("keeps an empty tool-call list the llm-general item already had", async () => {
  const user = setupUser();
  itemsTabWith("llm-general", {
    name: "Answers in words",
    input: "Book it",
    output: "I cannot",
    actual_tool_calls: [],
    expected_tool_calls: [],
  });
  render(<LabellingTaskPage />);
  await user.click(await screen.findByRole("button", { name: "Edit" }));
  const props = mockDialogProps.general.filter((p) => p.isOpen && p.mode === "edit").at(-1);
  await props.onSubmit([
    {
      uuid: "i-1",
      name: "Answers in words",
      description: "",
      input: "Book it",
      output: "I cannot",
      inputExtras: {},
      outputExtras: {},
      toolCalls: [],
      expectedToolCalls: [],
      evaluator_variables: {},
      metadata: [],
    },
  ]);
  const payload = putPayload();
  expect(payload.actual_tool_calls).toEqual([]);
  expect(payload.expected_tool_calls).toEqual([]);
});

it("keeps an empty tool-call list when an llm-general item is duplicated", async () => {
  const user = setupUser();
  itemsTabWith("llm-general", {
    name: "Answers in words",
    input: "Book it",
    output: "I cannot",
    actual_tool_calls: [],
  });
  render(<LabellingTaskPage />);
  await user.click(await screen.findByRole("button", { name: "Duplicate item" }));
  const props = mockDialogProps.general.filter((p) => p.isOpen && p.mode !== "edit").at(-1);
  expect(props.storesEmptyToolCallList).toBe(true);
  await props.onSubmit([
    {
      name: "Copy of Answers in words",
      description: "",
      input: "Book it",
      output: "I cannot",
      inputExtras: {},
      outputExtras: {},
      toolCalls: [],
      expectedToolCalls: [],
      evaluator_variables: {},
      metadata: [],
    },
  ]);
  const post = mockApiCalls.find(
    (c) => c.endpoint === "/annotation-tasks/t-1/items" && c.options?.method === "POST",
  )!;
  const payload = JSON.parse(JSON.stringify(post.options?.body)).items[0].payload;
  expect(payload.actual_tool_calls).toEqual([]);
  expect(payload).not.toHaveProperty("expected_tool_calls");
});

it("tells the llm edit dialog when the item stores an empty tool call list", async () => {
  const user = setupUser();
  itemsTabWith("llm", {
    name: "Answers in words",
    chat_history: [{ role: "user", content: "Book it" }],
    agent_response: "I cannot",
    expected_tool_calls: [],
  });
  render(<LabellingTaskPage />);
  await user.click(await screen.findByRole("button", { name: "Edit" }));
  const props = mockDialogProps.llm.filter((p) => p.isEditing).at(-1);
  expect(props.storesEmptyToolCallList).toBe(true);
});

it("does not mark an llm item with no tool call list as a tool-call item", async () => {
  const user = setupUser();
  itemsTabWith("llm", {
    name: "Plain reply",
    chat_history: [{ role: "user", content: "Hi" }],
    agent_response: "Hello",
  });
  render(<LabellingTaskPage />);
  await user.click(await screen.findByRole("button", { name: "Edit" }));
  const props = mockDialogProps.llm.filter((p) => p.isEditing).at(-1);
  expect(props.storesEmptyToolCallList).toBe(false);
});

it("gives the llm-general edit dialog each evaluator's type and the empty tool call list", async () => {
  const user = setupUser();
  itemsTabWith("llm-general", {
    name: "Answers in words",
    input: "Book it",
    output: "I cannot",
    actual_tool_calls: [],
  });
  render(<LabellingTaskPage />);
  await user.click(await screen.findByRole("button", { name: "Edit" }));
  const props = mockDialogProps.general.filter((p) => p.isOpen && p.mode === "edit").at(-1);
  expect(props.storesEmptyToolCallList).toBe(true);
  expect(props.evaluators.map((e: { evaluator_type?: string }) => e.evaluator_type)).toEqual(
    TASK.evaluators.map((e) => e.evaluator_type),
  );
});

it("reads the item kinds for select all from every item in the task", async () => {
  const user = setupUser();
  const payload = {
    name: "Plain reply",
    chat_history: [{ role: "user", content: "Hi" }],
    agent_response: "Hello",
  };
  itemsTabWith("llm", payload);
  mockTask = {
    ...(mockTask as object),
    items: [1, 2, 3, 4, 5].map((n) => ({ uuid: `i-${n}`, payload, is_tool_call: false })),
  };
  mockSummary = { ...(mockSummary as object), pagination: { total: 5, limit: 50, offset: 0 } };
  render(<LabellingTaskPage />);
  await screen.findByRole("button", { name: "Edit" });
  await user.click(screen.getAllByLabelText("Select all")[0]);
  await user.click(screen.getByRole("button", { name: "Select all 5 items" }));
  await user.click(screen.getByRole("button", { name: "Label selected" }));
  const props = mockDialogProps.assign.filter((p) => p.isOpen).at(-1);
  expect(props.hasToolCallItems).toBe(false);
  expect(props.hasNonToolCallItems).toBe(true);
});

it("does not take a first tool-call evaluator as the task type in Manage evaluators", async () => {
  const user = setupUser();
  mockSearch = "tab=overview";
  mockTask = {
    ...TASK,
    type: undefined,
    evaluators: [
      { uuid: "ev-tc", name: "Tool call correctness", evaluator_type: "tool-call", output_type: "binary" },
      ...TASK.evaluators,
    ],
  };
  render(<LabellingTaskPage />);
  await user.click(await screen.findByRole("button", { name: "Manage evaluators" }));
  expect(mockDialogProps.manage.at(-1).taskType).toBeUndefined();
  mockTask = TASK;
});

it.each([
  ["llm", { agent_response: "" }],
  ["llm-general", { input: "Book it", output: "" }],
])("puts a %s item's tool calls in the items CSV", async (type, fields) => {
  const calls = [{ tool: "book_flight", arguments: { to: "BLR" } }];
  itemsTabWith(type, {
    name: "Books a flight",
    ...fields,
    actual_tool_calls: calls,
    expected_tool_calls: calls,
  });
  mockExportProps.length = 0;
  render(<LabellingTaskPage />);
  await screen.findByText("Books a flight");
  const { columns, rows } = await mockExportProps.at(-1)!.getRows();
  expect(columns.map((c: { key: string }) => c.key)).toEqual(
    expect.arrayContaining(["actual_tool_calls", "expected_tool_calls"]),
  );
  expect(rows[0].actual_tool_calls).toBe(JSON.stringify(calls));
  expect(rows[0].expected_tool_calls).toBe(JSON.stringify(calls));
});
