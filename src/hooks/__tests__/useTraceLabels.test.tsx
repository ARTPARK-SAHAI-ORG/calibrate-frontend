import { act, renderHook, waitFor } from "@testing-library/react";
import { useTraceLabels, useTraceMetadataKeys } from "@/hooks/useTraceLabels";
import { fetchTraceLabels, fetchTraceMetadataKeys } from "@/lib/tracesApi";
import { reportError } from "@/lib/reportError";

jest.mock("../../lib/tracesApi", () => ({
  __esModule: true,
  fetchTraceLabels: jest.fn(),
  fetchTraceMetadataKeys: jest.fn(),
}));
jest.mock("../../lib/reportError", () => ({
  __esModule: true,
  reportError: jest.fn(),
}));

const mockFetchTraceLabels = fetchTraceLabels as jest.Mock;
const mockFetchTraceMetadataKeys = fetchTraceMetadataKeys as jest.Mock;
const mockReportError = reportError as jest.Mock;

beforeEach(() => {
  mockFetchTraceLabels.mockReset();
  mockFetchTraceMetadataKeys.mockReset();
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

describe("useTraceMetadataKeys", () => {
  it("loads the agent's metadata keys", async () => {
    mockFetchTraceMetadataKeys.mockResolvedValue(["clinic_id", "channel"]);

    const { result } = renderHook(() => useTraceMetadataKeys("tok", "ag-1"));

    await waitFor(() =>
      expect(result.current.keys).toEqual(["clinic_id", "channel"]),
    );
    expect(mockFetchTraceMetadataKeys).toHaveBeenCalledWith("tok", "ag-1");
  });

  it("gives an empty list when the keys cannot be read", async () => {
    mockFetchTraceMetadataKeys.mockRejectedValue(new Error("nope"));

    const { result } = renderHook(() => useTraceMetadataKeys("tok", "ag-1"));

    await waitFor(() => expect(mockReportError).toHaveBeenCalled());
    expect(result.current.keys).toEqual([]);
  });

  it("asks again when told to", async () => {
    mockFetchTraceMetadataKeys.mockResolvedValue([]);

    const { result } = renderHook(() => useTraceMetadataKeys("tok", "ag-1"));
    await waitFor(() =>
      expect(mockFetchTraceMetadataKeys).toHaveBeenCalledTimes(1),
    );

    act(() => result.current.refetch());

    await waitFor(() =>
      expect(mockFetchTraceMetadataKeys).toHaveBeenCalledTimes(2),
    );
  });
});
