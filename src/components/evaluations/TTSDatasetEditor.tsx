"use client";

import {
  useState,
  useRef,
  useEffect,
  forwardRef,
  useImperativeHandle,
} from "react";
import { toast } from "sonner";
import { LIMITS, CONTACT_LINK } from "@/constants/limits";
import { DeleteConfirmationDialog } from "../DeleteConfirmationDialog";
import type { DatasetItem } from "@/lib/datasets";

// ─── Types ────────────────────────────────────────────────────────────────────

type NewRow = {
  id: string;
  text: string;
};

export type TTSDatasetEditorHandle = {
  /** Returns new rows that have text */
  getNewRows: () => { text: string }[];
  /** Returns saved items whose transcript has been locally edited */
  getDirtyUpdates: () => { uuid: string; text: string }[];
  /** Clears local edits (call after a successful save) */
  clearDirtyUpdates: () => void;
  /** Resets new rows to a single blank row (call after a successful save) */
  clearNewRows: () => void;
};

type Props = {
  /** Pre-populated saved items (edit mode) */
  savedItems?: DatasetItem[];
  onDeleteSavedItem?: (uuid: string) => Promise<void>;
  /** Called when pending changes (new rows or dirty transcripts) appear/disappear */
  onHasPendingChangesChange?: (has: boolean) => void;
  /** Show the dataset name input at the top */
  showDatasetName?: boolean;
  datasetName?: string;
  onDatasetNameChange?: (name: string) => void;
  datasetNameInvalid?: boolean;
};

// ─── Component ────────────────────────────────────────────────────────────────

