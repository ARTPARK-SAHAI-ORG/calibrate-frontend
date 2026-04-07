import { useState, useCallback, useEffect } from "react";
import { toast } from "sonner";
import {
  listDatasets,
  createDataset,
  deleteDataset,
  Dataset,
} from "@/lib/datasets";

export function useDatasetManagement(
  accessToken: string | null,
  datasetType: "stt" | "tts",
  onCreated: (uuid: string) => void,
  onDeleted?: (uuid: string) => void,
) {
  const [datasets, setDatasets] = useState<Dataset[]>([]);
  const [datasetsLoading, setDatasetsLoading] = useState(true);
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
      const data = await listDatasets(accessToken, datasetType);
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
    fetchDatasets();
  }, [fetchDatasets]);

  const handleDeleteDataset = async (uuid: string) => {
    if (!accessToken) return;
    setIsDeletingDataset(true);
    try {
      await deleteDataset(accessToken, uuid);
      setDatasets((prev) => prev.filter((d) => d.uuid !== uuid));
      setDeleteDatasetId(null);
      onDeleted?.(uuid);
    } catch (err) {
      console.error("Failed to delete dataset:", err);
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
      setShowCreateModal(false);
      setNewDatasetName("");
      onCreated(dataset.uuid);
    } catch (err) {
      console.error("Failed to create dataset:", err);
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
