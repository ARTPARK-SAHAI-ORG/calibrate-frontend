"use client";

import { useEffect, useState } from "react";
import { useHideFloatingButton } from "@/components/AppLayout";
import { parseBackendErrorMessage } from "@/lib/parseBackendError";
import type { OrganizationApiKeyWithSecret } from "@/lib/orgs";

type CreateApiKeyDialogProps = {
  isOpen: boolean;
  onClose: () => void;
  onCreate: (name: string) => Promise<OrganizationApiKeyWithSecret>;
};

/**
 * Two-phase dialog: first a name form, then a one-time reveal of the secret.
 * The plaintext key is shown exactly once — once the dialog closes it is gone,
 * matching the "show once on create" backend contract.
 */
export function CreateApiKeyDialog({
  isOpen,
  onClose,
  onCreate,
}: CreateApiKeyDialogProps) {
  useHideFloatingButton(isOpen);

  const [name, setName] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [createdKey, setCreatedKey] =
    useState<OrganizationApiKeyWithSecret | null>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!isOpen) {
      setName("");
      setError(null);
      setIsSubmitting(false);
      setCreatedKey(null);
      setCopied(false);
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = name.trim();
    if (!trimmed || isSubmitting) return;
    setIsSubmitting(true);
    setError(null);
    try {
      const created = await onCreate(trimmed);
      setCreatedKey(created);
    } catch (err) {
      setError(parseBackendErrorMessage(err, "Failed to create API key"));
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleCopy = async () => {
    if (!createdKey) return;
    try {
      await navigator.clipboard.writeText(createdKey.key);
    } catch {
      const el = document.createElement("textarea");
      el.value = createdKey.key;
      document.body.appendChild(el);
      el.select();
      document.execCommand("copy");
      document.body.removeChild(el);
    }
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
      {createdKey ? (
        <div className="bg-background rounded-xl w-full max-w-md p-5 md:p-6 shadow-2xl">
          <h2 className="text-base md:text-lg font-semibold text-foreground mb-2">
            API key created
          </h2>
          <p className="text-sm text-muted-foreground mb-4">
            Copy your key now and store it somewhere safe. For security, you
            won&apos;t be able to see it again.
          </p>

          <div className="flex items-stretch gap-2">
            <code className="flex-1 min-w-0 px-3 py-2 rounded-md border border-border bg-muted/40 text-xs font-mono text-foreground break-all">
              {createdKey.key}
            </code>
            <button
              type="button"
              onClick={handleCopy}
              className={`shrink-0 h-auto px-3 rounded-md text-xs font-medium border transition-colors cursor-pointer ${
                copied
                  ? "border-emerald-500/45 bg-emerald-500/15 text-emerald-700 dark:text-emerald-400"
                  : "border-border bg-background hover:bg-muted/50 text-foreground"
              }`}
            >
              {copied ? "Copied" : "Copy"}
            </button>
          </div>

          <div className="mt-5 flex items-center justify-end">
            <button
              type="button"
              onClick={onClose}
              className="h-9 md:h-10 px-4 rounded-md text-xs md:text-sm font-medium bg-foreground text-background hover:opacity-90 transition-colors cursor-pointer"
            >
              Done
            </button>
          </div>
        </div>
      ) : (
        <form
          onSubmit={handleSubmit}
          className="bg-background rounded-xl w-full max-w-md p-5 md:p-6 shadow-2xl"
        >
          <h2 className="text-base md:text-lg font-semibold text-foreground mb-2">
            Create API key
          </h2>
          <p className="text-sm text-muted-foreground mb-4">
            Use an API key to authenticate Calibrate from CI, like GitHub
            Actions. The key acts on this workspace.
          </p>

          <label className="block text-sm font-medium text-foreground mb-1.5">
            Name
          </label>
          <input
            type="text"
            value={name}
            onChange={(e) => {
              setName(e.target.value);
              setError(null);
            }}
            placeholder="e.g. GitHub Actions"
            autoFocus
            disabled={isSubmitting}
            className="w-full h-10 px-3 rounded-md border border-border bg-background text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-foreground/10 disabled:opacity-50"
          />

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
              disabled={isSubmitting || !name.trim()}
              className="h-9 md:h-10 px-4 rounded-md text-xs md:text-sm font-medium bg-foreground text-background hover:opacity-90 transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
            >
              {isSubmitting && (
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
              )}
              {isSubmitting ? "Creating..." : "Create key"}
            </button>
          </div>
        </form>
      )}

      {/* Backdrop click closes only from the name form, never mid-reveal. */}
      {!createdKey && (
        <div
          className="absolute inset-0 -z-10"
          onClick={isSubmitting ? undefined : onClose}
        />
      )}
    </div>
  );
}
