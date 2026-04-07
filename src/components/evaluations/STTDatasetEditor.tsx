"use client";

import {
  useState,
  useRef,
  useEffect,
  forwardRef,
  useImperativeHandle,
} from "react";
import { signOut } from "next-auth/react";
import { toast } from "sonner";
import JSZip from "jszip";
import { LIMITS, CONTACT_LINK } from "@/constants/limits";
import { DeleteConfirmationDialog } from "../DeleteConfirmationDialog";
import type { DatasetItem } from "@/lib/datasets";

// ─── Types ────────────────────────────────────────────────────────────────────

type NewRow = {
  id: string;
  audioFile: File | null;
  audioUrl: string | null;
  text: string;
  s3Path: string | null;
};

export type STTDatasetEditorHandle = {
  /** Validate new rows; returns true if all are valid */
  validate: () => boolean;
  /** Returns new rows that are fully uploaded and ready to save */
  getNewRows: () => { audio_path: string; text: string }[];
  /** True if there is at least one non-empty new row */
  hasNewRows: () => boolean;
  /** Returns saved items whose transcript has been locally edited */
  getDirtyUpdates: () => { uuid: string; text: string }[];
  /** Clears local edits (call after a successful save) */
  clearDirtyUpdates: () => void;
  /** Resets new rows to a single blank row (call after a successful save) */
  clearNewRows: () => void;
};

type Props = {
  accessToken: string | null;
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

// ─── Helpers ──────────────────────────────────────────────────────────────────

const getAudioDuration = (file: File): Promise<number> =>
  new Promise((resolve, reject) => {
    const audio = new Audio();
    const url = URL.createObjectURL(file);
    audio.src = url;
    audio.onloadedmetadata = () => {
      URL.revokeObjectURL(url);
      resolve(audio.duration);
    };
    audio.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("Failed to load audio"));
    };
  });

const getFileName = (file: File) =>
  file.name.length > 20 ? `${file.name.substring(0, 20)}...` : file.name;

// ─── Component ────────────────────────────────────────────────────────────────

