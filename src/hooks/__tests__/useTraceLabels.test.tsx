import { act, renderHook, waitFor } from "@testing-library/react";
import { useTraceLabels } from "@/hooks/useTraceLabels";
import { fetchTraceLabels } from "@/lib/tracesApi";
import { reportError } from "@/lib/reportError";

jest.mock("../../lib/tracesApi", () => ({
  __esModule: true,
  fetchTraceLabels: jest.fn(),
}));
jest.mock("../../lib/reportError", () => ({
  __esModule: true,
  reportError: jest.fn(),
}));

const mockFetchTraceLabels = fetchTraceLabels as jest.Mock;
const mockReportError = reportError as jest.Mock;

beforeEach(() => {
  mockFetchTraceLabels.mockReset();
  mockReportError.mockReset();
});

describe("useTraceLabels", () => {
  it("loads the agent's labels", async () => {
    mockFetchTraceLabels.mockResolvedValue(["production", "staging"]);

    const { result } = renderHook(() => useTraceLabels("tok", "ag-1"));

    await waitFor(() =>
      expect(result.current.labels).toEqual(["production", "staging"]),
    );
    expect(mockFetchTraceLabels).toHaveBeenCalledWith("tok", "ag-1");
  });

  it("reloads when the agent changes", async () => {
    mockFetchTraceLabels.mockResolvedValue([]);

    const { rerender } = renderHook(
      ({ agentId }: { agentId: string }) => useTraceLabels("tok", agentId),
      { initialProps: { agentId: "ag-1" } },
    );
    await waitFor(() => expect(mockFetchTraceLabels).toHaveBeenCalledTimes(1));

    rerender({ agentId: "ag-2" });

    await waitFor(() =>
      expect(mockFetchTraceLabels).toHaveBeenLastCalledWith("tok", "ag-2"),
    );
  });

  it("stays idle without an access token", () => {
    renderHook(() => useTraceLabels(null, "ag-1"));
    expect(mockFetchTraceLabels).not.toHaveBeenCalled();
  });

  it("ignores an answer for the agent the reader just left", async () => {
    let resolveFirst: (labels: string[]) => void = () => {};
    mockFetchTraceLabels
      .mockImplementationOnce(
        () => new Promise<string[]>((resolve) => (resolveFirst = resolve)),
      )
      .mockResolvedValueOnce(["staging"]);

    const { result, rerender } = renderHook(
      ({ agentId }: { agentId: string }) => useTraceLabels("tok", agentId),
      { initialProps: { agentId: "ag-1" } },
    );
    rerender({ agentId: "ag-2" });
    await waitFor(() => expect(result.current.labels).toEqual(["staging"]));

    await act(async () => {
      resolveFirst(["production"]);
    });

    expect(result.current.labels).toEqual(["staging"]);
  });

  it("clears the labels it was holding when a later read fails", async () => {
    mockFetchTraceLabels
      .mockResolvedValueOnce(["production"])
      .mockRejectedValueOnce(new Error("nope"));

    const { result } = renderHook(() => useTraceLabels("tok", "ag-1"));
    await waitFor(() => expect(result.current.labels).toEqual(["production"]));

    act(() => result.current.refetch());

    await waitFor(() => expect(mockReportError).toHaveBeenCalled());
    expect(result.current.labels).toEqual([]);
  });

  it("stays idle without an agent", () => {
    renderHook(() => useTraceLabels("tok", ""));
    expect(mockFetchTraceLabels).not.toHaveBeenCalled();
  });

  it("reads the labels again when asked", async () => {
    mockFetchTraceLabels
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce(["production"]);

    const { result } = renderHook(() => useTraceLabels("tok", "ag-1"));
    await waitFor(() => expect(mockFetchTraceLabels).toHaveBeenCalledTimes(1));

    act(() => result.current.refetch());

    await waitFor(() => expect(result.current.labels).toEqual(["production"]));
  });
});
