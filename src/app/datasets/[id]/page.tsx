"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { useRouter, useParams } from "next/navigation";
import { useAccessToken } from "@/hooks";
import { AppLayout } from "@/components/AppLayout";
import { useSidebarState } from "@/lib/sidebar";
import {
  getDataset,
  deleteDatasetItem,
  updateDatasetItem,
  addDatasetItems,
  DatasetDetail,
  DatasetItem,
} from "@/lib/datasets";
import { DeleteConfirmationDialog } from "@/components/DeleteConfirmationDialog";
import {
  STTDatasetEditor,
  STTDatasetEditorHandle,
} from "@/components/evaluations/STTDatasetEditor";
import { toast } from "sonner";

export default function DatasetDetailPage() {
  const router = useRouter();
  const params = useParams();
  const datasetId = params.id as string;
  const accessToken = useAccessToken();
  const [sidebarOpen, setSidebarOpen] = useSidebarState();

  const [dataset, setDataset] = useState<DatasetDetail | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [hasPendingChanges, setHasPendingChanges] = useState(false);

  // TTS-only delete state (STT deletion is handled inside STTDatasetEditor)
  const [deleteItemId, setDeleteItemId] = useState<string | null>(null);
  const [isDeletingItem, setIsDeletingItem] = useState(false);

  const editorRef = useRef<STTDatasetEditorHandle | null>(null);

  useEffect(() => {
    if (dataset) {
      document.title = `${dataset.name} | Datasets | Calibrate`;
    }
  }, [dataset]);

  const fetchDataset = useCallback(async () => {
    if (!accessToken || !datasetId) return;
    try {
      setIsLoading(true);
      setError(null);
      const data = await getDataset(accessToken, datasetId);
      setDataset(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load dataset");
    } finally {
      setIsLoading(false);
    }
  }, [accessToken, datasetId]);

  useEffect(() => {
    fetchDataset();
  }, [fetchDataset]);

  const handleDeleteItem = async (itemUuid: string) => {
    if (!accessToken || !datasetId) return;
    setIsDeletingItem(true);
    try {
      await deleteDatasetItem(accessToken, datasetId, itemUuid);
      setDataset((prev) => {
        if (!prev) return prev;
        return {
          ...prev,
          items: prev.items.filter((item) => item.uuid !== itemUuid),
          item_count: prev.item_count - 1,
        };
      });
      setDeleteItemId(null);
    } catch (err) {
      console.error("Failed to delete item:", err);
    } finally {
      setIsDeletingItem(false);
    }
  };

  const handleSave = async () => {
    if (!accessToken || !dataset) return;
    const dirtyUpdates = editorRef.current?.getDirtyUpdates() ?? [];
    const newRows = editorRef.current?.getNewRows() ?? [];
    if (dirtyUpdates.length === 0 && newRows.length === 0) return;
    setIsSaving(true);
    try {
      await Promise.all(
        dirtyUpdates.map((u) => updateDatasetItem(accessToken, dataset.uuid, u.uuid, u.text)),
      );
      if (newRows.length > 0) {
        await addDatasetItems(accessToken, dataset.uuid, newRows);
      }
      editorRef.current?.clearDirtyUpdates();
      await fetchDataset();
      const parts: string[] = [];
      if (dirtyUpdates.length > 0) parts.push(`${dirtyUpdates.length} transcript${dirtyUpdates.length !== 1 ? "s" : ""} updated`);
      if (newRows.length > 0) parts.push(`${newRows.length} item${newRows.length !== 1 ? "s" : ""} added`);
      toast.success(parts.join(", ") + ".");
    } catch (err) {
      console.error("Failed to save:", err);
      toast.error("Failed to save. Please try again.");
    } finally {
      setIsSaving(false);
    }
  };

  const itemToDelete = dataset?.items.find(
    (i: DatasetItem) => i.uuid === deleteItemId,
  );

  return (
    <AppLayout
      activeItem={dataset?.dataset_type ?? "stt"}
      onItemChange={(itemId) => router.push(`/${itemId}`)}
      sidebarOpen={sidebarOpen}
      onSidebarToggle={() => setSidebarOpen(!sidebarOpen)}
    >
      <div className="space-y-4 md:space-y-6 py-4 md:py-6">
        {/* Back link */}
        <button
          onClick={() =>
            router.push(`/${dataset?.dataset_type ?? "stt"}?tab=datasets`)
          }
          className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors cursor-pointer"
        >
          <svg
            className="w-4 h-4"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={2}
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M10.5 19.5L3 12m0 0l7.5-7.5M3 12h18"
            />
          </svg>
          Back to Datasets
        </button>

        {isLoading ? (
          <div className="flex items-center justify-center gap-3 py-8">
            <svg className="w-5 h-5 animate-spin" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
            </svg>
          </div>
        ) : error ? (
          <div className="border border-border rounded-xl p-8 flex flex-col items-center justify-center bg-muted/20">
            <p className="text-sm text-red-500 mb-2">{error}</p>
            <button
              onClick={fetchDataset}
              className="text-sm text-muted-foreground hover:text-foreground transition-colors cursor-pointer"
            >
              Retry
            </button>
          </div>
        ) : dataset ? (
          <>
            {/* Header */}
            <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
              <div>
                <div className="flex items-center gap-2 flex-wrap">
                  <h1 className="text-xl md:text-2xl font-semibold">
                    {dataset.name}
                  </h1>
                  <span className="inline-flex items-center px-2 py-0.5 rounded-md text-xs font-medium bg-muted text-foreground uppercase">
                    {dataset.dataset_type}
                  </span>
                </div>
                <p className="text-muted-foreground text-sm mt-1">
                  {dataset.item_count} item{dataset.item_count !== 1 ? "s" : ""}
                </p>
              </div>
              <div className="flex items-center gap-2">
                {dataset.dataset_type === "stt" && hasPendingChanges && (
                  <button
                    onClick={handleSave}
                    disabled={isSaving}
                    className="h-9 px-4 rounded-md text-sm font-medium border border-border hover:bg-muted/50 transition-colors cursor-pointer flex-shrink-0 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {isSaving ? "Saving..." : "Save"}
                  </button>
                )}
                <button
                  onClick={() => router.push(`/${dataset.dataset_type}/new?dataset=${dataset.uuid}`)}
                  className="h-9 px-4 rounded-md text-sm font-medium bg-foreground text-background hover:opacity-90 transition-opacity cursor-pointer flex-shrink-0"
                >
                  New evaluation
                </button>
              </div>
            </div>

            {/* Items */}
            {dataset.dataset_type === "stt" ? (
              /* STT: reusable editor with saved items */
              <STTDatasetEditor
                ref={editorRef}
                accessToken={accessToken}
                savedItems={[...dataset.items].sort(
                  (a, b) => a.order_index - b.order_index,
                )}
                onDeleteSavedItem={handleDeleteItem}
                onHasPendingChangesChange={setHasPendingChanges}
              />
            ) : (
              /* TTS: plain table */
              dataset.items.length === 0 ? (
                <div className="border border-border rounded-xl p-8 md:p-12 flex flex-col items-center justify-center bg-muted/20">
                  <p className="text-sm text-muted-foreground">
                    This dataset has no items yet. Items are added when you run an
                    evaluation with a dataset name.
                  </p>
                </div>
              ) : (
                <div className="border border-border rounded-xl overflow-hidden">
                  <div className="hidden md:grid gap-4 px-4 py-2 border-b border-border bg-muted/30 grid-cols-[40px_1fr_40px]">
                    <div className="text-sm font-medium text-muted-foreground">#</div>
                    <div className="text-sm font-medium text-muted-foreground">Text</div>
                    <div />
                  </div>
                  {[...dataset.items]
                    .sort((a: DatasetItem, b: DatasetItem) => a.order_index - b.order_index)
                    .map((item: DatasetItem, index: number) => (
                      <div
                        key={item.uuid}
                        className="flex flex-col md:grid gap-2 md:gap-4 px-4 py-3 border-b border-border last:border-b-0 hover:bg-muted/10 transition-colors md:grid-cols-[40px_1fr_40px]"
                      >
                        <div className="flex items-center">
                          <span className="text-sm text-muted-foreground">{index + 1}</span>
                        </div>
                        <div className="flex items-center">
                          <span className="text-sm text-foreground">{item.text}</span>
                        </div>
                        <div className="flex items-center justify-end">
                          <button
                            title="Delete item"
                            onClick={() => setDeleteItemId(item.uuid)}
                            className="p-1.5 rounded hover:bg-muted/50 text-muted-foreground hover:text-red-500 transition-colors cursor-pointer"
                          >
                            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                              <path strokeLinecap="round" strokeLinejoin="round" d="M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 01-2.244 2.077H8.084a2.25 2.25 0 01-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 00-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 013.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 00-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 00-7.5 0" />
                            </svg>
                          </button>
                        </div>
                      </div>
                    ))}
                </div>
              )
            )}
          </>
        ) : null}
      </div>

      {/* TTS delete confirmation */}
      {deleteItemId && itemToDelete && (
        <DeleteConfirmationDialog
          isOpen={true}
          onClose={() => setDeleteItemId(null)}
          onConfirm={() => handleDeleteItem(deleteItemId)}
          title="Delete item"
          message="Remove item from this dataset?"
          isDeleting={isDeletingItem}
        />
      )}
    </AppLayout>
  );
}
