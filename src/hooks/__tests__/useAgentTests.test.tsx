import { renderHook, act, waitFor } from "@testing-library/react";
import { useAgentTests } from "@/hooks/useAgentTests";
import { fetchAgentTestsPage } from "@/lib/agentTestsApi";
import { reportError } from "@/lib/reportError";

jest.mock("../../lib/agentTestsApi", () => ({
  __esModule: true,
  fetchAgentTestsPage: jest.fn(),
}));
jest.mock("../../lib/reportError", () => ({
  __esModule: true,
  reportError: jest.fn(),
}));

const mockFetchPage = fetchAgentTestsPage as jest.Mock;

function page(items: Array<{ uuid: string }>, total: number, offset = 0) {
  return { items, total, limit: 10, offset };
}

beforeEach(() => {
  mockFetchPage.mockReset();
  (reportError as jest.Mock).mockReset();
});

describe("useAgentTests", () => {
  it("asks for the first page on mount and reports what came back", async () => {
    mockFetchPage.mockResolvedValue(page([{ uuid: "t1" }], 3));

    const { result } = renderHook(() =>
      useAgentTests({ agentUuid: "a1", accessToken: "tok", pageSize: 10 }),
    );

    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.items).toEqual([{ uuid: "t1" }]);
    expect(result.current.total).toBe(3);
    expect(mockFetchPage).toHaveBeenCalledWith("tok", {
      agentUuid: "a1",
      limit: 10,
      offset: 0,
      q: "",
      qMode: "contains",
      type: "all",
    });
  });

  it("stays idle until there is an access token", async () => {
    renderHook(() =>
      useAgentTests({ agentUuid: "a1", accessToken: null, pageSize: 10 }),
    );
    expect(mockFetchPage).not.toHaveBeenCalled();
  });

  it("sends the search text, the match mode and the type filter", async () => {
    mockFetchPage.mockResolvedValue(page([], 0));

    renderHook(() =>
      useAgentTests({
        agentUuid: "a1",
        accessToken: "tok",
        pageSize: 25,
        q: "refund",
        qMode: "exact",
        type: "tool_call",
      }),
    );

    await waitFor(() =>
      expect(mockFetchPage).toHaveBeenCalledWith("tok", {
        agentUuid: "a1",
        limit: 25,
        offset: 0,
        q: "refund",
        qMode: "exact",
        type: "tool_call",
      }),
    );
  });

  it("steps through the pages and back", async () => {
    mockFetchPage.mockResolvedValue(page([{ uuid: "t1" }], 25));

    const { result } = renderHook(() =>
      useAgentTests({ agentUuid: "a1", accessToken: "tok", pageSize: 10 }),
    );
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.hasPrev).toBe(false);
    expect(result.current.hasNext).toBe(true);

    act(() => result.current.nextPage());
    await waitFor(() => expect(result.current.offset).toBe(10));
    expect(mockFetchPage).toHaveBeenLastCalledWith(
      "tok",
      expect.objectContaining({ offset: 10 }),
    );

    act(() => result.current.prevPage());
    await waitFor(() => expect(result.current.offset).toBe(0));
  });

  it("goes back to the first page when the search changes", async () => {
    mockFetchPage.mockResolvedValue(page([{ uuid: "t1" }], 25));

    const { result, rerender } = renderHook(
      ({ q }: { q: string }) =>
        useAgentTests({
          agentUuid: "a1",
          accessToken: "tok",
          pageSize: 10,
          q,
        }),
      { initialProps: { q: "" } },
    );
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    act(() => result.current.nextPage());
    await waitFor(() => expect(result.current.offset).toBe(10));

    rerender({ q: "refund" });
    await waitFor(() => expect(result.current.offset).toBe(0));
  });

  it("steps back a page when the last row on it was removed", async () => {
    mockFetchPage.mockResolvedValue(page([{ uuid: "t11" }], 11, 10));

    const { result } = renderHook(() =>
      useAgentTests({ agentUuid: "a1", accessToken: "tok", pageSize: 10 }),
    );
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    act(() => result.current.nextPage());
    await waitFor(() => expect(result.current.offset).toBe(10));

    act(() => result.current.handleRemoved(1));
    await waitFor(() => expect(result.current.offset).toBe(0));
  });

  it("re-asks for the same page when rows are removed from a full one", async () => {
    mockFetchPage.mockResolvedValue(page([{ uuid: "t1" }], 30));

    const { result } = renderHook(() =>
      useAgentTests({ agentUuid: "a1", accessToken: "tok", pageSize: 10 }),
    );
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    const callsBefore = mockFetchPage.mock.calls.length;

    act(() => result.current.handleRemoved(1));
    await waitFor(() =>
      expect(mockFetchPage.mock.calls.length).toBe(callsBefore + 1),
    );
    expect(result.current.offset).toBe(0);
  });

  it("counts a bare list as the whole list", async () => {
    mockFetchPage.mockResolvedValue([{ uuid: "t1" }, { uuid: "t2" }]);

    const { result } = renderHook(() =>
      useAgentTests({ agentUuid: "a1", accessToken: "tok", pageSize: 10 }),
    );

    await waitFor(() => expect(result.current.total).toBe(2));
    expect(result.current.items).toHaveLength(2);
  });

  it("shows an error and empties the list when the fetch fails", async () => {
    mockFetchPage.mockRejectedValue(new Error("boom"));

    const { result } = renderHook(() =>
      useAgentTests({ agentUuid: "a1", accessToken: "tok", pageSize: 10 }),
    );

    await waitFor(() =>
      expect(result.current.error).toBe("Failed to load agent tests"),
    );
    expect(result.current.items).toEqual([]);
    expect(result.current.total).toBe(0);
    expect(reportError).toHaveBeenCalled();
  });

  it("keeps the newest answer when a slow one lands late", async () => {
    let resolveSlow: (value: unknown) => void = () => {};
    mockFetchPage
      .mockImplementationOnce(
        () =>
          new Promise((resolve) => {
            resolveSlow = resolve;
          }),
      )
      .mockResolvedValue(page([{ uuid: "new" }], 1));

    const { result, rerender } = renderHook(
      ({ q }: { q: string }) =>
        useAgentTests({
          agentUuid: "a1",
          accessToken: "tok",
          pageSize: 10,
          q,
        }),
      { initialProps: { q: "" } },
    );

    rerender({ q: "refund" });
    await waitFor(() => expect(result.current.items).toEqual([{ uuid: "new" }]));

    act(() => resolveSlow(page([{ uuid: "stale" }], 99)));
    await waitFor(() => expect(result.current.items).toEqual([{ uuid: "new" }]));
    expect(result.current.total).toBe(1);
  });

  it("reports the search the rows on screen came from", async () => {
    mockFetchPage.mockResolvedValue(page([], 0));

    const { result, rerender } = renderHook(
      ({ q }: { q: string }) =>
        useAgentTests({
          agentUuid: "a1",
          accessToken: "tok",
          pageSize: 10,
          q,
        }),
      { initialProps: { q: "" } },
    );
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.loadedQ).toBe("");

    rerender({ q: "zzz" });
    await waitFor(() => expect(result.current.loadedQ).toBe("zzz"));
  });

  it("re-asks for the current page on refetch", async () => {
    mockFetchPage.mockResolvedValue(page([{ uuid: "t1" }], 1));

    const { result } = renderHook(() =>
      useAgentTests({ agentUuid: "a1", accessToken: "tok", pageSize: 10 }),
    );
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    const callsBefore = mockFetchPage.mock.calls.length;

    await act(async () => {
      await result.current.refetch();
    });
    expect(mockFetchPage.mock.calls.length).toBe(callsBefore + 1);
  });
});
