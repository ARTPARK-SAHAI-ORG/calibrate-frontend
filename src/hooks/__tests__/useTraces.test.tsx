import { renderHook, act, waitFor } from "@testing-library/react";
import { useTraces, useTraceCount } from "@/hooks/useTraces";
import { fetchTraces } from "@/lib/tracesApi";
import { reportError } from "@/lib/reportError";

jest.mock("../../lib/tracesApi", () => ({
  __esModule: true,
  fetchTraces: jest.fn(),
}));
jest.mock("../../lib/reportError", () => ({
  __esModule: true,
  reportError: jest.fn(),
}));

const mockFetchTraces = fetchTraces as jest.Mock;
const mockReportError = reportError as jest.Mock;

function page(items: Array<{ uuid: string }>, total: number) {
  return { items, total, limit: 50, offset: 0 };
}

beforeEach(() => {
  mockFetchTraces.mockReset();
  mockReportError.mockReset();
});

describe("useTraces", () => {
  it("loads the first page on mount and exposes items + total", async () => {
    mockFetchTraces.mockResolvedValue(page([{ uuid: "t1" }], 1));

    const { result } = renderHook(() =>
      useTraces({ accessToken: "tok", q: "", conversationId: null }),
    );

    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.items).toEqual([{ uuid: "t1" }]);
    expect(result.current.total).toBe(1);
    expect(mockFetchTraces).toHaveBeenCalledWith("tok", {
      limit: 50,
      offset: 0,
      q: undefined,
      conversationId: undefined,
    });
  });

  it("stays idle without an access token", async () => {
    const { result } = renderHook(() =>
      useTraces({ accessToken: null, q: "", conversationId: null }),
    );
    // A tick to let effects run.
    await act(async () => {});
    expect(mockFetchTraces).not.toHaveBeenCalled();
    expect(result.current.items).toEqual([]);
  });

  it("pages forward and back, honoring hasPrev/hasNext", async () => {
    mockFetchTraces.mockResolvedValue(page([{ uuid: "a" }, { uuid: "b" }], 5));

    const { result } = renderHook(() =>
      useTraces({
        accessToken: "tok",
        q: "",
        conversationId: null,
        pageSize: 2,
      }),
    );
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.hasPrev).toBe(false);
    expect(result.current.hasNext).toBe(true);

    await act(async () => result.current.nextPage());
    await waitFor(() =>
      expect(mockFetchTraces).toHaveBeenLastCalledWith(
        "tok",
        expect.objectContaining({ offset: 2, limit: 2 }),
      ),
    );
    expect(result.current.offset).toBe(2);
    expect(result.current.hasPrev).toBe(true);

    await act(async () => result.current.prevPage());
    await waitFor(() => expect(result.current.offset).toBe(0));
  });

  it("does not page past the last page", async () => {
    mockFetchTraces.mockResolvedValue(page([{ uuid: "a" }], 1));
    const { result } = renderHook(() =>
      useTraces({
        accessToken: "tok",
        q: "",
        conversationId: null,
        pageSize: 2,
      }),
    );
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.hasNext).toBe(false);

    await act(async () => result.current.nextPage());
    expect(result.current.offset).toBe(0);
  });

  it("resets to the first page when the query changes", async () => {
    mockFetchTraces.mockResolvedValue(page([{ uuid: "a" }, { uuid: "b" }], 10));
    const { result, rerender } = renderHook(
      ({ q }) => useTraces({ accessToken: "tok", q, conversationId: null, pageSize: 2 }),
      { initialProps: { q: "" } },
    );
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    await act(async () => result.current.nextPage());
    await waitFor(() => expect(result.current.offset).toBe(2));

    rerender({ q: "polio" });
    await waitFor(() => expect(result.current.offset).toBe(0));
    expect(mockFetchTraces).toHaveBeenLastCalledWith(
      "tok",
      expect.objectContaining({ q: "polio", offset: 0 }),
    );
  });

  it("clamps back a page when a delete empties the current one", async () => {
    mockFetchTraces.mockResolvedValue(page([{ uuid: "a" }, { uuid: "b" }], 4));
    const { result } = renderHook(() =>
      useTraces({
        accessToken: "tok",
        q: "",
        conversationId: null,
        pageSize: 2,
      }),
    );
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    await act(async () => result.current.nextPage());
    await waitFor(() => expect(result.current.offset).toBe(2));

    // Delete both rows on page 2 → new total 2 → last page is offset 0.
    await act(async () => result.current.handleDeleted(2));
    await waitFor(() => expect(result.current.offset).toBe(0));
  });

  it("reloads in place when a delete leaves the page in range", async () => {
    mockFetchTraces.mockResolvedValue(page([{ uuid: "a" }, { uuid: "b" }], 4));
    const { result } = renderHook(() =>
      useTraces({
        accessToken: "tok",
        q: "",
        conversationId: null,
        pageSize: 2,
      }),
    );
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    const callsBefore = mockFetchTraces.mock.calls.length;

    await act(async () => result.current.handleDeleted(1));
    await waitFor(() =>
      expect(mockFetchTraces.mock.calls.length).toBe(callsBefore + 1),
    );
    expect(result.current.offset).toBe(0);
  });

  it("reports and surfaces an error when the fetch throws", async () => {
    mockFetchTraces.mockRejectedValue(new Error("boom"));
    const { result } = renderHook(() =>
      useTraces({ accessToken: "tok", q: "", conversationId: null }),
    );
    await waitFor(() => expect(result.current.error).toMatch(/Failed to load/));
    expect(mockReportError).toHaveBeenCalled();
  });

  it("ignores a superseded response so stale data never clobbers newer state", async () => {
    let resolveFirst: (v: unknown) => void = () => {};
    const first = new Promise((resolve) => {
      resolveFirst = resolve;
    });
    mockFetchTraces.mockReturnValueOnce(first);
    mockFetchTraces.mockResolvedValue(page([{ uuid: "new" }], 1));

    const { result } = renderHook(() =>
      useTraces({
        accessToken: "tok",
        q: "",
        conversationId: null,
        pageSize: 2,
      }),
    );
    // Trigger a second load before the first resolves.
    await act(async () => result.current.refetch());
    // Now resolve the stale first request last.
    await act(async () => {
      resolveFirst(page([{ uuid: "stale" }], 99));
      await first;
    });

    await waitFor(() => expect(result.current.items).toEqual([{ uuid: "new" }]));
    expect(result.current.total).toBe(1);
  });
});

describe("useTraceCount", () => {
  it("reads the envelope total with a limit=1 probe", async () => {
    mockFetchTraces.mockResolvedValue(page([], 4242));
    const { result } = renderHook(() => useTraceCount("tok"));
    await waitFor(() => expect(result.current).toBe(4242));
    expect(mockFetchTraces).toHaveBeenCalledWith("tok", { limit: 1, offset: 0 });
  });

  it("returns null and reports when the probe fails", async () => {
    mockFetchTraces.mockRejectedValue(new Error("nope"));
    const { result } = renderHook(() => useTraceCount("tok", 1));
    await waitFor(() => expect(mockReportError).toHaveBeenCalled());
    expect(result.current).toBeNull();
  });

  it("stays null without an access token", async () => {
    const { result } = renderHook(() => useTraceCount(null));
    await act(async () => {});
    expect(mockFetchTraces).not.toHaveBeenCalled();
    expect(result.current).toBeNull();
  });
});
