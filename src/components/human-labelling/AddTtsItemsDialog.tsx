"use client";

import { useEffect, useRef, useState } from "react";
import { useHideFloatingButton } from "@/components/AppLayout";
import { FieldError } from "@/components/ui/FieldError";
import { LazyAudioPlayer } from "@/components/evaluations/LazyAudioPlayer";
import { humaniseDetailObject } from "./bulk-upload-shared";
import {
  parseItemNameConflictFromError,
  rowNameErrorsFromConflict,
} from "./itemNameConflict";
import { scheduleScrollToFirstFieldError } from "./scrollToFieldError";
import { uploadTtsAudioToS3, validateTtsAudioFile } from "./ttsAudioUpload";
import {
  DiscardChangesDialog,
  useUnsavedCloseGuard,
} from "./unsavedCloseGuard";

type TtsRowDraft = {
  id: string;
  uuid?: string; // present in edit mode; undefined for new rows
  name: string;
  text: string;
  /** A newly-picked local file to upload on submit. */
  audioFile: File | null;
  /** Object URL for previewing the picked file. */
  previewUrl: string | null;
  /** Already-stored audio (edit/duplicate) kept when no new file is picked. */
  existingAudio: string | null;
  /** s3 path from a successful upload, so a retry doesn't re-upload the file. */
  uploadedPath: string | null;
};

export type TtsItemRowSubmission = {
  uuid?: string;
  name: string;
  text: string;
  audio_path: string;
};

type AddTtsItemsDialogProps = {
  isOpen: boolean;
  mode?: "add" | "edit";
  accessToken: string | null;
  initialRows?: {
    uuid: string;
    name: string;
    text: string;
    /** Existing stored audio (s3 path / signed URL). */
    audio: string;
  }[];
  onClose: () => void;
  onSubmit: (rows: TtsItemRowSubmission[]) => Promise<void> | void;
};

function extractApiError(err: unknown, fallback: string): string {
  if (!(err instanceof Error)) return fallback;
  const m = err.message.match(/Request failed: \d+ - ([\s\S]+)$/);
  if (m) {
    try {
      const parsed = JSON.parse(m[1]);
      if (parsed?.detail && typeof parsed.detail === "object") {
        const msg = humaniseDetailObject(parsed.detail);
        if (msg) return msg;
      }
    } catch {
      /* ignore */
    }
    return m[1];
  }
  return err.message || fallback;
}

