import { renderHook, act } from "@testing-library/react";
import { useTraceDeletion } from "@/hooks/useTraceDeletion";
import type { TraceSummary } from "@/lib/tracesApi";

jest.mock("../../lib/reportError", () => ({
  __esModule: true,
  reportError: jest.fn(),
}));

function trace(uuid: string): TraceSummary {
  return {
    uuid,
    message_id: `msg-${uuid}`,
    conversation_id: "conv-1",
    input_preview: null,
    response_preview: null,
    turn_count: 1,
    tool_call_count: 0,
    metadata_count: 0,
    created_at: "2026-07-20T00:00:00Z",
  };
}

const traces = [trace("t1"), trace("t2")];
const originalFetch = global.fetch;

beforeEach(() => {
  process.env.NEXT_PUBLIC_BACKEND_URL = "http://localhost:8000";
});
afterEach(() => {
  global.fetch = originalFetch;
  jest.clearAllMocks();
});

it("bulk-deletes selected traces via POST /traces/bulk-delete with trace_ids", async () => {
  global.fetch = jest.fn().mockResolvedValue({
    ok: true,
    status: 200,
    json: async () => ({ deleted: 2 }),
  }) as unknown as typeof fetch;
  const onDeleted = jest.fn();

  const { result } = renderHook(() =>
    useTraceDeletion({ traces, onDeleted, accessToken: "tok" }),
  );

  act(() => result.current.toggleSelectAll());
  act(() => result.current.openBulkDeleteDialog());
  await act(async () => {
    await result.current.deleteItems();
  });

  expect(global.fetch).toHaveBeenCalledWith(
    "http://localhost:8000/traces/bulk-delete",
    expect.objectContaining({
      method: "POST",
      body: JSON.stringify({ trace_ids: ["t1", "t2"] }),
    }),
  );
  expect(onDeleted).toHaveBeenCalledWith(["t1", "t2"]);
});

it("clears the selection without deleting (for convert-to-tests)", () => {
  const { result } = renderHook(() =>
    useTraceDeletion({ traces, onDeleted: jest.fn(), accessToken: "tok" }),
  );
  act(() => result.current.toggleSelectAll());
  expect(result.current.selectedUuids.size).toBe(2);
  act(() => result.current.clearSelection());
  expect(result.current.selectedUuids.size).toBe(0);
});

it("single-deletes one trace through the same batched endpoint", async () => {
  global.fetch = jest.fn().mockResolvedValue({
    ok: true,
    status: 200,
    json: async () => ({ deleted: 1 }),
  }) as unknown as typeof fetch;
  const onDeleted = jest.fn();

  const { result } = renderHook(() =>
    useTraceDeletion({ traces, onDeleted, accessToken: "tok" }),
  );

  act(() => result.current.openDeleteDialog(traces[0]));
  await act(async () => {
    await result.current.deleteItems();
  });

  expect(global.fetch).toHaveBeenCalledWith(
    "http://localhost:8000/traces/bulk-delete",
    expect.objectContaining({
      method: "POST",
      body: JSON.stringify({ trace_ids: ["t1"] }),
    }),
  );
  expect(onDeleted).toHaveBeenCalledWith(["t1"]);
});
