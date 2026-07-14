"use client";

import { useEffect, useRef, useState } from "react";
import JSZip from "jszip";
import { apiClient } from "@/lib/api";
import { LIMITS, showLimitToast } from "@/constants/limits";
import { useHideFloatingButton } from "@/components/AppLayout";
import { LazyAudioPlayer } from "@/components/evaluations/LazyAudioPlayer";
import {
  createToneWav,
  findDataCsvInZip,
  findZipAudioFile,
  getAudioDuration,
  parseCsvLine,
  splitCsvLines,
} from "@/components/evaluations/audioZip";
import { reportError } from "@/lib/reportError";
import { parseItemNameConflictFromError } from "./itemNameConflict";
import { uploadTtsAudioToS3 } from "./ttsAudioUpload";
import {
  DiscardChangesDialog,
  useUnsavedCloseGuard,
} from "./unsavedCloseGuard";

/** A readable upload error: friendly name-conflict copy, else the backend's
 * detail string, else a generic fallback — never raw JSON. */
function friendlyUploadError(err: unknown): string {
  const conflict = parseItemNameConflictFromError(err);
  if (conflict) return conflict.message;
  if (err instanceof Error) {
    const m = err.message.match(/Request failed: \d+ - ([\s\S]+)$/);
    if (m) {
      try {
        const parsed = JSON.parse(m[1]);
        if (typeof parsed?.detail === "string") return parsed.detail;
        if (typeof parsed?.detail?.message === "string") {
          return parsed.detail.message;
        }
      } catch {
        /* not JSON — fall through */
      }
    }
  }
  return "Failed to upload items. Please try again.";
}

// ─── Helpers ────────────────────────────────────────────────────────────────

const fileStem = (name: string) => name.replace(/\.[^./]+$/, "");

type ParsedRow = {
  id: string;
  name: string;
  text: string;
  audioFile: File;
  audioUrl: string; // object URL for local preview
  /** s3 path from a successful upload, so a retry doesn't re-upload it. */
  uploadedPath?: string;
};

type BulkUploadTtsItemsDialogProps = {
  isOpen: boolean;
  accessToken: string;
  taskUuid: string;
  onClose: () => void;
  onSuccess: (count: number) => void;
};

