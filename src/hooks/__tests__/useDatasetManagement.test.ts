import { renderHook, waitFor, act } from "@testing-library/react";
import { toast } from "sonner";
import { useDatasetManagement } from "@/hooks/useDatasetManagement";
import { listDatasets, createDataset, deleteDataset } from "@/lib/datasets";
import { reportError } from "@/lib/reportError";
import { clearAllRequestCaches } from "@/lib/requestCache";

jest.mock("../../lib/datasets", () => ({
  __esModule: true,
  listDatasets: jest.fn(),
  createDataset: jest.fn(),
  deleteDataset: jest.fn(),
}));

jest.mock("../../lib/reportError", () => ({
  __esModule: true,
  reportError: jest.fn(),
}));

jest.mock("sonner", () => ({
  __esModule: true,
  toast: { error: jest.fn(), success: jest.fn() },
}));

const mockListDatasets = listDatasets as jest.Mock;
const mockCreateDataset = createDataset as jest.Mock;
const mockDeleteDataset = deleteDataset as jest.Mock;
const mockReportError = reportError as jest.Mock;
const mockToastError = toast.error as jest.Mock;

const sampleDatasets = [
  {
    uuid: "d1",
    name: "Dataset 1",
    dataset_type: "stt" as const,
    item_count: 3,
    eval_count: 0,
    created_at: "2024-01-01",
    updated_at: "2024-01-01",
  },
];