export const TTSDatasetEditor = forwardRef<TTSDatasetEditorHandle, Props>(
  function TTSDatasetEditor(
    {
      savedItems = [],
      onDeleteSavedItem,
      onHasPendingChangesChange,
      showDatasetName = false,
      datasetName = "",
      onDatasetNameChange,
      datasetNameInvalid = false,
    },
    ref,
  ) {
    const [newRows, setNewRows] = useState<NewRow[]>([{ id: "1", text: "" }]);
    const [invalidRowIds, setInvalidRowIds] = useState<Set<string>>(new Set());
    const [deleteNewRowId, setDeleteNewRowId] = useState<string | null>(null);
    const [deleteSavedId, setDeleteSavedId] = useState<string | null>(null);
    const [isDeletingSaved, setIsDeletingSaved] = useState(false);
    const [editedTexts, setEditedTexts] = useState<Record<string, string>>({});

    const fileInputRef = useRef<HTMLInputElement>(null);

    // Notify parent when there are pending changes
    useEffect(() => {
      const hasNewRows = newRows.some((r) => r.text.trim());
      const hasDirty = savedItems.some(
        (item) =>
          editedTexts[item.uuid] !== undefined &&
          editedTexts[item.uuid] !== item.text,
      );
      onHasPendingChangesChange?.(hasNewRows || hasDirty);
    }, [newRows, editedTexts, savedItems, onHasPendingChangesChange]);

    // ── Imperative handle ──────────────────────────────────────────────────

    useImperativeHandle(ref, () => ({
      getNewRows() {
        return newRows
          .filter((r) => r.text.trim())
          .map((r) => ({ text: r.text.trim() }));
      },
      getDirtyUpdates() {
        return savedItems
          .filter(
            (item) =>
              editedTexts[item.uuid] !== undefined &&
              editedTexts[item.uuid] !== item.text,
          )
          .map((item) => ({ uuid: item.uuid, text: editedTexts[item.uuid] }));
      },
      clearDirtyUpdates() {
        setEditedTexts({});
      },
      clearNewRows() {
        setNewRows([{ id: Date.now().toString(), text: "" }]);
      },
    }));

    // ── Row management ─────────────────────────────────────────────────────

    const addRow = () => {
      if (newRows.length >= LIMITS.TTS_MAX_ROWS) {
        toast.error(
          <span>
            You can only add up to {LIMITS.TTS_MAX_ROWS} rows at a time.{" "}
            <a href={CONTACT_LINK} target="_blank" rel="noopener noreferrer" className="underline">
              Contact us
            </a>{" "}
            to extend your limits.
          </span>,
        );
        return;
      }
      const invalidIds = new Set<string>();
      newRows.forEach((row) => {
        if (!row.text.trim()) invalidIds.add(row.id);
      });
      if (invalidIds.size > 0) {
        setInvalidRowIds(invalidIds);
        return;
      }
      setInvalidRowIds(new Set());
      setNewRows((prev) => [...prev, { id: Date.now().toString(), text: "" }]);
    };

    const deleteNewRow = (id: string) => {
      setNewRows((prev) => prev.filter((r) => r.id !== id));
      setDeleteNewRowId(null);
    };

    const handleTextChange = (id: string, text: string) => {
      setNewRows((prev) =>
        prev.map((r) => (r.id === id ? { ...r, text } : r)),
      );
      if (text.trim()) {
        setInvalidRowIds((prev) => {
          const s = new Set(prev);
          s.delete(id);
          return s;
        });
      }
    };

    // ── CSV upload ─────────────────────────────────────────────────────────

    const handleDownloadSampleCsv = () => {
      const csvContent =
        'text\n"Hello, how are you today?"\nThe weather is nice outside.\nThis is a sample text for TTS evaluation.';
      const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = "sample_tts_input.csv";
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
    };

    const handleCsvUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
      const file = event.target.files?.[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = (e) => {
        const content = e.target?.result as string;
        if (!content) return;
        const lines = content.split(/\r?\n/).filter((line) => line.trim());
        if (lines.length === 0) return;
        const headers = lines[0].split(",").map((h) => h.trim().toLowerCase());
        const textIdx = headers.indexOf("text");
        if (textIdx === -1) {
          toast.error("CSV must have a 'text' column header");
          return;
        }
        const parsed: NewRow[] = [];
        for (let i = 1; i < lines.length; i++) {
          const cols: string[] = [];
          let current = "";
          let inQuotes = false;
          for (const char of lines[i]) {
            if (char === '"') { inQuotes = !inQuotes; }
            else if (char === "," && !inQuotes) { cols.push(current.trim()); current = ""; }
            else { current += char; }
          }
          cols.push(current.trim());
          const text = cols[textIdx]?.trim();
          if (text) parsed.push({ id: Date.now().toString() + i, text });
        }
        if (parsed.length > LIMITS.TTS_MAX_ROWS) {
          toast.error(
            <span>
              You can only upload up to {LIMITS.TTS_MAX_ROWS} rows.{" "}
              <a href={CONTACT_LINK} target="_blank" rel="noopener noreferrer" className="underline">
                Contact us
              </a>{" "}
              to extend your limits.
            </span>,
          );
          return;
        }
        const longRow = parsed.find(
          (r) => r.text.length > LIMITS.TTS_MAX_TEXT_LENGTH,
        );
        if (longRow) {
          toast.error(
            <span>
              Text must be {LIMITS.TTS_MAX_TEXT_LENGTH} characters or less.{" "}
              <a href={CONTACT_LINK} target="_blank" rel="noopener noreferrer" className="underline">
                Contact us
              </a>{" "}
              to extend your limits.
            </span>,
          );
          return;
        }
        if (parsed.length > 0) {
          setNewRows(parsed);
          setInvalidRowIds(new Set());
        }
      };
      reader.readAsText(file);
      if (fileInputRef.current) fileInputRef.current.value = "";
    };

    // ── Saved item deletion ────────────────────────────────────────────────

    const handleConfirmDeleteSaved = async () => {
      if (!deleteSavedId || !onDeleteSavedItem) return;
      setIsDeletingSaved(true);
      try {
        await onDeleteSavedItem(deleteSavedId);
        setDeleteSavedId(null);
      } catch {
        setDeleteSavedId(null);
      } finally {
        setIsDeletingSaved(false);
      }
    };

    // ── Render ─────────────────────────────────────────────────────────────

    return (
      <div className="space-y-4">
        {/* Dataset name */}
        {showDatasetName && (
          <div>
            <label className="text-[13px] font-medium text-foreground block mb-2">
              Dataset name
            </label>
            <input
              type="text"
              value={datasetName}
              onChange={(e) => onDatasetNameChange?.(e.target.value)}
              placeholder="e.g. English TTS test set"
              className={`w-full max-w-sm h-9 px-3 rounded-md text-sm border bg-background focus:outline-none focus:ring-1 focus:ring-foreground/30 ${
                datasetNameInvalid ? "border-red-500 bg-red-500/10" : "border-border"
              }`}
            />
          </div>
        )}

        <div className="border border-border rounded-xl overflow-hidden">
          {/* ── Saved items ── */}
          {savedItems.map((item, index) => {
            const currentText = editedTexts[item.uuid] ?? item.text;
            return (
              <div
                key={item.uuid}
                className="flex items-center gap-3 px-4 py-3 border-b border-border"
              >
                <div className="flex-shrink-0 w-6 h-6 rounded-full bg-muted flex items-center justify-center text-[11px] font-medium text-muted-foreground">
                  {index + 1}
                </div>
                <input
                  type="text"
                  value={currentText}
                  onChange={(e) =>
                    setEditedTexts((prev) => ({
                      ...prev,
                      [item.uuid]: e.target.value,
                    }))
                  }
                  className="flex-1 h-8 px-2 rounded text-[13px] border border-border bg-background focus:outline-none focus:ring-1 focus:ring-foreground/30"
                />
                {onDeleteSavedItem && (
                  <button
                    title="Delete item"
                    onClick={() => {
                      if (savedItems.length <= 1) {
                        toast.error("Dataset must have at least 2 items.");
                        return;
                      }
                      setDeleteSavedId(item.uuid);
                    }}
                    className="flex-shrink-0 p-1.5 rounded hover:bg-muted/50 text-muted-foreground hover:text-red-500 transition-colors cursor-pointer"
                  >
                    <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 01-2.244 2.077H8.084a2.25 2.25 0 01-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 00-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 013.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 00-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 00-7.5 0" />
                    </svg>
                  </button>
                )}
              </div>
            );
          })}

          {/* ── New rows ── */}
          {newRows.map((row, index) => {
            const isInvalid = invalidRowIds.has(row.id);
            const globalIndex = savedItems.length + index;
            return (
              <div
                key={row.id}
                className={`flex items-center gap-3 px-4 py-3 border-b border-border last:border-b-0 ${
                  isInvalid ? "bg-red-500/5" : ""
                }`}
              >
                <div className="flex-shrink-0 w-6 h-6 rounded-full bg-muted flex items-center justify-center text-[11px] font-medium text-muted-foreground">
                  {globalIndex + 1}
                </div>
                <input
                  type="text"
                  value={row.text}
                  onChange={(e) => handleTextChange(row.id, e.target.value)}
                  placeholder="Enter text to synthesize"
                  className={`flex-1 h-8 px-2 rounded text-[13px] border bg-background focus:outline-none focus:ring-1 focus:ring-foreground/30 ${
                    isInvalid ? "border-red-500 bg-red-500/10" : "border-border"
                  }`}
                />
                {(savedItems.length > 0 || newRows.length > 1) && (
                  <button
                    onClick={() => {
                      if (!row.text.trim()) {
                        deleteNewRow(row.id);
                      } else {
                        setDeleteNewRowId(row.id);
                      }
                    }}
                    className="flex-shrink-0 p-1.5 rounded hover:bg-muted/50 text-muted-foreground hover:text-red-500 transition-colors cursor-pointer"
                  >
                    <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 01-2.244 2.077H8.084a2.25 2.25 0 01-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 00-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 013.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 00-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 00-7.5 0" />
                    </svg>
                  </button>
                )}
              </div>
            );
          })}

          {/* Add row */}
          <button
            onClick={addRow}
            className="w-full h-10 px-4 text-[12px] font-medium border-t border-dashed border-border bg-muted/10 hover:bg-muted/30 transition-colors flex items-center justify-center gap-1.5 text-muted-foreground hover:text-foreground cursor-pointer"
          >
            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
            </svg>
            Add another row
          </button>
        </div>

        {/* CSV Upload */}
        <div className="border border-border rounded-xl p-4 md:p-5 bg-muted/10">
          <div className="flex items-start gap-3">
            <div className="flex-shrink-0 w-9 h-9 rounded-full bg-muted flex items-center justify-center">
              <svg className="w-4 h-4 text-muted-foreground" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m6.75 12l-3-3m0 0l-3 3m3-3v6m-1.5-15H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z" />
              </svg>
            </div>
            <div className="flex-1">
              <h3 className="text-[13px] font-medium text-foreground mb-1">Upload CSV</h3>
              <p className="text-[12px] text-muted-foreground mb-3">
                Upload a CSV with a <code className="font-mono">text</code> column
              </p>
              <div className="flex flex-wrap items-center gap-2">
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".csv"
                  onChange={handleCsvUpload}
                  className="hidden"
                  id="tts-csv-upload"
                />
                <label
                  htmlFor="tts-csv-upload"
                  className="h-8 px-3 rounded-md text-[12px] font-medium bg-foreground text-background hover:opacity-90 transition-opacity cursor-pointer flex items-center gap-1.5"
                >
                  <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5m-13.5-9L12 3m0 0l4.5 4.5M12 3v13.5" />
                  </svg>
                  Choose CSV
                </label>
                <button
                  onClick={handleDownloadSampleCsv}
                  className="h-8 px-3 rounded-md text-[12px] font-medium border border-border text-muted-foreground hover:text-foreground hover:bg-accent transition-colors cursor-pointer flex items-center gap-1.5"
                >
                  Download sample
                </button>
              </div>
            </div>
          </div>
        </div>

        {/* Delete new row confirmation */}
        {deleteNewRowId && (
          <DeleteConfirmationDialog
            isOpen={true}
            onClose={() => setDeleteNewRowId(null)}
            onConfirm={() => deleteNewRow(deleteNewRowId)}
            title="Delete row"
            message="Remove this text row?"
            isDeleting={false}
          />
        )}

        {/* Delete saved item confirmation */}
        {deleteSavedId && (
          <DeleteConfirmationDialog
            isOpen={true}
            onClose={() => setDeleteSavedId(null)}
            onConfirm={handleConfirmDeleteSaved}
            title="Delete item"
            message="Remove this item from the dataset?"
            isDeleting={isDeletingSaved}
          />
        )}
      </div>
    );
  },
);