export function BulkUploadTtsItemsDialog({
  isOpen,
  accessToken,
  taskUuid,
  onClose,
  onSuccess,
}: BulkUploadTtsItemsDialogProps) {
  useHideFloatingButton(isOpen);

  const zipInputRef = useRef<HTMLInputElement | null>(null);
  const [zipName, setZipName] = useState<string | null>(null);
  const [rows, setRows] = useState<ParsedRow[]>([]);
  const [isProcessingZip, setIsProcessingZip] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadedCount, setUploadedCount] = useState(0);
  const [error, setError] = useState<string | null>(null);

  // Object URLs from the parsed preview must be revoked so a re-parse or a
  // close doesn't leak them.
  const revokePreviewUrls = (list: ParsedRow[]) => {
    list.forEach((r) => URL.revokeObjectURL(r.audioUrl));
  };

  const reset = () => {
    setRows((prev) => {
      revokePreviewUrls(prev);
      return [];
    });
    setZipName(null);
    setError(null);
    setUploadedCount(0);
    if (zipInputRef.current) zipInputRef.current.value = "";
  };

  useEffect(() => {
    if (isOpen) reset();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen]);

  // Revoke any lingering preview URLs on unmount.
  useEffect(
    () => () => {
      setRows((prev) => {
        revokePreviewUrls(prev);
        return prev;
      });
    },
    [],
  );

  const isDirty = rows.length > 0 && !isUploading;
  const { discardConfirmOpen, closeDiscardConfirm, doClose, attemptClose } =
    useUnsavedCloseGuard({
      isOpen,
      isDirty,
      isEdit: false,
      submitting: isUploading || isProcessingZip,
      onClose,
      onBeforeClose: () => setError(null),
    });

  if (!isOpen) return null;

  const handleDownloadSampleZip = async () => {
    const zip = new JSZip();
    const audios = zip.folder("audios");
    const wavOpts = { compression: "STORE" as const };
    audios?.file("sample_1.wav", createToneWav(), wavOpts);
    audios?.file("sample_2.wav", createToneWav(), wavOpts);
    audios?.file("sample_3.wav", createToneWav(), wavOpts);
    zip.file(
      "data.csv",
      "name,text,audio_file\n" +
        "Greeting,Hello how are you today?,sample_1.wav\n" +
        "Flight booking,I would like to book a flight.,sample_2.wav\n" +
        "Repeat request,Can you repeat that please?,sample_3.wav",
    );
    const blob = await zip.generateAsync({ type: "blob" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = "sample_tts_items.zip";
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  const handleZipUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setError(null);
    setUploadedCount(0);
    setIsProcessingZip(true);
    // Clear any previously parsed rows (and their preview URLs).
    setRows((prev) => {
      revokePreviewUrls(prev);
      return [];
    });

    try {
      const zip = await JSZip.loadAsync(file);

      const csv = findDataCsvInZip(zip);
      if (!csv) {
        setError("ZIP must contain a data.csv file.");
        return;
      }
      const basePath = csv.basePath;

      const lines = splitCsvLines(await csv.file.async("string"));
      if (lines.length < 2) {
        setError("data.csv must have a header and at least one data row.");
        return;
      }

      const headers = lines[0].split(",").map((h) => h.trim().toLowerCase());
      const textIdx = headers.indexOf("text");
      const audioIdx = headers.indexOf("audio_file");
      const nameIdx = headers.indexOf("name");
      if (textIdx === -1 || audioIdx === -1) {
        setError('data.csv must have "text" and "audio_file" columns.');
        return;
      }

      const built: ParsedRow[] = [];
      for (let i = 1; i < lines.length; i++) {
        const values = parseCsvLine(lines[i]);
        const text = values[textIdx] ?? "";
        const audioFileName = values[audioIdx] ?? "";
        if (!text && !audioFileName) continue;
        if (!text || !audioFileName) {
          revokePreviewUrls(built);
          setError(`Row ${i}: both "text" and "audio_file" are required.`);
          return;
        }
        const name =
          (nameIdx !== -1 ? values[nameIdx] : "") || fileStem(audioFileName);

        const audioZip = findZipAudioFile(zip, basePath, audioFileName);
        if (!audioZip) {
          revokePreviewUrls(built);
          setError(`Row ${i}: audio file "${audioFileName}" not found in ZIP.`);
          return;
        }

        const blob = await audioZip.async("blob");
        const audioFile = new File([blob], audioFileName, {
          type: "audio/wav",
        });

        const sizeMB = audioFile.size / (1024 * 1024);
        if (sizeMB > LIMITS.STT_MAX_AUDIO_FILE_SIZE_MB) {
          revokePreviewUrls(built);
          showLimitToast(
            `"${audioFileName}" exceeds ${LIMITS.STT_MAX_AUDIO_FILE_SIZE_MB} MB.`,
          );
          setError(
            `"${audioFileName}" exceeds the ${LIMITS.STT_MAX_AUDIO_FILE_SIZE_MB} MB limit.`,
          );
          return;
        }
        try {
          const duration = await getAudioDuration(audioFile);
          if (duration > LIMITS.STT_MAX_AUDIO_DURATION_SECONDS) {
            revokePreviewUrls(built);
            showLimitToast(
              `"${audioFileName}" exceeds ${LIMITS.STT_MAX_AUDIO_DURATION_SECONDS}s.`,
            );
            setError(
              `"${audioFileName}" exceeds the ${LIMITS.STT_MAX_AUDIO_DURATION_SECONDS}s limit.`,
            );
            return;
          }
        } catch {
          // Duration probing is best-effort; don't block on a failed probe.
        }

        built.push({
          id: `${Date.now()}-${i}`,
          name,
          text,
          audioFile,
          audioUrl: URL.createObjectURL(audioFile),
        });
      }

      if (built.length === 0) {
        setError("No rows with content were found in data.csv.");
        return;
      }
      setZipName(file.name);
      setRows(built);
    } catch (err) {
      reportError("Failed to process TTS labelling ZIP", err);
      setError("Failed to process the ZIP file.");
    } finally {
      setIsProcessingZip(false);
      if (zipInputRef.current) zipInputRef.current.value = "";
    }
  };

  const handleUpload = async () => {
    if (rows.length === 0 || isUploading) return;
    setIsUploading(true);
    setError(null);
    setUploadedCount(0);

    try {
      // Upload audio to S3 with bounded concurrency — a sequential loop is
      // far too slow once there are more than a handful of clips. Clips that
      // already uploaded on a prior attempt (`uploadedPath`) are reused so a
      // retry doesn't re-upload the whole batch.
      const s3Paths: (string | null)[] = rows.map(
        (r) => r.uploadedPath ?? null,
      );
      setUploadedCount(s3Paths.filter(Boolean).length);
      let cursor = 0;
      const worker = async () => {
        while (cursor < rows.length) {
          const idx = cursor++;
          if (s3Paths[idx]) continue;
          const path = await uploadTtsAudioToS3(
            rows[idx].audioFile,
            accessToken,
          );
          s3Paths[idx] = path;
          if (path) setUploadedCount((c) => c + 1);
        }
      };
      await Promise.all(
        Array.from(
          { length: Math.min(LIMITS.STT_UPLOAD_CONCURRENCY, rows.length) },
          worker,
        ),
      );

      // Remember successful uploads so a retry skips them.
      setRows((prev) =>
        prev.map((r, i) =>
          s3Paths[i] ? { ...r, uploadedPath: s3Paths[i] as string } : r,
        ),
      );

      const failed = s3Paths.filter((p) => !p).length;
      if (failed > 0) {
        setError(
          `${failed} of ${rows.length} audio file(s) failed to upload. Nothing was saved — please retry.`,
        );
        return;
      }

      await apiClient(`/annotation-tasks/${taskUuid}/items`, accessToken, {
        method: "POST",
        body: {
          items: rows.map((r, i) => ({
            payload: {
              name: r.name,
              text: r.text,
              audio_path: s3Paths[i],
            },
          })),
        },
      });
      onSuccess(rows.length);
    } catch (err) {
      reportError("Failed to create TTS labelling items", err);
      setError(friendlyUploadError(err));
    } finally {
      setIsUploading(false);
    }
  };

  const busy = isProcessingZip || isUploading;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
      <div
        className="bg-background border border-border rounded-xl w-full max-w-3xl shadow-2xl flex flex-col max-h-[90vh]"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-3 px-5 md:px-6 py-4 border-b border-border">
          <div>
            <h2 className="text-base md:text-lg font-semibold text-foreground">
              Bulk upload items
            </h2>
            <p className="text-xs md:text-sm text-muted-foreground mt-1">
              Add many items at once from a ZIP of audio clips and their
              reference texts
            </p>
          </div>
          <button
            onClick={attemptClose}
            disabled={busy}
            className="flex items-center justify-center w-8 h-8 rounded-md hover:bg-muted transition-colors cursor-pointer flex-shrink-0 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <svg
              className="w-5 h-5"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={2}
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M6 18L18 6M6 6l12 12"
              />
            </svg>
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-4 md:p-6 space-y-4">
          <div className="border border-border rounded-xl p-4 md:p-6 bg-muted/10">
            <div className="flex items-start gap-3 md:gap-4">
              <div className="flex-shrink-0 w-9 h-9 md:w-10 md:h-10 rounded-full bg-muted flex items-center justify-center">
                <svg
                  className="w-5 h-5 text-muted-foreground"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                  strokeWidth={1.5}
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M20.25 7.5l-.625 10.632a2.25 2.25 0 01-2.247 2.118H6.622a2.25 2.25 0 01-2.247-2.118L3.75 7.5m8.25 3v6.75m0 0l-3-3m3 3l3-3M3.375 7.5h17.25c.621 0 1.125-.504 1.125-1.125v-1.5c0-.621-.504-1.125-1.125-1.125H3.375c-.621 0-1.125.504-1.125 1.125v1.5c0 .621.504 1.125 1.125 1.125z"
                  />
                </svg>
              </div>
              <div className="flex-1 min-w-0">
                <h3 className="text-[14px] font-medium text-foreground mb-1">
                  Upload ZIP
                </h3>
                <p className="text-[13px] text-muted-foreground mb-4">
                  Upload a ZIP file containing an{" "}
                  <code className="px-1.5 py-0.5 rounded bg-muted text-foreground font-mono text-[12px]">
                    audios
                  </code>{" "}
                  folder with .wav files and a{" "}
                  <code className="px-1.5 py-0.5 rounded bg-muted text-foreground font-mono text-[12px]">
                    data.csv
                  </code>{" "}
                  file with columns{" "}
                  <code className="px-1.5 py-0.5 rounded bg-muted text-foreground font-mono text-[12px]">
                    name
                  </code>{" "}
                  (optional),{" "}
                  <code className="px-1.5 py-0.5 rounded bg-muted text-foreground font-mono text-[12px]">
                    text
                  </code>{" "}
                  and{" "}
                  <code className="px-1.5 py-0.5 rounded bg-muted text-foreground font-mono text-[12px]">
                    audio_file
                  </code>
                  .
                </p>
                <div className="flex flex-col sm:flex-row items-start sm:items-center gap-2 sm:gap-3">
                  <input
                    ref={zipInputRef}
                    type="file"
                    accept=".zip"
                    onChange={handleZipUpload}
                    className="hidden"
                    id="tts-zip-upload"
                    disabled={busy}
                  />
                  <label
                    htmlFor="tts-zip-upload"
                    className={`h-9 px-4 rounded-md text-[13px] font-medium bg-foreground text-background hover:opacity-90 transition-opacity flex items-center gap-2 ${
                      busy ? "opacity-50 cursor-not-allowed" : "cursor-pointer"
                    }`}
                  >
                    {isProcessingZip ? (
                      <>
                        <svg
                          className="w-4 h-4 animate-spin"
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
                        Processing...
                      </>
                    ) : (
                      <>
                        <svg
                          className="w-4 h-4"
                          fill="none"
                          viewBox="0 0 24 24"
                          stroke="currentColor"
                          strokeWidth={1.5}
                        >
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5m-13.5-9L12 3m0 0l4.5 4.5M12 3v13.5"
                          />
                        </svg>
                        {zipName ? "Choose a different ZIP" : "Choose ZIP file"}
                      </>
                    )}
                  </label>
                  <button
                    type="button"
                    onClick={handleDownloadSampleZip}
                    disabled={busy}
                    className="h-9 px-4 rounded-md text-[13px] font-medium border border-border text-muted-foreground hover:text-foreground hover:bg-accent transition-colors cursor-pointer flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    <svg
                      className="w-4 h-4"
                      fill="none"
                      viewBox="0 0 24 24"
                      stroke="currentColor"
                      strokeWidth={1.5}
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5M16.5 12L12 16.5m0 0L7.5 12m4.5 4.5V3"
                      />
                    </svg>
                    Download sample ZIP
                  </button>
                </div>
              </div>
            </div>
          </div>

          {error && (
            <div className="rounded-md border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-500">
              {error}
            </div>
          )}

          {rows.length > 0 && (
            <div className="space-y-2">
              <p className="text-sm font-medium text-foreground">
                {rows.length} {rows.length === 1 ? "item" : "items"} ready to
                upload
              </p>
              <div className="border border-border rounded-xl overflow-hidden">
                <div className="grid grid-cols-[minmax(0,1.2fr)_minmax(0,1.6fr)_minmax(220px,2fr)] gap-4 px-4 py-2.5 border-b border-border bg-muted/30">
                  <div className="text-xs font-medium text-muted-foreground">
                    Name
                  </div>
                  <div className="text-xs font-medium text-muted-foreground">
                    Reference text
                  </div>
                  <div className="text-xs font-medium text-muted-foreground">
                    Audio
                  </div>
                </div>
                <div className="divide-y divide-border max-h-[40vh] overflow-y-auto">
                  {rows.slice(0, 50).map((r) => (
                    <div
                      key={r.id}
                      className="grid grid-cols-[minmax(0,1.2fr)_minmax(0,1.6fr)_minmax(220px,2fr)] gap-4 px-4 py-2.5 items-center"
                    >
                    <div
                      className="text-xs text-foreground truncate"
                      title={r.name}
                    >
                      {r.name}
                    </div>
                    <div
                      className="text-xs text-foreground truncate"
                      title={r.text}
                    >
                      {r.text}
                    </div>
                    <div className="min-w-0">
                      <LazyAudioPlayer src={r.audioUrl} className="w-full" />
                    </div>
                  </div>
                ))}
                {rows.length > 50 && (
                  <div className="px-4 py-2.5 text-xs text-muted-foreground">
                    + {rows.length - 50} more items
                  </div>
                )}
                </div>
              </div>
            </div>
          )}

          {isUploading && (
            <p className="text-sm text-muted-foreground">
              Uploading audio… {uploadedCount}/{rows.length}
            </p>
          )}
        </div>

        <div className="flex items-center justify-end gap-2 md:gap-3 px-5 md:px-6 py-4 border-t border-border">
          <button
            onClick={attemptClose}
            disabled={busy}
            className="h-9 md:h-10 px-4 rounded-md text-sm md:text-base font-medium border border-border bg-background dark:bg-muted hover:bg-muted/50 dark:hover:bg-accent transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
          >
            Cancel
          </button>
          <button
            onClick={handleUpload}
            disabled={rows.length === 0 || busy}
            className="h-9 md:h-10 px-4 rounded-md text-sm md:text-base font-medium bg-foreground text-background hover:opacity-90 transition-opacity cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isUploading
              ? "Uploading…"
              : rows.length > 1
                ? `Upload ${rows.length} items`
                : "Upload item"}
          </button>
        </div>
      </div>

      <DiscardChangesDialog
        open={discardConfirmOpen}
        onKeepEditing={closeDiscardConfirm}
        onDiscard={doClose}
      />
    </div>
  );
}