describe("useDatasetManagement", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    // The datasets list is cached at module scope keyed by access token; wipe
    // it between tests so each case starts from a clean fetch.
    clearAllRequestCaches();
  });

  it("does not fetch and stays in loading state when accessToken is null", () => {
    const onCreated = jest.fn();
    const { result } = renderHook(() =>
      useDatasetManagement(null, "stt", onCreated),
    );

    expect(mockListDatasets).not.toHaveBeenCalled();
    expect(result.current.datasetsLoading).toBe(true);
    expect(result.current.datasets).toEqual([]);
  });

  it("fetches datasets on mount and updates state on success", async () => {
    mockListDatasets.mockResolvedValue(sampleDatasets);
    const onCreated = jest.fn();
    const { result } = renderHook(() =>
      useDatasetManagement("token", "stt", onCreated),
    );

    await waitFor(() => expect(result.current.datasetsLoading).toBe(false));
    expect(result.current.datasets).toEqual(sampleDatasets);
    expect(result.current.datasetsError).toBeNull();
    expect(mockListDatasets).toHaveBeenCalledWith("token", "stt");
  });

  it("sets datasetsError with the Error message on failure", async () => {
    mockListDatasets.mockRejectedValue(new Error("boom"));
    const onCreated = jest.fn();
    const { result } = renderHook(() =>
      useDatasetManagement("token", "tts", onCreated),
    );

    await waitFor(() => expect(result.current.datasetsLoading).toBe(false));
    expect(result.current.datasetsError).toBe("boom");
    expect(result.current.datasets).toEqual([]);
  });

  it("sets a generic datasetsError message when a non-Error is thrown", async () => {
    mockListDatasets.mockRejectedValue("not an error object");
    const onCreated = jest.fn();
    const { result } = renderHook(() =>
      useDatasetManagement("token", "stt", onCreated),
    );

    await waitFor(() => expect(result.current.datasetsLoading).toBe(false));
    expect(result.current.datasetsError).toBe("Failed to load datasets");
  });

  it("re-fetches when accessToken or datasetType changes", async () => {
    mockListDatasets.mockResolvedValue(sampleDatasets);
    const onCreated = jest.fn();
    const { result, rerender } = renderHook(
      ({ token, type }: { token: string | null; type: "stt" | "tts" }) =>
        useDatasetManagement(token, type, onCreated),
      { initialProps: { token: "token-1", type: "stt" as const } },
    );

    await waitFor(() => expect(mockListDatasets).toHaveBeenCalledTimes(1));

    rerender({ token: "token-2", type: "stt" as const });
    await waitFor(() => expect(mockListDatasets).toHaveBeenCalledTimes(2));
    expect(mockListDatasets).toHaveBeenLastCalledWith("token-2", "stt");

    rerender({ token: "token-2", type: "tts" as const });
    await waitFor(() => expect(mockListDatasets).toHaveBeenCalledTimes(3));
    expect(mockListDatasets).toHaveBeenLastCalledWith("token-2", "tts");

    expect(result.current).toBeDefined();
  });

  it("exposes fetchDatasets to manually re-trigger the fetch", async () => {
    mockListDatasets.mockResolvedValue(sampleDatasets);
    const onCreated = jest.fn();
    const { result } = renderHook(() =>
      useDatasetManagement("token", "stt", onCreated),
    );

    await waitFor(() => expect(result.current.datasetsLoading).toBe(false));
    mockListDatasets.mockClear();

    await act(async () => {
      await result.current.fetchDatasets();
    });

    expect(mockListDatasets).toHaveBeenCalledTimes(1);
  });

  describe("handleDeleteDataset", () => {
    it("does nothing when accessToken is null", async () => {
      const onCreated = jest.fn();
      const onDeleted = jest.fn();
      const { result } = renderHook(() =>
        useDatasetManagement(null, "stt", onCreated, onDeleted),
      );

      await act(async () => {
        await result.current.handleDeleteDataset("d1");
      });

      expect(mockDeleteDataset).not.toHaveBeenCalled();
      expect(result.current.isDeletingDataset).toBe(false);
    });

    it("removes the dataset, clears deleteDatasetId, and calls onDeleted on success", async () => {
      mockListDatasets.mockResolvedValue(sampleDatasets);
      mockDeleteDataset.mockResolvedValue(undefined);
      const onCreated = jest.fn();
      const onDeleted = jest.fn();
      const { result } = renderHook(() =>
        useDatasetManagement("token", "stt", onCreated, onDeleted),
      );

      await waitFor(() => expect(result.current.datasetsLoading).toBe(false));

      act(() => {
        result.current.setDeleteDatasetId("d1");
      });

      await act(async () => {
        await result.current.handleDeleteDataset("d1");
      });

      expect(mockDeleteDataset).toHaveBeenCalledWith("token", "d1");
      expect(result.current.datasets).toEqual([]);
      expect(result.current.deleteDatasetId).toBeNull();
      expect(onDeleted).toHaveBeenCalledWith("d1");
      expect(result.current.isDeletingDataset).toBe(false);
    });

    it("works without an onDeleted callback", async () => {
      mockListDatasets.mockResolvedValue(sampleDatasets);
      mockDeleteDataset.mockResolvedValue(undefined);
      const onCreated = jest.fn();
      const { result } = renderHook(() =>
        useDatasetManagement("token", "stt", onCreated),
      );

      await waitFor(() => expect(result.current.datasetsLoading).toBe(false));

      await act(async () => {
        await result.current.handleDeleteDataset("d1");
      });

      expect(result.current.datasets).toEqual([]);
    });

    it("reports and toasts an error when deletion fails", async () => {
      mockListDatasets.mockResolvedValue(sampleDatasets);
      mockDeleteDataset.mockRejectedValue(new Error("delete failed"));
      const onCreated = jest.fn();
      const { result } = renderHook(() =>
        useDatasetManagement("token", "stt", onCreated),
      );

      await waitFor(() => expect(result.current.datasetsLoading).toBe(false));

      await act(async () => {
        await result.current.handleDeleteDataset("d1");
      });

      expect(mockReportError).toHaveBeenCalledWith(
        "Failed to delete dataset:",
        expect.any(Error),
      );
      expect(mockToastError).toHaveBeenCalledWith(
        "Failed to delete dataset. Please try again.",
      );
      expect(result.current.isDeletingDataset).toBe(false);
      // dataset list unchanged on failure
      expect(result.current.datasets).toEqual(sampleDatasets);
    });
  });

  describe("handleCreateDataset", () => {
    it("does nothing when accessToken is null", async () => {
      const onCreated = jest.fn();
      const { result } = renderHook(() =>
        useDatasetManagement(null, "stt", onCreated),
      );

      act(() => {
        result.current.setNewDatasetName("My Dataset");
      });

      await act(async () => {
        await result.current.handleCreateDataset();
      });

      expect(mockCreateDataset).not.toHaveBeenCalled();
    });

    it("does nothing when newDatasetName is empty/whitespace", async () => {
      mockListDatasets.mockResolvedValue([]);
      const onCreated = jest.fn();
      const { result } = renderHook(() =>
        useDatasetManagement("token", "stt", onCreated),
      );
      await waitFor(() => expect(result.current.datasetsLoading).toBe(false));

      act(() => {
        result.current.setNewDatasetName("   ");
      });

      await act(async () => {
        await result.current.handleCreateDataset();
      });

      expect(mockCreateDataset).not.toHaveBeenCalled();
    });

    it("creates the dataset, closes the modal, clears the name, and calls onCreated", async () => {
      mockListDatasets.mockResolvedValue([]);
      mockCreateDataset.mockResolvedValue({ uuid: "new-uuid", name: "New" });
      const onCreated = jest.fn();
      const { result } = renderHook(() =>
        useDatasetManagement("token", "stt", onCreated),
      );
      await waitFor(() => expect(result.current.datasetsLoading).toBe(false));

      act(() => {
        result.current.setShowCreateModal(true);
        result.current.setNewDatasetName("  New Dataset  ");
      });

      await act(async () => {
        await result.current.handleCreateDataset();
      });

      expect(mockCreateDataset).toHaveBeenCalledWith(
        "token",
        "New Dataset",
        "stt",
      );
      expect(result.current.showCreateModal).toBe(false);
      expect(result.current.newDatasetName).toBe("");
      expect(onCreated).toHaveBeenCalledWith("new-uuid");
      expect(result.current.isCreating).toBe(false);
    });

    it("reports and toasts an error when creation fails", async () => {
      mockListDatasets.mockResolvedValue([]);
      mockCreateDataset.mockRejectedValue(new Error("create failed"));
      const onCreated = jest.fn();
      const { result } = renderHook(() =>
        useDatasetManagement("token", "stt", onCreated),
      );
      await waitFor(() => expect(result.current.datasetsLoading).toBe(false));

      act(() => {
        result.current.setNewDatasetName("New Dataset");
      });

      await act(async () => {
        await result.current.handleCreateDataset();
      });

      expect(mockReportError).toHaveBeenCalledWith(
        "Failed to create dataset:",
        expect.any(Error),
      );
      expect(mockToastError).toHaveBeenCalledWith(
        "Failed to create dataset. Please try again.",
      );
      expect(result.current.isCreating).toBe(false);
      expect(onCreated).not.toHaveBeenCalled();
    });
  });

  describe("caching + dedup", () => {
    it("dedupes concurrent mounts for the same token+type into one request", async () => {
      mockListDatasets.mockResolvedValue(sampleDatasets);
      const { result: a } = renderHook(() =>
        useDatasetManagement("shared", "stt", jest.fn()),
      );
      const { result: b } = renderHook(() =>
        useDatasetManagement("shared", "stt", jest.fn()),
      );

      await waitFor(() => expect(a.current.datasetsLoading).toBe(false));
      await waitFor(() => expect(b.current.datasetsLoading).toBe(false));

      expect(mockListDatasets).toHaveBeenCalledTimes(1);
    });

    it("hydrates a later mount from cache without refetching", async () => {
      mockListDatasets.mockResolvedValue(sampleDatasets);
      const first = renderHook(() =>
        useDatasetManagement("tok", "stt", jest.fn()),
      );
      await waitFor(() =>
        expect(first.result.current.datasetsLoading).toBe(false),
      );
      expect(mockListDatasets).toHaveBeenCalledTimes(1);

      const second = renderHook(() =>
        useDatasetManagement("tok", "stt", jest.fn()),
      );
      expect(second.result.current.datasetsLoading).toBe(false);
      expect(second.result.current.datasets).toEqual(sampleDatasets);
      expect(mockListDatasets).toHaveBeenCalledTimes(1);
    });

    it("delete updates the cache so a remount shows the pruned list", async () => {
      mockListDatasets.mockResolvedValue([
        sampleDatasets[0],
        { ...sampleDatasets[0], uuid: "d2", name: "Dataset 2" },
      ]);
      mockDeleteDataset.mockResolvedValue(undefined);

      const { result } = renderHook(() =>
        useDatasetManagement("tok", "stt", jest.fn()),
      );
      await waitFor(() => expect(result.current.datasetsLoading).toBe(false));

      await act(async () => {
        await result.current.handleDeleteDataset("d1");
      });

      const again = renderHook(() =>
        useDatasetManagement("tok", "stt", jest.fn()),
      );
      expect(again.result.current.datasets.map((d) => d.uuid)).toEqual(["d2"]);
      expect(mockListDatasets).toHaveBeenCalledTimes(1);
    });

    it("create invalidates the cache so a remount refetches", async () => {
      mockListDatasets.mockResolvedValue(sampleDatasets);
      mockCreateDataset.mockResolvedValue({ uuid: "new", name: "New" });

      const { result } = renderHook(() =>
        useDatasetManagement("tok", "stt", jest.fn()),
      );
      await waitFor(() => expect(result.current.datasetsLoading).toBe(false));

      act(() => result.current.setNewDatasetName("New"));
      await act(async () => {
        await result.current.handleCreateDataset();
      });

      const again = renderHook(() =>
        useDatasetManagement("tok", "stt", jest.fn()),
      );
      await waitFor(() =>
        expect(again.result.current.datasetsLoading).toBe(false),
      );
      expect(mockListDatasets).toHaveBeenCalledTimes(2);
    });
  });
});
