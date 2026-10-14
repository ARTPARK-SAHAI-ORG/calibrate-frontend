"use client";

import { useEffect, useRef, useState } from "react";
import { useHideFloatingButton } from "@/components/AppLayout";
import { SpinnerIcon } from "@/components/icons";
import {
  getErrorStatusCode,
  parseBackendErrorMessage,
} from "@/lib/parseBackendError";

type ProviderKeyDialogProps = {
  isOpen: boolean;
  onClose: () => void;
  /** Display name, e.g. "OpenRouter". */
  providerName: string;
  /** Google Cloud takes a service account file instead of a typed key. */
  isFile: boolean;
  isReplace: boolean;
  /** True when this would be the workspace's first key, which switches every
   *  run to its own keys, so the dialog asks once before saving. */
  isFirstKey: boolean;
  onSave: (value: string) => Promise<unknown>;
};

/**
 * The backend answers 503 with a sentence written for the reader (the server
 * is not set up to store keys), so it is shown as is rather than replaced with
 * the generic server error line.
 */
export function providerKeyErrorMessage(err: unknown): string {
  const fallback = "Failed to save the key";
  if (getErrorStatusCode(err) === 503 && err instanceof Error) {
    const body = err.message.match(/Request failed:\s*\d+\s*-\s*(.+)$/)?.[1];
    try {
      const detail = (JSON.parse(body ?? "") as { detail?: unknown }).detail;
      if (typeof detail === "string" && detail.trim()) return detail;
    } catch {
      // not JSON: fall through to the generic line
    }
  }
  return parseBackendErrorMessage(err, fallback);
}

export function ProviderKeyDialog({
  isOpen,
  onClose,
  providerName,
  isFile,
  isReplace,
  isFirstKey,
  onSave,
}: ProviderKeyDialogProps) {
  useHideFloatingButton(isOpen);

  const [value, setValue] = useState("");
  const [fileName, setFileName] = useState("");
  const [isConfirming, setIsConfirming] = useState(false);
  const [confirmed, setConfirmed] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const latestFile = useRef<File | undefined>(undefined);

  useEffect(() => {
    if (!isOpen) {
      setValue("");
      setFileName("");
      setIsConfirming(false);
      setConfirmed(false);
      setIsSubmitting(false);
      setError(null);
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const save = async () => {
    setIsSubmitting(true);
    setError(null);
    try {
      await onSave(isFile ? value : value.trim());
      onClose();
    } catch (err) {
      // Back to the form, so a refused key can be fixed and sent again.
      setIsConfirming(false);
      setError(providerKeyErrorMessage(err));
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!value.trim() || isSubmitting) return;
    if (isFirstKey && !confirmed) {
      setConfirmed(true);
      setIsConfirming(true);
      return;
    }
    void save();
  };

  const handleFile = async (file: File | undefined) => {
    latestFile.current = file;
    setError(null);
    if (!file) {
      setValue("");
      setFileName("");
      return;
    }
    setFileName(file.name);
    try {
      const text = await file.text();
      if (latestFile.current === file) setValue(text);
    } catch {
      if (latestFile.current !== file) return;
      setError(
        "Could not read the file. Choose the service account file again.",
      );
      setValue("");
    }
  };

  const savingLabel = `Checking the key with ${providerName}…`;

  const spinner = <SpinnerIcon className="w-4 h-4 animate-spin" />;

  const title = `${isReplace ? "Replace" : "Add"} ${providerName} key`;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
      {isConfirming ? (
        <div className="bg-background rounded-xl w-full max-w-md p-5 md:p-6 shadow-2xl">
          <h2 className="text-base md:text-lg font-semibold text-foreground mb-2">
            {title}
          </h2>
          <p className="text-sm text-muted-foreground">
            After this, runs use only your keys. Runs that need a provider
            without a key will fail.
          </p>

          <div className="mt-5 flex items-center justify-end gap-2 md:gap-3">
            <button
              type="button"
              onClick={onClose}
              disabled={isSubmitting}
              className="h-9 md:h-10 px-4 rounded-md text-xs md:text-sm font-medium border border-border bg-background hover:bg-muted/50 transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={() => void save()}
              disabled={isSubmitting}
              autoFocus
              className="h-9 md:h-10 px-4 rounded-md text-xs md:text-sm font-medium bg-foreground text-background hover:opacity-90 transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
            >
              {isSubmitting && spinner}
              {isSubmitting ? savingLabel : "Save the key"}
            </button>
          </div>
        </div>
      ) : (
        <form
          onSubmit={handleSubmit}
          className="bg-background rounded-xl w-full max-w-md p-5 md:p-6 shadow-2xl"
        >
          <h2 className="text-base md:text-lg font-semibold text-foreground mb-2">
            {title}
          </h2>

          {isFile ? (
            <>
              <label
                htmlFor="provider-key-file"
                className="block text-sm font-medium text-foreground mb-1.5"
              >
                Service account file
              </label>
              <input
                id="provider-key-file"
                type="file"
                accept=".json,application/json"
                onChange={(e) => void handleFile(e.target.files?.[0])}
                disabled={isSubmitting}
                className="w-full text-sm text-foreground file:mr-3 file:h-9 file:px-3 file:rounded-md file:border file:border-border file:bg-background file:text-sm file:font-medium file:text-foreground hover:file:bg-muted/50 file:cursor-pointer disabled:opacity-50"
              />
              {fileName && (
                <p className="mt-1.5 text-xs text-muted-foreground truncate">
                  {fileName}
                </p>
              )}
            </>
          ) : (
            <>
              <label
                htmlFor="provider-key-value"
                className="block text-sm font-medium text-foreground mb-1.5"
              >
                Key
              </label>
              <input
                id="provider-key-value"
                type="password"
                value={value}
                onChange={(e) => {
                  setValue(e.target.value);
                  setError(null);
                }}
                autoComplete="off"
                autoFocus
                disabled={isSubmitting}
                className="w-full h-10 px-3 rounded-md border border-border bg-background text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-foreground/10 disabled:opacity-50"
              />
            </>
          )}

          {error && (
            <p className="mt-3 text-sm text-red-600 dark:text-red-400">
              {error}
            </p>
          )}

          <div className="mt-5 flex items-center justify-end gap-2 md:gap-3">
            <button
              type="button"
              onClick={onClose}
              disabled={isSubmitting}
              className="h-9 md:h-10 px-4 rounded-md text-xs md:text-sm font-medium border border-border bg-background hover:bg-muted/50 transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isSubmitting || !value.trim()}
              className="h-9 md:h-10 px-4 rounded-md text-xs md:text-sm font-medium bg-foreground text-background hover:opacity-90 transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
            >
              {isSubmitting && spinner}
              {isSubmitting ? savingLabel : "Save the key"}
            </button>
          </div>
        </form>
      )}

      <div
        className="absolute inset-0 -z-10"
        onClick={isSubmitting ? undefined : onClose}
      />
    </div>
  );
}