export const STTDatasetEditor = forwardRef<STTDatasetEditorHandle, Props>(
  function STTDatasetEditor(
    {
      accessToken,
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
    const [newRows, setNewRows] = useState<NewRow[]>([
      { id: "1", audioFile: null, audioUrl: null, text: "", s3Path: null },
    ]);
    const [uploadStatus, setUploadStatus] = useState<
      Record<string, "uploading" | "success" | "error">
    >({});
    const [invalidRowIds, setInvalidRowIds] = useState<Set<string>>(new Set());
    const [deleteNewRowId, setDeleteNewRowId] = useState<string | null>(null);
    const [deleteSavedId, setDeleteSavedId] = useState<string | null>(null);
    const [isDeletingSaved, setIsDeletingSaved] = useState(false);
    const [isProcessingZip, setIsProcessingZip] = useState(false);
    // Tracks in-progress edits to saved item transcripts keyed by uuid
    const [editedTexts, setEditedTexts] = useState<Record<string, string>>({});

    const fileInputRefs = useRef<Record<string, HTMLInputElement | null>>({});
    const zipInputRef = useRef<HTMLInputElement>(null);

    // Notify parent when there are pending changes (new rows or dirty transcripts)
    useEffect(() => {
      const hasNewRows = newRows.some((r) => r.s3Path && r.text.trim());
      const hasDirty = savedItems.some(
        (item) => editedTexts[item.uuid] !== undefined && editedTexts[item.uuid] !== item.text,
      );
      onHasPendingChangesChange?.(hasNewRows || hasDirty);
    }, [newRows, editedTexts, savedItems, onHasPendingChangesChange]);

    // ── Imperative handle ──────────────────────────────────────────────────

    useImperativeHandle(ref, () => ({
      validate() {
        const invalid = new Set<string>();
        newRows.forEach((row) => {
          if (!row.audioFile || !row.text.trim() || !row.s3Path) {
            invalid.add(row.id);
          }
        });
        setInvalidRowIds(invalid);
        return invalid.size === 0;
      },
      getNewRows() {
        return newRows
          .filter((r) => r.s3Path && r.text.trim())
          .map((r) => ({ audio_path: r.s3Path!, text: r.text.trim() }));
      },
      hasNewRows() {
        return newRows.some((r) => r.audioFile || r.text.trim());
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
        setNewRows([{ id: Date.now().toString(), audioFile: null, audioUrl: null, text: "", s3Path: null }]);
      },
    }));

    // ── S3 upload ──────────────────────────────────────────────────────────

    const uploadFileToS3 = async (file: File): Promise<string | null> => {
      try {
        const backendUrl = process.env.NEXT_PUBLIC_BACKEND_URL;
        if (!backendUrl) return null;

        const response = await fetch(`${backendUrl}/presigned-url`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${accessToken}`,
          },
          body: JSON.stringify({
            task_type: "stt",
            content_type: file.type || "audio/wav",
            extension: "wav",
          }),
        });

        if (response.status === 401) {
          await signOut({ callbackUrl: "/login" });
          return null;
        }
        if (!response.ok) throw new Error("Failed to get presigned URL");

        const data = await response.json();
        const { presigned_url: presignedUrl, s3_path: s3Path } = data;
        if (!presignedUrl || !s3Path) throw new Error("Missing URL/path");

        const uploadResponse = await fetch(presignedUrl, {
          method: "PUT",
          headers: { "Content-Type": file.type || "audio/wav" },
          body: file,
        });
        if (!uploadResponse.ok) throw new Error("S3 upload failed");

        return s3Path;
      } catch {
        return null;
      }
    };

    // ── Row management ────────────────────────────────────────────────────

    const addRow = () => {
      if (newRows.length >= LIMITS.STT_MAX_ROWS) {
        toast.error(
          <span>
            You can only add up to {LIMITS.STT_MAX_ROWS} rows at a time.{" "}
            <a href={CONTACT_LINK} target="_blank" rel="noopener noreferrer" className="underline">
              Contact us
            </a>{" "}
            to extend your limits.
          </span>,
        );
        return;
      }
      const invalid = new Set<string>();
      newRows.forEach((row) => {
        if (!row.audioFile || !row.text.trim() || !row.s3Path) invalid.add(row.id);
      });
      if (invalid.size > 0) {
        setInvalidRowIds(invalid);
        return;
      }
      setInvalidRowIds(new Set());
      setNewRows((prev) => [
        ...prev,
        { id: Date.now().toString(), audioFile: null, audioUrl: null, text: "", s3Path: null },
      ]);
    };

    const deleteNewRow = (id: string) => {
      if (newRows.length === 1) return;
      const row = newRows.find((r) => r.id === id);
      if (row?.audioUrl) URL.revokeObjectURL(row.audioUrl);
      setNewRows((prev) => prev.filter((r) => r.id !== id));
      setDeleteNewRowId(null);
    };

    const handleFileChange = async (id: string, file: File | null) => {
      if (!file) {
        const row = newRows.find((r) => r.id === id);
        if (row?.audioUrl) URL.revokeObjectURL(row.audioUrl);
        setNewRows((prev) =>
          prev.map((r) => (r.id === id ? { ...r, audioFile: null, audioUrl: null, s3Path: null } : r)),
        );
        setUploadStatus((prev) => { const n = { ...prev }; delete n[id]; return n; });
        return;
      }

      // Validate size
      const sizeMB = file.size / (1024 * 1024);
      if (sizeMB > LIMITS.STT_MAX_AUDIO_FILE_SIZE_MB) {
        toast.error(
          <span>
            Audio file must be less than {LIMITS.STT_MAX_AUDIO_FILE_SIZE_MB} MB. This file is {sizeMB.toFixed(2)} MB.{" "}
            <a href={CONTACT_LINK} target="_blank" rel="noopener noreferrer" className="underline">Contact us</a> to extend your limits.
          </span>,
        );
        return;
      }

      // Validate duration
      try {
        const duration = await getAudioDuration(file);
        if (duration > LIMITS.STT_MAX_AUDIO_DURATION_SECONDS) {
          toast.error(
            <span>
              Audio file must be less than {LIMITS.STT_MAX_AUDIO_DURATION_SECONDS} seconds. This file is {Math.round(duration)} seconds.{" "}
              <a href={CONTACT_LINK} target="_blank" rel="noopener noreferrer" className="underline">Contact us</a> to extend your limits.
            </span>,
          );
          return;
        }
      } catch {
        toast.error("Failed to read audio file. Please try a different file.");
        return;
      }

      setUploadStatus((prev) => ({ ...prev, [id]: "uploading" }));
      const s3Path = await uploadFileToS3(file);

      if (s3Path) {
        const audioUrl = URL.createObjectURL(file);
        setNewRows((prev) =>
          prev.map((r) => (r.id === id ? { ...r, audioFile: file, audioUrl, s3Path } : r)),
        );
        setUploadStatus((prev) => ({ ...prev, [id]: "success" }));
        setInvalidRowIds((prev) => { const n = new Set(prev); n.delete(id); return n; });
      } else {
        setUploadStatus((prev) => ({ ...prev, [id]: "error" }));
      }
    };

    const handleTextChange = (id: string, text: string) => {
      setNewRows((prev) => prev.map((r) => (r.id === id ? { ...r, text } : r)));
      if (text.trim()) {
        setInvalidRowIds((prev) => { const n = new Set(prev); n.delete(id); return n; });
      }
    };

    // ── ZIP upload ─────────────────────────────────────────────────────────

    const handleDownloadSampleZip = async () => {
      const zip = new JSZip();
      const audiosFolder = zip.folder("audios");
      const createSilentWav = () => {
        const buffer = new ArrayBuffer(44);
        const view = new DataView(buffer);
        view.setUint32(0, 0x52494646, false);
        view.setUint32(4, 36, true);
        view.setUint32(8, 0x57415645, false);
        view.setUint32(12, 0x666d7420, false);
        view.setUint32(16, 16, true);
        view.setUint16(20, 1, true);
        view.setUint16(22, 1, true);
        view.setUint32(24, 16000, true);
        view.setUint32(28, 32000, true);
        view.setUint16(32, 2, true);
        view.setUint16(34, 16, true);
        view.setUint32(36, 0x64617461, false);
        view.setUint32(40, 0, true);
        return new Uint8Array(buffer);
      };
      audiosFolder?.file("sample_1.wav", createSilentWav());
      audiosFolder?.file("sample_2.wav", createSilentWav());
      audiosFolder?.file("sample_3.wav", createSilentWav());
      zip.file(
        "data.csv",
        "audio_file,text\nsample_1.wav,Reference transcription for sample 1.\nsample_2.wav,Reference transcription for sample 2.\nsample_3.wav,Reference transcription for sample 3.",
      );
      const blob = await zip.generateAsync({ type: "blob" });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = "sample_stt_input.zip";
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
    };

    const handleZipUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (!file) return;
      setIsProcessingZip(true);

      try {
        const zip = await JSZip.loadAsync(file);

        let csvFile = zip.file("data.csv");
        let basePath = "";
        if (!csvFile) {
          const topLevel = Object.keys(zip.files).filter(
            (p) => !p.includes("__MACOSX") && !p.startsWith("._"),
          );
          const folders = topLevel.filter((p) => p.endsWith("/") && p.split("/").length === 2);
          for (const folder of folders) {
            const candidate = zip.file(`${folder}data.csv`);
            if (candidate) { csvFile = candidate; basePath = folder; break; }
          }
        }
        if (!csvFile) { toast.error("ZIP must contain a data.csv file"); return; }

        let csvContent = await csvFile.async("string");
        if (csvContent.charCodeAt(0) === 0xfeff) csvContent = csvContent.slice(1);
        const lines = csvContent.split(/\r\n|\n|\r/).filter((l) => l.trim());

        if (lines.length < 2) {
          toast.error(`data.csv must have a header and at least one data row. Found ${lines.length} line(s).`);
          return;
        }

        const headers = lines[0].split(",").map((h) => h.trim().toLowerCase());
        const audioIdx = headers.indexOf("audio_file");
        const textIdx = headers.indexOf("text");
        if (audioIdx === -1 || textIdx === -1) {
          toast.error("data.csv must have 'audio_file' and 'text' columns");
          return;
        }

        const dataRows: { audioFileName: string; text: string }[] = [];
        for (let i = 1; i < lines.length; i++) {
          const values: string[] = [];
          let current = "";
          let inQuotes = false;
          for (const char of lines[i]) {
            if (char === '"') { inQuotes = !inQuotes; }
            else if (char === "," && !inQuotes) { values.push(current.trim()); current = ""; }
            else { current += char; }
          }
          values.push(current.trim());
          if (values[audioIdx] && values[textIdx]) {
            dataRows.push({ audioFileName: values[audioIdx], text: values[textIdx] });
          }
        }

        if (dataRows.length === 0) { toast.error("No valid data rows found in data.csv"); return; }
        if (dataRows.length > LIMITS.STT_MAX_ROWS) {
          toast.error(
            <span>
              You can only upload up to {LIMITS.STT_MAX_ROWS} rows at a time.{" "}
              <a href={CONTACT_LINK} target="_blank" rel="noopener noreferrer" className="underline">Contact us</a> to extend your limits.
            </span>,
          );
          return;
        }

        // Revoke existing new-row URLs
        newRows.forEach((r) => { if (r.audioUrl) URL.revokeObjectURL(r.audioUrl); });

        const builtRows: NewRow[] = [];
        const builtStatus: Record<string, "uploading" | "success" | "error"> = {};

        for (let i = 0; i < dataRows.length; i++) {
          const { audioFileName, text } = dataRows[i];
          const rowId = Date.now().toString() + i;
          const audioFileZip =
            zip.file(`${basePath}audios/${audioFileName}`) ||
            zip.file(`${basePath}${audioFileName}`);

          if (!audioFileZip) {
            builtRows.push({ id: rowId, audioFile: null, audioUrl: null, text, s3Path: null });
            continue;
          }

          const audioBlob = await audioFileZip.async("blob");
          const audioFile = new File([audioBlob], audioFileName, { type: "audio/wav" });

          const sizeMB = audioFile.size / (1024 * 1024);
          if (sizeMB > LIMITS.STT_MAX_AUDIO_FILE_SIZE_MB) {
            toast.error(`"${audioFileName}" exceeds ${LIMITS.STT_MAX_AUDIO_FILE_SIZE_MB} MB.`);
            builtRows.forEach((r) => { if (r.audioUrl) URL.revokeObjectURL(r.audioUrl); });
            return;
          }

          try {
            const duration = await getAudioDuration(audioFile);
            if (duration > LIMITS.STT_MAX_AUDIO_DURATION_SECONDS) {
              toast.error(`"${audioFileName}" exceeds ${LIMITS.STT_MAX_AUDIO_DURATION_SECONDS}s.`);
              builtRows.forEach((r) => { if (r.audioUrl) URL.revokeObjectURL(r.audioUrl); });
              return;
            }
          } catch {
            // continue
          }

          const audioUrl = URL.createObjectURL(audioFile);
          builtRows.push({ id: rowId, audioFile, audioUrl, text, s3Path: null });
          builtStatus[rowId] = "uploading";
        }

        setNewRows(builtRows);
        setUploadStatus(builtStatus);
        setInvalidRowIds(new Set());

        for (const row of builtRows) {
          if (row.audioFile) {
            const s3Path = await uploadFileToS3(row.audioFile);
            if (s3Path) {
              setNewRows((prev) => prev.map((r) => (r.id === row.id ? { ...r, s3Path } : r)));
              setUploadStatus((prev) => ({ ...prev, [row.id]: "success" }));
            } else {
              setUploadStatus((prev) => ({ ...prev, [row.id]: "error" }));
            }
          }
        }
      } catch {
        toast.error("Failed to process ZIP file");
      } finally {
        setIsProcessingZip(false);
        if (zipInputRef.current) zipInputRef.current.value = "";
      }
    };

    // ── Render ─────────────────────────────────────────────────────────────

    const savedCount = savedItems.length;
    const startIndex = savedCount + 1;

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
              placeholder="e.g. English customer calls"
              className={`w-full max-w-sm h-9 px-3 rounded-md text-sm border bg-background focus:outline-none focus:ring-1 focus:ring-foreground/30 ${
                datasetNameInvalid ? "border-red-500 bg-red-500/10" : "border-border"
              }`}
            />
          </div>
        )}

        <div className="space-y-2">
          {/* ── Saved items ── */}
          {savedItems.map((item, index) => {
            const currentText = editedTexts[item.uuid] ?? item.text;

            const isPlayableUrl = item.audio_path?.startsWith("http");
            const audioEl = isPlayableUrl ? (
              <audio src={item.audio_path!} controls className="h-8 w-96" style={{ minWidth: "250px" }} />
            ) : (
              <div className="h-8 px-3 rounded text-[12px] font-medium border border-border bg-background flex items-center gap-1.5 text-muted-foreground min-w-[140px]">
                <svg className="w-3.5 h-3.5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M19.114 5.636a9 9 0 010 12.728M16.463 8.288a5.25 5.25 0 010 7.424M6.75 8.25l4.72-4.72a.75.75 0 011.28.53v15.88a.75.75 0 01-1.28.53l-4.72-4.72H4.51c-.88 0-1.704-.507-1.938-1.354A9.01 9.01 0 012.25 12c0-.83.112-1.633.322-2.396C2.806 8.756 3.63 8.25 4.51 8.25H6.75z" />
                </svg>
                <span className="truncate max-w-[120px]" title={item.audio_path ?? ""}>
                  {item.audio_path ? item.audio_path.split("/").pop() : "No audio"}
                </span>
              </div>
            );

            const textField = (
              <div className="flex-1">
                <input
                  type="text"
                  value={currentText}
                  onChange={(e) =>
                    setEditedTexts((prev) => ({ ...prev, [item.uuid]: e.target.value }))
                  }
                  className="w-full h-8 px-2 rounded text-[13px] border border-border bg-background focus:outline-none focus:ring-1 focus:ring-foreground/30"
                />
              </div>
            );

            const deleteBtn = onDeleteSavedItem && (
              <button
                onClick={() => {
                  if (savedItems.length <= 1) {
                    toast.error("Dataset must have at least 2 items.");
                    return;
                  }
                  setDeleteSavedId(item.uuid);
                }}
                className="flex-shrink-0 w-7 h-7 rounded text-muted-foreground hover:text-foreground hover:bg-accent transition-colors flex items-center justify-center cursor-pointer"
              >
                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 01-2.244 2.077H8.084a2.25 2.25 0 01-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 00-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 013.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 00-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 00-7.5 0" />
                </svg>
              </button>
            );

            return (
              <div
                key={item.uuid}
                className="border border-border rounded-lg py-2 md:py-1.5 px-3 bg-muted/10"
              >
                {/* Desktop */}
                <div className="hidden md:flex items-center gap-2">
                  <div className="flex-shrink-0 w-6 h-6 rounded-full bg-muted flex items-center justify-center text-[11px] font-medium text-muted-foreground">
                    {index + 1}
                  </div>
                  <div className="flex-shrink-0">{audioEl}</div>
                  {textField}
                  {deleteBtn}
                </div>
                {/* Mobile */}
                <div className="md:hidden space-y-2">
                  <div className="flex items-center justify-between">
                    <div className="flex-shrink-0 w-6 h-6 rounded-full bg-muted flex items-center justify-center text-[11px] font-medium text-muted-foreground">
                      {index + 1}
                    </div>
                    {deleteBtn}
                  </div>
                  {isPlayableUrl ? (
                    <audio src={item.audio_path!} controls className="w-full h-8" />
                  ) : (
                    <div className="h-8 px-3 rounded text-[12px] font-medium border border-border bg-background flex items-center gap-1.5 text-muted-foreground w-full">
                      <svg className="w-3.5 h-3.5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M19.114 5.636a9 9 0 010 12.728M16.463 8.288a5.25 5.25 0 010 7.424M6.75 8.25l4.72-4.72a.75.75 0 011.28.53v15.88a.75.75 0 01-1.28.53l-4.72-4.72H4.51c-.88 0-1.704-.507-1.938-1.354A9.01 9.01 0 012.25 12c0-.83.112-1.633.322-2.396C2.806 8.756 3.63 8.25 4.51 8.25H6.75z" />
                      </svg>
                      <span className="truncate">{item.audio_path ? item.audio_path.split("/").pop() : "No audio"}</span>
                    </div>
                  )}
                  {textField}
                </div>
              </div>
            );
          })}

          {/* ── New rows ── */}
          {newRows.map((row, index) => {
            const isInvalid = invalidRowIds.has(row.id);
            const isUploading = uploadStatus[row.id] === "uploading";
            const isUploaded = uploadStatus[row.id] === "success";
            const rowNumber = savedCount + index + 1;

            const handleDelete = () => {
              if (!row.audioFile && !row.text.trim()) deleteNewRow(row.id);
              else setDeleteNewRowId(row.id);
            };

            const triggerFileInput = () => fileInputRefs.current[row.id]?.click();

            const rowBadge = (
              <div className="flex-shrink-0 w-6 h-6 rounded-full bg-muted flex items-center justify-center text-[11px] font-medium text-muted-foreground">
                {rowNumber}
              </div>
            );

            const deleteButton = (newRows.length > 1 || savedCount > 0) && (
              <button
                onClick={handleDelete}
                className="flex-shrink-0 w-7 h-7 rounded text-muted-foreground hover:text-foreground hover:bg-accent transition-colors flex items-center justify-center cursor-pointer"
              >
                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 01-2.244 2.077H8.084a2.25 2.25 0 01-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 00-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 013.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 00-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 00-7.5 0" />
                </svg>
              </button>
            );

            const uploadButtonContent = isUploading ? (
              <>
                <svg className="w-3.5 h-3.5 animate-spin" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                </svg>
                <span>Uploading...</span>
              </>
            ) : (
              <>
                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5m-13.5-9L12 3m0 0l4.5 4.5M12 3v13.5" />
                </svg>
                <span>{row.audioFile ? getFileName(row.audioFile) : "Upload .wav"}</span>
              </>
            );

            const replaceButton = (
              <button
                onClick={triggerFileInput}
                className="h-7 px-2 rounded text-[11px] font-medium border border-border bg-background hover:bg-accent transition-colors cursor-pointer text-muted-foreground hover:text-foreground"
              >
                Replace
              </button>
            );

            const textInput = (
              <input
                type="text"
                value={row.text}
                onChange={(e) => handleTextChange(row.id, e.target.value)}
                placeholder="Enter reference transcription"
                className="w-full h-8 px-2 rounded text-[13px] border border-border bg-background focus:outline-none focus:ring-2 focus:ring-accent focus:border-transparent"
              />
            );

            return (
              <div
                key={row.id}
                className={`border rounded-lg py-2 md:py-1.5 px-3 transition-colors ${
                  isInvalid ? "border-red-500 bg-red-500/10" : "border-border bg-muted/10"
                }`}
              >
                <input
                  type="file"
                  ref={(el) => { fileInputRefs.current[row.id] = el; }}
                  accept=".wav,audio/wav,audio/x-wav"
                  onChange={(e) => {
                    const f = e.target.files?.[0] || null;
                    if (f && !f.name.toLowerCase().endsWith(".wav")) {
                      alert("Please select a .wav file only");
                      e.target.value = "";
                      return;
                    }
                    handleFileChange(row.id, f);
                  }}
                  className="hidden"
                />
                {/* Desktop */}
                <div className="hidden md:flex items-center gap-2">
                  {rowBadge}
                  <div className="flex-shrink-0 flex items-center gap-2">
                    {isUploaded && row.audioUrl ? (
                      <div className="flex items-center gap-2">
                        <audio src={row.audioUrl} controls className="h-8 w-96" style={{ minWidth: "250px" }} />
                        {replaceButton}
                      </div>
                    ) : (
                      <button
                        onClick={triggerFileInput}
                        disabled={isUploading}
                        className="h-8 px-3 rounded text-[12px] font-medium border border-border bg-background hover:bg-accent transition-colors flex items-center gap-1.5 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        {uploadButtonContent}
                      </button>
                    )}
                  </div>
                  <div className="flex-1">{textInput}</div>
                  {deleteButton}
                </div>
                {/* Mobile */}
                <div className="md:hidden space-y-2">
                  <div className="flex items-center justify-between">
                    {rowBadge}
                    {deleteButton}
                  </div>
                  <div>
                    {isUploaded && row.audioUrl ? (
                      <div className="space-y-1.5">
                        <audio src={row.audioUrl} controls className="w-full h-8" />
                        {replaceButton}
                      </div>
                    ) : (
                      <button
                        onClick={triggerFileInput}
                        disabled={isUploading}
                        className="h-8 px-3 rounded text-[12px] font-medium border border-border bg-background hover:bg-accent transition-colors flex items-center gap-1.5 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed w-full justify-center"
                      >
                        {uploadButtonContent}
                      </button>
                    )}
                  </div>
                  {textInput}
                </div>
              </div>
            );
          })}

          {/* Add row */}
          <button
            onClick={addRow}
            className="w-full h-8 px-3 rounded-lg text-[12px] font-medium border border-dashed border-border bg-muted/20 hover:bg-muted/40 transition-colors flex items-center justify-center gap-1.5 text-muted-foreground hover:text-foreground cursor-pointer"
          >
            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
            </svg>
            Add another sample
          </button>

          {/* OR divider */}
          <div className="flex items-center gap-4 py-2">
            <div className="flex-1 h-px bg-border" />
            <span className="text-[13px] font-medium text-muted-foreground">OR</span>
            <div className="flex-1 h-px bg-border" />
          </div>

          {/* ZIP upload */}
          <div className="border border-border rounded-xl p-4 md:p-6 bg-muted/10 w-full md:w-2/3 md:mx-auto">
            <div className="flex items-start gap-3 md:gap-4">
              <div className="flex-shrink-0 w-9 h-9 md:w-10 md:h-10 rounded-full bg-muted flex items-center justify-center">
                <svg className="w-5 h-5 text-muted-foreground" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M20.25 7.5l-.625 10.632a2.25 2.25 0 01-2.247 2.118H6.622a2.25 2.25 0 01-2.247-2.118L3.75 7.5m8.25 3v6.75m0 0l-3-3m3 3l3-3M3.375 7.5h17.25c.621 0 1.125-.504 1.125-1.125v-1.5c0-.621-.504-1.125-1.125-1.125H3.375c-.621 0-1.125.504-1.125 1.125v1.5c0 .621.504 1.125 1.125 1.125z" />
                </svg>
              </div>
              <div className="flex-1">
                <h3 className="text-[14px] font-medium text-foreground mb-1">Upload ZIP</h3>
                <p className="text-[13px] text-muted-foreground mb-4">
                  Upload a ZIP file containing an{" "}
                  <code className="px-1.5 py-0.5 rounded bg-muted text-foreground font-mono text-[12px]">audios</code>{" "}
                  folder with .wav files and a{" "}
                  <code className="px-1.5 py-0.5 rounded bg-muted text-foreground font-mono text-[12px]">data.csv</code>{" "}
                  file mapping audio files to their reference transcriptions.
                </p>
                <div className="flex flex-col sm:flex-row items-start sm:items-center gap-2 sm:gap-3">
                  <input
                    ref={zipInputRef}
                    type="file"
                    accept=".zip"
                    onChange={handleZipUpload}
                    className="hidden"
                    id="zip-upload-editor"
                  />
                  <label
                    htmlFor="zip-upload-editor"
                    className={`h-9 px-4 rounded-md text-[13px] font-medium bg-foreground text-background hover:opacity-90 transition-opacity cursor-pointer flex items-center gap-2 ${isProcessingZip ? "opacity-50 cursor-not-allowed" : ""}`}
                  >
                    {isProcessingZip ? (
                      <>
                        <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                        </svg>
                        Processing...
                      </>
                    ) : (
                      <>
                        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5m-13.5-9L12 3m0 0l4.5 4.5M12 3v13.5" />
                        </svg>
                        Choose ZIP file
                      </>
                    )}
                  </label>
                  <button
                    onClick={handleDownloadSampleZip}
                    disabled={isProcessingZip}
                    className="h-9 px-4 rounded-md text-[13px] font-medium border border-border text-muted-foreground hover:text-foreground hover:bg-accent transition-colors cursor-pointer flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5M16.5 12L12 16.5m0 0L7.5 12m4.5 4.5V3" />
                    </svg>
                    Download sample ZIP
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Delete new row dialog */}
        <DeleteConfirmationDialog
          isOpen={deleteNewRowId !== null}
          onClose={() => setDeleteNewRowId(null)}
          onConfirm={() => { if (deleteNewRowId) deleteNewRow(deleteNewRowId); }}
          title="Delete row"
          message="Are you sure you want to delete this row?"
          confirmText="Delete"
        />

        {/* Delete saved item dialog */}
        <DeleteConfirmationDialog
          isOpen={deleteSavedId !== null}
          onClose={() => setDeleteSavedId(null)}
          onConfirm={async () => {
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
          }}
          title="Delete item"
          message="Remove this item from the dataset?"
          isDeleting={isDeletingSaved}
        />
      </div>
    );
  },
);
