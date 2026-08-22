"use client";

import { useCallback, useEffect, useState } from "react";
import { Link } from "@/lib/nav";
import { useAccessToken } from "@/hooks";
import { reportError } from "@/lib/reportError";
import { PreBuiltPill } from "@/components/EvaluatorPills";
import { DeleteConfirmationDialog } from "@/components/DeleteConfirmationDialog";
import { CreateEvaluatorFlow } from "@/components/evaluators/CreateEvaluatorFlow";
import {
  deleteEvaluator,
  fetchAllEvaluators,
  isDefaultEvaluator,
  type EvaluatorData,
} from "@/lib/evaluatorApi";
import type { EvaluatorType } from "@/components/EvaluatorPills";

// Same emerald tint the create action carries on the agent Evaluators tab and
// inside a new run, so the button reads the same everywhere.
const CREATE_BUTTON_CLASS =
  "h-9 md:h-10 px-3 md:px-4 rounded-md text-sm md:text-base font-medium border cursor-pointer transition-colors bg-emerald-500/12 border-emerald-500/45 text-emerald-950 dark:text-emerald-100 hover:bg-emerald-500/22 dark:hover:bg-emerald-500/18";

type EvaluatorLibraryPanelProps = {
  /** Only evaluators of this kind are listed and created here. */
  evaluatorType: Extract<EvaluatorType, "stt" | "tts" | "conversation">;
  /** One line under the tab saying what these evaluators are for. */
  description: string;
};

/**
 * Every evaluator of one kind, with view, delete and create, laid out like the
 * cards shown when choosing evaluators for a run. Used by the Evaluators tab
 * on the Speech-to-Text and Text-to-Speech pages, so evaluators can be managed
 * without starting a run.
 */
export function EvaluatorLibraryPanel({
  evaluatorType,
  description,
}: EvaluatorLibraryPanelProps) {
  const backendAccessToken = useAccessToken();
  const [evaluators, setEvaluators] = useState<EvaluatorData[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [createFlowOpen, setCreateFlowOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<EvaluatorData | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!backendAccessToken) return;
    try {
      setIsLoading(true);
      setError(null);
      const all = await fetchAllEvaluators(backendAccessToken);
      setEvaluators(all.filter((e) => e.evaluator_type === evaluatorType));
    } catch (err) {
      reportError("Error loading evaluators:", err);
      setError(
        err instanceof Error ? err.message : "Failed to load evaluators",
      );
    } finally {
      setIsLoading(false);
    }
  }, [backendAccessToken, evaluatorType]);

  useEffect(() => {
    load();
  }, [load]);

  const handleConfirmDelete = async () => {
    if (!deleteTarget || !backendAccessToken) return;
    try {
      setIsDeleting(true);
      setDeleteError(null);
      await deleteEvaluator(deleteTarget.uuid, backendAccessToken);
      setEvaluators((prev) => prev.filter((e) => e.uuid !== deleteTarget.uuid));
      setDeleteTarget(null);
    } catch (err) {
      reportError("Error deleting evaluator:", err);
      // Keep the dialog open and say what failed rather than closing as if it
      // had worked.
      setDeleteError(
        err instanceof Error ? err.message : "Failed to delete evaluator",
      );
    } finally {
      setIsDeleting(false);
    }
  };

  const createButton = (
    <button
      type="button"
      onClick={() => setCreateFlowOpen(true)}
      className={CREATE_BUTTON_CLASS}
    >
      Create evaluator
    </button>
  );

  return (
    <div className="flex flex-col">
      {evaluators.length > 0 && (
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-5 md:mb-6">
          <p className="text-sm md:text-base font-medium text-foreground">
            {description}
          </p>
          {createButton}
        </div>
      )}

      {isLoading ? (
        <div className="flex-1 border border-border rounded-xl p-6 md:p-12 flex items-center justify-center bg-muted/20">
          <svg className="w-5 h-5 animate-spin" fill="none" viewBox="0 0 24 24">
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
        <div className="flex-1 border border-border rounded-xl p-6 md:p-12 flex flex-col items-center justify-center bg-muted/20">
          <p className="text-sm md:text-base text-red-500 mb-2">{error}</p>
          <button
            type="button"
            onClick={load}
            className="text-sm md:text-base text-muted-foreground hover:text-foreground transition-colors cursor-pointer"
          >
            Retry
          </button>
        </div>
      ) : evaluators.length === 0 ? (
        <div className="flex-1 border border-border rounded-xl p-6 md:p-12 flex flex-col items-center justify-center bg-muted/20">
          <h3 className="text-base md:text-lg font-semibold text-foreground mb-1">
            No evaluators yet
          </h3>
          <p className="text-sm md:text-base text-muted-foreground mb-3 md:mb-4 text-center max-w-md">
            {description}. Create one to use it in your next evaluation.
          </p>
          {createButton}
        </div>
      ) : (
        <div className="space-y-3 md:space-y-4">
          {evaluators.map((evaluator) => (
            <div
              key={evaluator.uuid}
              className="relative border border-border rounded-xl bg-background dark:bg-muted px-4 py-3 md:px-5 md:py-3 transition-colors"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <h3 className="text-base font-semibold text-foreground">
                      {evaluator.name}
                    </h3>
                    {isDefaultEvaluator(evaluator) && <PreBuiltPill />}
                  </div>
                  {evaluator.description && (
                    <p className="text-sm text-muted-foreground mt-0.5">
                      {evaluator.description}
                    </p>
                  )}
                </div>
                <div className="flex items-center gap-1 flex-shrink-0">
                  <Link
                    href={`/evaluators/${evaluator.uuid}`}
                    className="h-8 md:h-9 px-3 rounded-md text-xs md:text-sm font-medium border border-border bg-background hover:bg-muted/50 transition-colors cursor-pointer inline-flex items-center"
                    title="View evaluator"
                  >
                    View
                  </Link>
                  <button
                    type="button"
                    onClick={() => {
                      setDeleteError(null);
                      setDeleteTarget(evaluator);
                    }}
                    className="h-8 md:h-9 px-3 rounded-md text-xs md:text-sm font-medium border border-border bg-background hover:bg-muted/50 transition-colors cursor-pointer"
                    title="Delete evaluator"
                  >
                    Delete
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      <DeleteConfirmationDialog
        isOpen={!!deleteTarget}
        onClose={() => {
          if (isDeleting) return;
          setDeleteTarget(null);
          setDeleteError(null);
        }}
        onConfirm={handleConfirmDelete}
        title="Delete evaluator"
        message={`Permanently deleting "${deleteTarget?.name ?? ""}" will remove it from everywhere it is used and cannot be undone.`}
        confirmText="Delete"
        isDeleting={isDeleting}
        extraContent={
          deleteError ? (
            <p className="text-sm text-red-500">{deleteError}</p>
          ) : undefined
        }
      />

      <CreateEvaluatorFlow
        open={createFlowOpen}
        onClose={() => setCreateFlowOpen(false)}
        existingEvaluators={evaluators}
        useCaseTypes={[evaluatorType]}
        onCreated={() => {
          setCreateFlowOpen(false);
          load();
        }}
      />
    </div>
  );
}