const newId = () =>
  typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(36).slice(2)}`;

const newRow = (): TtsRowDraft => ({
  id: newId(),
  name: "",
  text: "",
  audioFile: null,
  previewUrl: null,
  existingAudio: null,
  uploadedPath: null,
});

const rowsFromInitial = (
  initialRows: AddTtsItemsDialogProps["initialRows"],
): TtsRowDraft[] =>
  initialRows && initialRows.length > 0
    ? initialRows.map((r) => ({
        id: r.uuid,
        uuid: r.uuid,
        name: r.name,
        text: r.text,
        audioFile: null,
        previewUrl: null,
        existingAudio: r.audio || null,
        uploadedPath: null,
      }))
    : [newRow()];

export function AddTtsItemsDialog({
  isOpen,
  mode = "add",
  accessToken,
  initialRows,
  onClose,
  onSubmit,
}: AddTtsItemsDialogProps) {
  useHideFloatingButton(isOpen);

  const isEdit = mode === "edit";

  const [rows, setRows] = useState<TtsRowDraft[]>(() =>
    rowsFromInitial(initialRows),
  );
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // API name conflicts (ITEM_NAME_*), keyed by row id — shown under Name.
  const [nameErrors, setNameErrors] = useState<Record<string, string>>({});
  // Per-row audio validation errors (too big / too long / unreadable).
  const [audioErrors, setAudioErrors] = useState<Record<string, string>>({});
  // Flips true after a submit attempt with incomplete rows, revealing the
  // per-field validation errors.
  const [validationAttempted, setValidationAttempted] = useState(false);
  // Bumped when we surface field errors so we can scroll to the first one.
  const [errorScrollTick, setErrorScrollTick] = useState(0);
  const fileInputRefs = useRef<Record<string, HTMLInputElement | null>>({});
  const scrollContainerRef = useRef<HTMLDivElement | null>(null);
  // Set when "Add another item" appends a card, so the effect below scrolls
  // it into view once it has rendered.
  const pendingScrollRef = useRef(false);

  // Revoke any object URLs we created for previews.
  const revokePreviews = (list: TtsRowDraft[]) => {
    list.forEach((r) => {
      if (r.previewUrl) URL.revokeObjectURL(r.previewUrl);
    });
  };

  // Reset whenever the dialog opens (fresh edit from latest selection, or a
  // blank add). Revoke previous previews first.
  useEffect(() => {
    if (isOpen) {
      setRows((prev) => {
        revokePreviews(prev);
        return rowsFromInitial(initialRows);
      });
      setError(null);
      setNameErrors({});
      setAudioErrors({});
      setValidationAttempted(false);
      setErrorScrollTick(0);
    }
  }, [isOpen, initialRows]);

  useEffect(
    () => () => {
      setRows((prev) => {
        revokePreviews(prev);
        return prev;
      });
    },
    [],
  );

  // After a card is appended, scroll the container to the bottom so the new
  // card is visible. Guarded for jsdom, which lacks a real scrollTo.
  useEffect(() => {
    if (!pendingScrollRef.current) return;
    pendingScrollRef.current = false;
    const el = scrollContainerRef.current;
    if (el && typeof el.scrollTo === "function") {
      el.scrollTo({ top: el.scrollHeight, behavior: "smooth" });
    }
  }, [rows.length]);

  // After a failed submit (or blocked "add another"), scroll the first
  // invalid field into view if it isn't already visible.
  useEffect(() => {
    if (errorScrollTick === 0) return;
    return scheduleScrollToFirstFieldError(scrollContainerRef.current);
  }, [errorScrollTick]);

  const isDirty = isEdit
    ? rows.some((r, i) => {
        const init = initialRows?.[i];
        return (
          r.name.trim() !== (init?.name ?? "").trim() ||
          r.text.trim() !== (init?.text ?? "").trim() ||
          !!r.audioFile // any replacement audio counts as an edit
        );
      })
    : rows.some((r) => r.name.trim() || r.text.trim() || r.audioFile);

  const { discardConfirmOpen, closeDiscardConfirm, doClose, attemptClose } =
    useUnsavedCloseGuard({
      isOpen,
      isDirty,
      isEdit,
      submitting,
      onClose,
      onBeforeClose: () => {
        setError(null);
        setNameErrors({});
      },
    });

  if (!isOpen) return null;

  const updateRow = (id: string, patch: Partial<TtsRowDraft>) => {
    setRows((prev) => prev.map((r) => (r.id === id ? { ...r, ...patch } : r)));
    if (patch.name !== undefined && nameErrors[id]) {
      setNameErrors((prev) => {
        const next = { ...prev };
        delete next[id];
        return next;
      });
    }
  };

  const handleFilePicked = async (id: string, file: File | null) => {
    if (!file) return;
    setAudioErrors((prev) => {
      const n = { ...prev };
      delete n[id];
      return n;
    });
    const validationError = await validateTtsAudioFile(file);
    if (validationError) {
      setAudioErrors((prev) => ({ ...prev, [id]: validationError }));
      return;
    }
    setRows((prev) =>
      prev.map((r) => {
        if (r.id !== id) return r;
        if (r.previewUrl) URL.revokeObjectURL(r.previewUrl);
        // A newly-picked file invalidates any prior upload for this row.
        return {
          ...r,
          audioFile: file,
          previewUrl: URL.createObjectURL(file),
          uploadedPath: null,
        };
      }),
    );
  };

  const removeRow = (id: string) => {
    setRows((prev) => {
      if (prev.length === 1) return prev;
      const target = prev.find((r) => r.id === id);
      if (target?.previewUrl) URL.revokeObjectURL(target.previewUrl);
      return prev.filter((r) => r.id !== id);
    });
  };

  const isRowValid = (r: TtsRowDraft) =>
    !!r.name.trim() &&
    !!r.text.trim() &&
    (!!r.audioFile || !!r.existingAudio);

  const validRows = rows.filter(isRowValid);
  const allComplete = rows.every(isRowValid);

  const addRow = () => {
    // Don't append a fresh blank card until the existing ones are complete.
    if (!allComplete) {
      setValidationAttempted(true);
      setErrorScrollTick((n) => n + 1);
      return;
    }
    // The freshly appended card starts clean — validation only re-triggers on
    // the next submit, not carried over from an earlier failed submit.
    setValidationAttempted(false);
    pendingScrollRef.current = true;
    setRows((prev) => [...prev, newRow()]);
  };

  const handleSubmit = async () => {
    if (submitting) return;
    // Surface per-field errors instead of silently dropping incomplete rows.
    if (!allComplete) {
      setValidationAttempted(true);
      setErrorScrollTick((n) => n + 1);
      return;
    }
    setSubmitting(true);
    setError(null);
    setNameErrors({});
    try {
      // Upload any newly-picked audio to S3, then map each row to its
      // resolved audio_path (new upload, or the kept existing audio).
      // A successful upload is remembered on the row (`uploadedPath`) so a
      // retry — e.g. after a name conflict — doesn't re-upload it.
      const uploaded: Record<string, string> = {};
      for (const r of validRows) {
        if (r.uploadedPath) {
          uploaded[r.id] = r.uploadedPath;
          continue;
        }
        if (r.audioFile) {
          const path = await uploadTtsAudioToS3(r.audioFile, accessToken);
          if (!path) {
            setError(
              `Failed to upload audio for "${r.name.trim() || "an item"}". Nothing was saved — please retry.`,
            );
            return;
          }
          uploaded[r.id] = path;
        }
      }
      // Persist the uploaded keys before the save so a retry skips re-upload.
      if (Object.keys(uploaded).length > 0) {
        setRows((prev) =>
          prev.map((r) =>
            uploaded[r.id] ? { ...r, uploadedPath: uploaded[r.id] } : r,
          ),
        );
      }
      const resolved: TtsItemRowSubmission[] = validRows.map((r) => ({
        uuid: r.uuid,
        name: r.name.trim(),
        text: r.text.trim(),
        audio_path: uploaded[r.id] ?? r.existingAudio ?? "",
      }));
      await onSubmit(resolved);
    } catch (err) {
      const conflict = parseItemNameConflictFromError(err);
      if (conflict) {
        const byRow = rowNameErrorsFromConflict(rows, conflict);
        if (Object.keys(byRow).length > 0) {
          setNameErrors(byRow);
          setErrorScrollTick((n) => n + 1);
        } else {
          setError(conflict.message);
        }
      } else {
        setError(
          extractApiError(
            err,
            isEdit ? "Failed to save items" : "Failed to add items",
          ),
        );
      }
    } finally {
      setSubmitting(false);
    }
  };

  const submitLabel = submitting
    ? isEdit
      ? "Saving..."
      : "Adding..."
    : isEdit
      ? rows.length > 1
        ? `Save ${rows.length} items`
        : "Save item"
      : rows.length > 1
        ? `Add ${rows.length} items`
        : "Add item";

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
      <div
        className="bg-background border border-border rounded-xl w-full max-w-2xl shadow-2xl flex flex-col max-h-[90vh]"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-3 px-5 md:px-6 py-4 border-b border-border">
          <div>
            <h2 className="text-base md:text-lg font-semibold text-foreground">
              {isEdit ? "Edit items" : "Add items"}
            </h2>
            <p className="text-xs md:text-sm text-muted-foreground mt-1">
              {isEdit
                ? "Update the name, reference text, and audio for each item"
                : "Annotators will listen to the audio and judge its quality"}
            </p>
          </div>
          <button
            onClick={attemptClose}
            disabled={submitting}
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

        <div
          ref={scrollContainerRef}
          className="flex-1 overflow-y-auto p-4 md:p-6 space-y-4"
        >
          {rows.map((row, idx) => {
            const playSrc = row.previewUrl ?? row.existingAudio;
            const fileName = row.audioFile?.name;
            const nameMissing = validationAttempted && !row.name.trim();
            const nameConflict = nameErrors[row.id];
            const nameInvalid = nameMissing || !!nameConflict;
            const textMissing = validationAttempted && !row.text.trim();
            const audioMissing =
              validationAttempted && !row.audioFile && !row.existingAudio;
            return (
              <div
                key={row.id}
                className="border border-border rounded-xl bg-muted/50 p-5 space-y-4"
              >
                {(!isEdit || rows.length > 1) && (
                  <div className="flex items-center justify-between border-b border-border pb-3">
                    <h3 className="text-sm font-semibold text-foreground">
                      Item {idx + 1}
                    </h3>
                    {!isEdit && (
                      <button
                        onClick={() => removeRow(row.id)}
                        disabled={rows.length === 1 || submitting}
                        className="w-7 h-7 flex items-center justify-center rounded-md text-muted-foreground hover:text-red-500 hover:bg-red-500/10 transition-colors cursor-pointer disabled:opacity-30 disabled:cursor-not-allowed"
                        aria-label={`Remove item ${idx + 1}`}
                        title="Remove this item"
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
                            d="M6 18L18 6M6 6l12 12"
                          />
                        </svg>
                      </button>
                    )}
                  </div>
                )}

                {/* Name */}
                <div className="space-y-1">
                  <label className="text-xs font-medium text-muted-foreground">
                    Name <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    value={row.name}
                    onChange={(e) => updateRow(row.id, { name: e.target.value })}
                    placeholder="e.g. Clip 1"
                    disabled={submitting}
                    className={`w-full h-9 px-3 rounded-md text-sm border bg-background text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-accent disabled:opacity-50 ${nameInvalid ? "border-red-500 ring-1 ring-red-500/30" : "border-border"}`}
                  />
                  <FieldError show={nameMissing}>Name is required</FieldError>
                  <FieldError show={!!nameConflict && !nameMissing}>
                    {nameConflict}
                  </FieldError>
                </div>

                {/* Reference text */}
                <div className="space-y-1">
                  <label className="text-xs font-medium text-muted-foreground">
                    Reference text <span className="text-red-500">*</span>
                  </label>
                  <textarea
                    value={row.text}
                    onChange={(e) => updateRow(row.id, { text: e.target.value })}
                    placeholder="The reference text that was spoken"
                    disabled={submitting}
                    rows={2}
                    className={`w-full px-3 py-2 rounded-md text-sm border bg-background text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-accent disabled:opacity-50 resize-y ${textMissing ? "border-red-500 ring-1 ring-red-500/30" : "border-border"}`}
                  />
                  <FieldError show={textMissing}>
                    Reference text is required
                  </FieldError>
                </div>

                {/* Audio */}
                <div className="space-y-1">
                  <label className="text-xs font-medium text-muted-foreground">
                    Audio <span className="text-red-500">*</span>
                  </label>
                  <input
                    ref={(el) => {
                      fileInputRefs.current[row.id] = el;
                    }}
                    type="file"
                    accept=".wav,audio/wav,audio/x-wav,audio/mpeg,audio/*"
                    className="hidden"
                    disabled={submitting}
                    onChange={(e) => {
                      const f = e.target.files?.[0] ?? null;
                      void handleFilePicked(row.id, f);
                      e.target.value = "";
                    }}
                  />
                  <div className="flex flex-wrap items-center gap-2">
                    <button
                      type="button"
                      onClick={() => fileInputRefs.current[row.id]?.click()}
                      disabled={submitting}
                      className={`h-9 px-3 rounded-md text-sm font-medium border bg-background hover:bg-muted/50 transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-1.5 ${audioMissing ? "border-red-500 ring-1 ring-red-500/30" : "border-border"}`}
                    >
                      <svg
                        className="w-4 h-4"
                        fill="none"
                        viewBox="0 0 24 24"
                        stroke="currentColor"
                        strokeWidth={1.8}
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5m-13.5-9L12 3m0 0l4.5 4.5M12 3v13.5"
                        />
                      </svg>
                      {playSrc ? "Replace audio" : "Upload audio"}
                    </button>
                    {fileName ? (
                      <span
                        className="text-xs text-muted-foreground truncate max-w-[200px]"
                        title={fileName}
                      >
                        {fileName}
                      </span>
                    ) : row.existingAudio && !row.previewUrl ? (
                      <span className="text-xs text-muted-foreground">
                        Current audio
                      </span>
                    ) : null}
                  </div>
                  {playSrc && (
                    <div className="pt-1">
                      <LazyAudioPlayer src={playSrc} className="w-full" />
                    </div>
                  )}
                  {audioErrors[row.id] && (
                    <p className="text-xs text-red-500">{audioErrors[row.id]}</p>
                  )}
                  <FieldError show={audioMissing && !audioErrors[row.id]}>
                    Audio is required
                  </FieldError>
                </div>
              </div>
            );
          })}

          {!isEdit && (
            <button
              onClick={addRow}
              disabled={submitting || !allComplete}
              title={
                !allComplete
                  ? "Fill in all items before adding another"
                  : undefined
              }
              className="w-full h-10 rounded-md text-sm font-medium border border-dashed border-border bg-background hover:bg-muted/50 text-muted-foreground hover:text-foreground transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-1.5"
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
                  d="M12 4.5v15m7.5-7.5h-15"
                />
              </svg>
              Add another item
            </button>
          )}

          {error && (
            <div className="rounded-md border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-500">
              {error}
            </div>
          )}
        </div>

        <div className="flex items-center justify-end gap-2 md:gap-3 px-5 md:px-6 py-4 border-t border-border">
          <button
            onClick={attemptClose}
            disabled={submitting}
            className="h-9 md:h-10 px-4 rounded-md text-sm md:text-base font-medium border border-border bg-background dark:bg-muted hover:bg-muted/50 dark:hover:bg-accent transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
          >
            Cancel
          </button>
          <button
            onClick={handleSubmit}
            disabled={submitting}
            className="h-9 md:h-10 px-4 rounded-md text-sm md:text-base font-medium bg-foreground text-background hover:opacity-90 transition-opacity cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {submitLabel}
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
