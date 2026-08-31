"use client";
import { reportError } from "@/lib/reportError";

import { useState, useEffect, useCallback, useRef } from "react";
import { useParams, useRouter } from "@/lib/nav";
import {
  useAccessToken,
  useMaxRowsPerEval,
  usePageErrorState,
  useUnsavedChangesPrompt,
} from "@/hooks";
import { AppLayout } from "@/components/AppLayout";
import {
  Breadcrumbs,
  ConfirmDialog,
  NotFoundState,
  RenameDialog,
  type Crumb,
} from "@/components/ui";
import { useSidebarState } from "@/lib/sidebar";
import {
  getDataset,
  renameDataset,
  deleteDatasetItem,
  updateDatasetItem,
  addDatasetItems,
  DatasetDetail,
} from "@/lib/datasets";
import {
  STTDatasetEditor,
  STTDatasetEditorHandle,
} from "@/components/evaluations/STTDatasetEditor";
import {
  TTSDatasetEditor,
  TTSDatasetEditorHandle,
} from "@/components/evaluations/TTSDatasetEditor";
import { toast } from "sonner";
import { Tooltip } from "@/components/Tooltip";
import { SpinnerIcon } from "@/components/icons";

export default function DatasetDetailPage() {
  const router = useRouter();
  const params = useParams();
  const datasetId = params.id as string;
  const accessToken = useAccessToken();
  const [sidebarOpen, setSidebarOpen] = useSidebarState();

  const [dataset, setDataset] = useState<DatasetDetail | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const {
    errorCode,
    reset: resetErrorCode,
    captureError,
  } = usePageErrorState();
  const [isSaving, setIsSaving] = useState(false);
  // True while a zip's clips are still going up. Those rows have nothing to
  // save yet, so Save waits for them.
  const [isUploadingRows, setIsUploadingRows] = useState(false);
  const [hasPendingChanges, setHasPendingChanges] = useState(false);
  const [isRenaming, setIsRenaming] = useState(false);
  // Rows typed but not saved. They are not in the dataset yet, so they are
  // counted next to the item count rather than added into it.
  const [unsavedRowCount, setUnsavedRowCount] = useState(0);
  // Changes live only in the editor until Save, so leaving the page loses them.
  const { guard, isPrompting, stay, leave } =
    useUnsavedChangesPrompt(hasPendingChanges);

  const sttEditorRef = useRef<STTDatasetEditorHandle | null>(null);
  const ttsEditorRef = useRef<TTSDatasetEditorHandle | null>(null);
  const maxRowsPerEval = useMaxRowsPerEval();

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
      resetErrorCode();
      const data = await getDataset(accessToken, datasetId);
      setDataset(data);
    } catch (err) {
      if (captureError(err)) return;
      setError(err instanceof Error ? err.message : "Failed to load dataset");
    } finally {
      setIsLoading(false);
    }
  }, [accessToken, datasetId, resetErrorCode, captureError]);

  useEffect(() => {
    fetchDataset();
  }, [fetchDataset]);

  // Deletion is handled inside each editor via onDeleteSavedItem
  const handleDeleteItem = async (itemUuid: string) => {
    if (!accessToken || !datasetId) return;
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
    } catch (err) {
      reportError("Failed to delete item:", err);
      toast.error("Failed to delete item. Please try again.");
      throw err;
    }
  };

  const handleSave = async () => {
    if (!accessToken || !dataset) return;

    const isStt = dataset.dataset_type === "stt";
    const editorRef = isStt ? sttEditorRef : ttsEditorRef;

    if (isStt && sttEditorRef.current && !sttEditorRef.current.validate()) {
      toast.error(
        "Enter reference transcription for every row with uploaded audio.",
      );
      return;
    }

    const dirtyUpdates = editorRef.current?.getDirtyUpdates() ?? [];
    const newRowsPayload = editorRef.current?.getNewRows() ?? [];
    if (dirtyUpdates.length === 0 && newRowsPayload.length === 0) return;

    setIsSaving(true);
    try {
      await Promise.all(
        dirtyUpdates.map((u) =>
          updateDatasetItem(accessToken, dataset.uuid, u.uuid, u.text),
        ),
      );
      if (newRowsPayload.length > 0) {
        await addDatasetItems(accessToken, dataset.uuid, newRowsPayload);
      }
      // Read the dataset back BEFORE clearing the editor. Clearing first
      // takes the just-added rows off screen and leaves a gap until the
      // refreshed list arrives.
      await fetchDataset();
      editorRef.current?.clearDirtyUpdates();
      editorRef.current?.clearNewRows();
      const parts: string[] = [];
      if (dirtyUpdates.length > 0)
        parts.push(
          `${dirtyUpdates.length} item${dirtyUpdates.length !== 1 ? "s" : ""} updated`,
        );
      if (newRowsPayload.length > 0)
        parts.push(
          `${newRowsPayload.length} item${newRowsPayload.length !== 1 ? "s" : ""} added`,
        );
      toast.success(parts.join(", ") + ".");
    } catch (err) {
      reportError("Failed to save:", err);
      toast.error("Failed to save. Please try again.");
    } finally {
      setIsSaving(false);
    }
  };

  const datasetType = dataset?.dataset_type ?? "stt";
  const crumbs: Crumb[] = [
    {
      label: datasetType === "tts" ? "Text-to-Speech" : "Speech-to-Text",
      href: `/${datasetType}`,
    },
    { label: "Datasets", href: `/${datasetType}?tab=datasets` },
    {
      label: dataset?.name ?? "Dataset",
      ...(dataset
        ? { onClick: () => setIsRenaming(true), title: "Rename the dataset" }
        : {}),
    },
  ];

  return (
    <AppLayout
      activeItem={datasetType}
      onItemChange={(itemId) => guard(() => router.push(`/${itemId}`))}
      sidebarOpen={sidebarOpen}
      onSidebarToggle={() => setSidebarOpen(!sidebarOpen)}
      customHeader={<Breadcrumbs items={crumbs} />}
    >
      <div className="space-y-4 md:space-y-6 py-4 md:py-6">
        {/* AppLayout hides `customHeader` below md. */}
        <Breadcrumbs items={crumbs} className="md:hidden" />

        {errorCode ? (
          <NotFoundState errorCode={errorCode} />
        ) : isLoading && !dataset ? (
          // Only the first load takes over the page. Refreshing after a save
          // keeps the rows on screen: the spinner in the Save button already
          // says the work is happening.
          <div className="flex items-center justify-center gap-3 py-8">
            <svg
              className="w-5 h-5 animate-spin"
              fill="none"
              viewBox="0 0 24 24"
            >
              <circle
                className="opacity-25"
                cx="12"
                cy="12"
                r="10"
                stroke="currentColor"
                strokeWidth="4"
              />
              <path
                className="opacity-75"
                fill="currentColor"
                d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
              />
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
            {/* Header. Stays put while the rows scroll under it, so the Save
                button is always in reach on a long dataset. */}
            <div className="sticky top-0 z-10 -mx-4 md:-mx-6 lg:-mx-8 px-4 md:px-6 lg:px-8 -mt-4 md:-mt-6 pt-4 md:pt-6 pb-3 bg-background flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
              <div>
                <div className="flex items-center gap-2 flex-wrap">
                  <h1 className="text-xl md:text-2xl font-semibold">
                    {dataset.name}
                  </h1>
                  {/* Same pencil as the evaluator page's header. */}
                  <Tooltip content="Rename the dataset" position="top">
                    <button
                      onClick={() => setIsRenaming(true)}
                      aria-label="Rename the dataset"
                      className="w-9 h-9 flex items-center justify-center rounded-md border border-border bg-background text-foreground hover:bg-muted transition-colors cursor-pointer flex-shrink-0"
                    >
                      <svg
                        className="w-5 h-5"
                        fill="none"
                        viewBox="0 0 24 24"
                        stroke="currentColor"
                        strokeWidth={1.75}
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          d="M16.862 4.487l1.687-1.688a1.875 1.875 0 112.652 2.652L10.582 16.07a4.5 4.5 0 01-1.897 1.13l-2.685.8.8-2.685a4.5 4.5 0 011.13-1.897L16.862 4.487zm0 0L19.5 7.125"
                        />
                      </svg>
                    </button>
                  </Tooltip>
                </div>
                <p className="text-muted-foreground text-sm mt-1">
                  {dataset.item_count} item{dataset.item_count !== 1 ? "s" : ""}
                  {unsavedRowCount > 0 && `, ${unsavedRowCount} not saved yet`}
                </p>
              </div>
              <div className="flex items-center gap-2">
                {hasPendingChanges && (
                  <button
                    onClick={handleSave}
                    disabled={isSaving || isUploadingRows}
                    className="h-9 px-4 rounded-md text-sm font-semibold bg-foreground text-background hover:opacity-90 transition-opacity cursor-pointer flex-shrink-0 disabled:opacity-50 disabled:cursor-not-allowed shadow-sm inline-flex items-center justify-center gap-2"
                  >
                    {(isSaving || isUploadingRows) && (
                      <SpinnerIcon className="w-4 h-4 animate-spin" />
                    )}
                    {isUploadingRows
                      ? "Uploading..."
                      : isSaving
                        ? "Saving..."
                        : "Save"}
                  </button>
                )}
                {dataset.item_count === 0 ? null : !hasPendingChanges ? (
                  <button
                    type="button"
                    onClick={() =>
                      router.push(
                        `/${dataset.dataset_type}/new?dataset=${dataset.uuid}`,
                      )
                    }
                    className="h-9 px-4 rounded-md text-sm font-medium flex-shrink-0 bg-foreground text-background hover:opacity-90 transition-opacity cursor-pointer shadow-sm"
                  >
                    New evaluation
                  </button>
                ) : (
                  <Tooltip
                    content="Save your changes before starting an evaluation."
                    position="top"
                    className="flex-shrink-0"
                  >
                    <div className="inline-flex flex-shrink-0">
                      <button
                        type="button"
                        disabled
                        tabIndex={-1}
                        aria-disabled="true"
                        className="h-9 px-4 rounded-md text-sm font-medium flex-shrink-0 border border-border bg-background text-foreground opacity-60 cursor-not-allowed pointer-events-none"
                      >
                        New evaluation
                      </button>
                    </div>
                  </Tooltip>
                )}
              </div>
            </div>

            {/* Items */}
            {dataset.dataset_type === "stt" ? (
              <STTDatasetEditor
                ref={sttEditorRef}
                accessToken={accessToken}
                savedItems={[...dataset.items].sort(
                  (a, b) => a.order_index - b.order_index,
                )}
                onDeleteSavedItem={handleDeleteItem}
                onHasPendingChangesChange={setHasPendingChanges}
                onUnsavedRowCountChange={setUnsavedRowCount}
                onUploadingChange={setIsUploadingRows}
                maxRowsPerEval={maxRowsPerEval}
              />
            ) : (
              <TTSDatasetEditor
                ref={ttsEditorRef}
                savedItems={[...dataset.items].sort(
                  (a, b) => a.order_index - b.order_index,
                )}
                onDeleteSavedItem={handleDeleteItem}
                onHasPendingChangesChange={setHasPendingChanges}
                onUnsavedRowCountChange={setUnsavedRowCount}
                maxRowsPerEval={maxRowsPerEval}
              />
            )}
          </>
        ) : null}
      </div>

      <RenameDialog
        isOpen={isRenaming}
        title="Rename the dataset"
        initialName={dataset?.name ?? ""}
        onClose={() => setIsRenaming(false)}
        onRename={async (name) => {
          if (!accessToken || !dataset) return;
          try {
            await renameDataset(accessToken, dataset.uuid, name);
            setDataset((prev) => (prev ? { ...prev, name } : prev));
            toast.success("Dataset renamed.");
          } catch (err) {
            // The backend refuses a name another dataset in this workspace
            // already has.
            if (err instanceof Error && err.message.includes("409")) {
              return "A dataset with this name already exists.";
            }
            reportError("Failed to rename dataset:", err);
            return "Could not rename the dataset. Please try again.";
          }
        }}
      />

      <ConfirmDialog
        isOpen={isPrompting}
        onClose={stay}
        onConfirm={leave}
        title="Leave without saving?"
        message="Your changes will be lost"
        confirmText="Leave"
      />
    </AppLayout>
  );
}
