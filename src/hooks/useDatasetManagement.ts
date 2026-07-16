import { reportError } from "@/lib/reportError";
import { useState, useCallback, useEffect } from "react";
import { toast } from "sonner";
import {
  listDatasets,
  createDataset,
  deleteDataset,
  Dataset,
} from "@/lib/datasets";
import { createRequestCache } from "@/lib/requestCache";

// Module-level cache + in-flight dedup for the datasets list, keyed by
// `${accessToken}:${datasetType}`. The STT and TTS pages mount this hook on
// every visit; without the cache each navigation refetches the full list. A
// short TTL keeps the list reasonably fresh while skipping the redundant
// refetch on rapid remounts, and the hook keeps the cache in sync on
// create/delete.
const datasetsCache = createRequestCache<Dataset[]>({ ttlMs: 30_000 });
const cacheKey = (accessToken: string, datasetType: string) =>
  `${accessToken}:${datasetType}`;

export function useDatasetManagement(
  accessToken: string | null,
  datasetType: "stt" | "tts",
  onCreated: (uuid: string) => void,
  onDeleted?: (uuid: string) => void,
) {
  const cached = accessToken
    ? datasetsCache.peek(cacheKey(accessToken, datasetType))
    : undefined;
  const [datasets, setDatasets] = useState<Dataset[]>(cached ?? []);
  const [datasetsLoading, setDatasetsLoading] = useState(!cached);
  const [datasetsError, setDatasetsError] = useState<string | null>(null);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [newDatasetName, setNewDatasetName] = useState("");
  const [isCreating, setIsCreating] = useState(false);
  const [deleteDatasetId, setDeleteDatasetId] = useState<string | null>(null);
  const [isDeletingDataset, setIsDeletingDataset] = useState(false);

  const fetchDatasets = useCallback(async () => {
    if (!accessToken) return;
    try {
      setDatasetsLoading(true);
      setDatasetsError(null);
      const data = await datasetsCache.fetch(
        cacheKey(accessToken, datasetType),
        () => listDatasets(accessToken, datasetType),
      );
      setDatasets(data);
    } catch (err) {
      setDatasetsError(
        err instanceof Error ? err.message : "Failed to load datasets",
      );
    } finally {
      setDatasetsLoading(false);
    }
  }, [accessToken, datasetType]);

  useEffect(() => {
    if (!accessToken) return;
    // Hydrate from a fresh cache entry without hitting the network; only fetch
    // on a cache miss.
    const hit = datasetsCache.peek(cacheKey(accessToken, datasetType));
    if (hit) {
      setDatasets(hit);
      setDatasetsLoading(false);
      return;
    }
    fetchDatasets();
  }, [accessToken, datasetType, fetchDatasets]);

  const handleDeleteDataset = async (uuid: string) => {
    if (!accessToken) return;
    setIsDeletingDataset(true);
    try {
      await deleteDataset(accessToken, uuid);
      setDatasets((prev) => {
        const next = prev.filter((d) => d.uuid !== uuid);
        datasetsCache.set(cacheKey(accessToken, datasetType), next);
        return next;
      });
      setDeleteDatasetId(null);
      onDeleted?.(uuid);
    } catch (err) {
      reportError("Failed to delete dataset:", err);
      toast.error("Failed to delete dataset. Please try again.");
    } finally {
      setIsDeletingDataset(false);
    }
  };

  const handleCreateDataset = async () => {
    if (!accessToken || !newDatasetName.trim()) return;
    setIsCreating(true);
    try {
      const dataset = await createDataset(
        accessToken,
        newDatasetName.trim(),
        datasetType,
      );
      // The new dataset isn't in the cached list; drop the entry so the next
      // mount refetches instead of serving a stale list missing it.
      datasetsCache.invalidate(cacheKey(accessToken, datasetType));
      setShowCreateModal(false);
      setNewDatasetName("");
      onCreated(dataset.uuid);
    } catch (err) {
      reportError("Failed to create dataset:", err);
      toast.error("Failed to create dataset. Please try again.");
    } finally {
      setIsCreating(false);
    }
  };

  return {
    datasets,
    datasetsLoading,
    datasetsError,
    showCreateModal,
    setShowCreateModal,
    newDatasetName,
    setNewDatasetName,
    isCreating,
    deleteDatasetId,
    setDeleteDatasetId,
    isDeletingDataset,
    fetchDatasets,
    handleDeleteDataset,
    handleCreateDataset,
  };
}
