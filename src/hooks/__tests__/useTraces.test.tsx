import { renderHook, act, waitFor } from "@testing-library/react";
import { useTraces } from "@/hooks/useTraces";
import { fetchTraces } from "@/lib/tracesApi";
import type { TraceOutputFilter } from "@/lib/tracesApi";
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
      useTraces({ accessToken: "tok", agentId: "ag-1" }),
    );

    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.items).toEqual([{ uuid: "t1" }]);
    expect(result.current.total).toBe(1);
    expect(mockFetchTraces).toHaveBeenCalledWith("tok", {
      limit: 50,
      offset: 0,
      agentId: "ag-1",
      q: "",
      outputType: "all",
      labels: [],
      inputContains: "",
      outputContains: "",
      metadataKeys: [],
    });
  });

  it("sends the output filter and returns to the first page when it changes", async () => {
    mockFetchTraces.mockResolvedValue(page([{ uuid: "a" }, { uuid: "b" }], 9));

    const { result, rerender } = renderHook(
      ({ outputType }: { outputType: TraceOutputFilter }) =>
        useTraces({
          accessToken: "tok",
          agentId: "ag-1",
          pageSize: 2,
          outputType,
        }),
      { initialProps: { outputType: "all" as TraceOutputFilter } },
    );
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    await act(async () => result.current.nextPage());
    await waitFor(() => expect(result.current.offset).toBe(2));

    rerender({ outputType: "tool_call" });
    await waitFor(() =>
      expect(mockFetchTraces).toHaveBeenLastCalledWith(
        "tok",
        expect.objectContaining({ outputType: "tool_call", offset: 0 }),
      ),
    );
    expect(result.current.offset).toBe(0);
  });

  it("reports the output filter the rows on screen came from", async () => {
    let resolvePage: (value: unknown) => void = () => {};
    mockFetchTraces.mockResolvedValueOnce(page([{ uuid: "a" }], 1));

    const { result, rerender } = renderHook(
      ({ outputType }: { outputType: TraceOutputFilter }) =>
        useTraces({ accessToken: "tok", agentId: "ag-1", outputType }),
      { initialProps: { outputType: "all" as TraceOutputFilter } },
    );
    await waitFor(() => expect(result.current.loadedFilters.outputType).toBe("all"));

    mockFetchTraces.mockReturnValueOnce(
      new Promise((resolve) => {
        resolvePage = resolve;
      }),
    );
    rerender({ outputType: "tool_call" });
    // The new filter is in flight, so the rows are still the old ones.
    expect(result.current.loadedFilters.outputType).toBe("all");

    await act(async () => {
      resolvePage(page([], 0));
    });
    expect(result.current.loadedFilters.outputType).toBe("tool_call");
  });

  it("sends the search text and returns to the first page when it changes", async () => {
    mockFetchTraces.mockResolvedValue(page([{ uuid: "a" }, { uuid: "b" }], 9));

    const { result, rerender } = renderHook(
      ({ q }: { q: string }) =>
        useTraces({ accessToken: "tok", agentId: "ag-1", pageSize: 2, q }),
      { initialProps: { q: "" } },
    );
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    await act(async () => result.current.nextPage());
    await waitFor(() => expect(result.current.offset).toBe(2));

    rerender({ q: "polio" });
    await waitFor(() =>
      expect(mockFetchTraces).toHaveBeenLastCalledWith(
        "tok",
        expect.objectContaining({ q: "polio", offset: 0 }),
      ),
    );
    expect(result.current.offset).toBe(0);
  });

  it("reports the search text the rows on screen came from", async () => {
    let resolvePage: (value: unknown) => void = () => {};
    mockFetchTraces.mockResolvedValueOnce(page([{ uuid: "a" }], 1));

    const { result, rerender } = renderHook(
      ({ q }: { q: string }) =>
        useTraces({ accessToken: "tok", agentId: "ag-1", q }),
      { initialProps: { q: "" } },
    );
    await waitFor(() => expect(result.current.loadedQ).toBe(""));

    mockFetchTraces.mockReturnValueOnce(
      new Promise((resolve) => {
        resolvePage = resolve;
      }),
    );
    rerender({ q: "polio" });
    // The new search is in flight, so the rows are still the old ones.
    expect(result.current.loadedQ).toBe("");

    await act(async () => {
      resolvePage(page([], 0));
    });
    expect(result.current.loadedQ).toBe("polio");
  });

  it("stays idle without an access token", async () => {
    const { result } = renderHook(() =>
      useTraces({ accessToken: null, agentId: "ag-1" }),
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
        agentId: "ag-1",
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

  it("keeps loadedOffset on the old page until the new page's fetch resolves", async () => {
    mockFetchTraces.mockResolvedValueOnce(
      page([{ uuid: "a" }, { uuid: "b" }], 4),
    );
    const { result } = renderHook(() =>
      useTraces({
        accessToken: "tok",
        agentId: "ag-1",
        pageSize: 2,
      }),
    );
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.loadedOffset).toBe(0);

    let resolveNext: (value: unknown) => void = () => {};
    mockFetchTraces.mockReturnValueOnce(
      new Promise((resolve) => {
        resolveNext = resolve;
      }),
    );
    act(() => result.current.nextPage());
    // The requested offset moves right away; a caller stepping through items
    // (useItemPager) needs to know the second page hasn't landed yet, so
    // loadedOffset must still say 0, matching the still-old `items`.
    expect(result.current.offset).toBe(2);
    expect(result.current.loadedOffset).toBe(0);
    expect(result.current.items).toEqual([{ uuid: "a" }, { uuid: "b" }]);

    await act(async () => {
      resolveNext(page([{ uuid: "c" }, { uuid: "d" }], 4));
    });
    expect(result.current.loadedOffset).toBe(2);
    expect(result.current.items).toEqual([{ uuid: "c" }, { uuid: "d" }]);
  });

  it("does not page past the last page", async () => {
    mockFetchTraces.mockResolvedValue(page([{ uuid: "a" }], 1));
    const { result } = renderHook(() =>
      useTraces({
        accessToken: "tok",
        agentId: "ag-1",
        pageSize: 2,
      }),
    );
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.hasNext).toBe(false);

    await act(async () => result.current.nextPage());
    expect(result.current.offset).toBe(0);
  });

  it("resets to the first page when the page size changes", async () => {
    mockFetchTraces.mockResolvedValue(page([{ uuid: "a" }, { uuid: "b" }], 10));
    const { result, rerender } = renderHook(
      ({ pageSize }) =>
        useTraces({
          accessToken: "tok",
          agentId: "ag-1",
          pageSize,
        }),
      { initialProps: { pageSize: 2 } },
    );
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    await act(async () => result.current.nextPage());
    await waitFor(() => expect(result.current.offset).toBe(2));

    rerender({ pageSize: 5 });
    await waitFor(() => expect(result.current.offset).toBe(0));
    expect(mockFetchTraces).toHaveBeenLastCalledWith(
      "tok",
      expect.objectContaining({ limit: 5, offset: 0 }),
    );
  });

  it("resets to the first page and refetches when the agent changes", async () => {
    mockFetchTraces.mockResolvedValue(page([{ uuid: "a" }, { uuid: "b" }], 10));
    const { result, rerender } = renderHook(
      ({ agentId }) =>
        useTraces({
          accessToken: "tok",
          agentId,
          pageSize: 2,
        }),
      { initialProps: { agentId: "ag-1" } },
    );
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    await act(async () => result.current.nextPage());
    await waitFor(() => expect(result.current.offset).toBe(2));

    rerender({ agentId: "ag-2" });
    await waitFor(() => expect(result.current.offset).toBe(0));
    expect(mockFetchTraces).toHaveBeenLastCalledWith(
      "tok",
      expect.objectContaining({ agentId: "ag-2", offset: 0 }),
    );
  });

  it("clamps back a page when a delete empties the current one", async () => {
    mockFetchTraces.mockResolvedValue(page([{ uuid: "a" }, { uuid: "b" }], 4));
    const { result } = renderHook(() =>
      useTraces({
        accessToken: "tok",
        agentId: "ag-1",
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
        agentId: "ag-1",
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
      useTraces({ accessToken: "tok", agentId: "ag-1" }),
    );
    await waitFor(() => expect(result.current.error).toMatch(/Failed to load/));
    expect(mockReportError).toHaveBeenCalled();
  });

  it("clears the rows and the count when a load fails", async () => {
    mockFetchTraces.mockResolvedValueOnce(
      page([{ uuid: "a" }, { uuid: "b" }], 2),
    );
    const { result } = renderHook(() =>
      useTraces({ accessToken: "tok", agentId: "ag-1" }),
    );
    await waitFor(() => expect(result.current.items).toHaveLength(2));

    mockFetchTraces.mockRejectedValue(new Error("boom"));
    await act(async () => result.current.refetch());

    await waitFor(() => expect(result.current.error).toMatch(/Failed to load/));
    expect(result.current.items).toEqual([]);
    expect(result.current.total).toBe(0);
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
        agentId: "ag-1",
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

    await waitFor(() =>
      expect(result.current.items).toEqual([{ uuid: "new" }]),
    );
    expect(result.current.total).toBe(1);
  });

  it("sends the picked labels and returns to the first page when they change", async () => {
    mockFetchTraces.mockResolvedValue(page([{ uuid: "t1" }], 200));

    const { result, rerender } = renderHook(
      ({ labels }: { labels: string[] }) =>
        useTraces({ accessToken: "tok", agentId: "ag-1", labels }),
      { initialProps: { labels: [] as string[] } },
    );
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    act(() => result.current.nextPage());
    await waitFor(() => expect(result.current.offset).toBe(50));

    rerender({ labels: ["production"] });

    await waitFor(() => expect(result.current.offset).toBe(0));
    await waitFor(() =>
      expect(mockFetchTraces).toHaveBeenLastCalledWith("tok", {
        limit: 50,
        offset: 0,
        agentId: "ag-1",
        q: "",
        outputType: "all",
        labels: ["production"],
        inputContains: "",
        outputContains: "",
        metadataKeys: [],
      }),
    );
  });

  it("does not refetch when the same labels arrive in a new array", async () => {
    mockFetchTraces.mockResolvedValue(page([{ uuid: "t1" }], 1));

    const { result, rerender } = renderHook(
      ({ labels }: { labels: string[] }) =>
        useTraces({ accessToken: "tok", agentId: "ag-1", labels }),
      { initialProps: { labels: ["production"] } },
    );
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(mockFetchTraces).toHaveBeenCalledTimes(1);

    rerender({ labels: ["production"] });

    await waitFor(() => expect(mockFetchTraces).toHaveBeenCalledTimes(1));
  });

  it("reports the labels the rows on screen came from", async () => {
    mockFetchTraces.mockResolvedValue(page([{ uuid: "t1" }], 1));

    const { result } = renderHook(() =>
      useTraces({ accessToken: "tok", agentId: "ag-1", labels: ["staging"] }),
    );

    await waitFor(() =>
      expect(result.current.loadedFilters.labels).toEqual(["staging"]),
    );
  });
});
