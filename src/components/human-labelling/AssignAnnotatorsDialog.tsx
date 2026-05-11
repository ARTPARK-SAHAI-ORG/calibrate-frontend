"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useHideFloatingButton } from "@/components/AppLayout";
import { EmptyState } from "@/components/ui/LoadingState";
import { apiClient } from "@/lib/api";

type Annotator = {
  uuid: string;
  name: string;
};

function parseApiError(err: unknown, fallback: string): string {
  if (!(err instanceof Error)) return fallback;
  const match = err.message.match(/Request failed: \d+ - (.+)$/);
  if (match) {
    try {
      const parsed = JSON.parse(match[1]);
      if (parsed && typeof parsed.detail === "string") return parsed.detail;
    } catch {
      // not JSON
    }
    return match[1];
  }
  return err.message || fallback;
}

type AssignAnnotatorsDialogProps = {
  isOpen: boolean;
  accessToken: string;
  selectedItemCount: number;
  onClose: () => void;
  onConfirm: (annotatorIds: string[]) => Promise<void> | void;
};

export function AssignAnnotatorsDialog({
  isOpen,
  accessToken,
  selectedItemCount,
  onClose,
  onConfirm,
}: AssignAnnotatorsDialogProps) {
  useHideFloatingButton(isOpen);

  const [annotators, setAnnotators] = useState<Annotator[]>([]);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  useEffect(() => {
    if (!isOpen) return;
    setPicked(new Set());
    setSubmitError(null);
    let cancelled = false;
    const run = async () => {
      setLoading(true);
      setLoadError(null);
      try {
        const data = await apiClient<Annotator[]>("/annotators", accessToken);
        if (!cancelled) setAnnotators(Array.isArray(data) ? data : []);
      } catch (err) {
        if (!cancelled)
          setLoadError(parseApiError(err, "Failed to load annotators"));
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    run();
    return () => {
      cancelled = true;
    };
  }, [isOpen, accessToken]);

  if (!isOpen) return null;

  const toggle = (id: string) => {
    setPicked((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const handleConfirm = async () => {
    if (picked.size === 0 || submitting) return;
    setSubmitting(true);
    setSubmitError(null);
    try {
      await onConfirm(Array.from(picked));
    } catch (err) {
      setSubmitError(parseApiError(err, "Failed to create jobs"));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4"
      onClick={() => {
        if (!submitting) onClose();
      }}
    >
      <div
        className="bg-background border border-border rounded-xl shadow-2xl w-full max-w-md flex flex-col max-h-[90vh]"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="px-6 py-4 border-b border-border flex items-center justify-between">
          <div>
            <h2 className="text-lg font-semibold">Assign annotators</h2>
            <p className="text-xs text-muted-foreground mt-1">
              One labelling job will be created for each selected annotator
            </p>
          </div>
          <button
            onClick={onClose}
            disabled={submitting}
            className="w-8 h-8 flex items-center justify-center rounded-md hover:bg-muted transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
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
        <div className="p-4 md:p-6 space-y-2 max-h-80 overflow-y-auto">
          {loading ? (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
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
              Loading annotators
            </div>
          ) : loadError ? (
            <p className="text-sm text-red-500">{loadError}</p>
          ) : annotators.length === 0 ? (
            <EmptyState
              icon={
                <svg
                  className="w-7 h-7 text-muted-foreground"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                  strokeWidth={1.5}
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M15 19.128a9.38 9.38 0 002.625.372 9.337 9.337 0 004.121-.952 4.125 4.125 0 00-7.533-2.493M15 19.128v-.003c0-1.113-.285-2.16-.786-3.07M15 19.128v.106A12.318 12.318 0 018.624 21c-2.331 0-4.512-.645-6.374-1.766l-.001-.109a6.375 6.375 0 0111.964-3.07M12 6.375a3.375 3.375 0 11-6.75 0 3.375 3.375 0 016.75 0zm8.25 2.25a2.625 2.625 0 11-5.25 0 2.625 2.625 0 015.25 0z"
                  />
                </svg>
              }
              title="No annotators yet"
              description={
                <>
                  <Link
                    href="/human-alignment?tab=annotators"
                    className="underline underline-offset-2 hover:text-foreground transition-colors"
                  >
                    Add annotators
                  </Link>{" "}
                  to your account first
                </>
              }
            />
          ) : (
            annotators.map((a) => (
              <label
                key={a.uuid}
                className="flex items-center gap-3 px-3 py-2 rounded-md border border-border hover:bg-muted/30 transition-colors cursor-pointer"
              >
                <input
                  type="checkbox"
                  checked={picked.has(a.uuid)}
                  onChange={() => toggle(a.uuid)}
                  className="w-4 h-4 cursor-pointer accent-foreground"
                />
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-medium truncate">{a.name}</div>
                </div>
              </label>
            ))
          )}
          {submitError && <p className="text-sm text-red-500">{submitError}</p>}
        </div>
        <div className="px-6 py-4 border-t border-border flex items-center justify-end gap-3">
          <button
            onClick={onClose}
            disabled={submitting}
            className="h-10 px-4 rounded-md text-sm font-medium border border-border bg-background hover:bg-muted/50 transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
          >
            Cancel
          </button>
          <button
            onClick={handleConfirm}
            disabled={picked.size === 0 || submitting}
            className="h-10 px-4 rounded-md text-sm font-medium bg-foreground text-background hover:opacity-90 transition-opacity cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {submitting ? "Assigning..." : "Assign"}
          </button>
        </div>
      </div>
    </div>
  );
}
