"use client";

import { useCallback, useEffect, useState } from "react";
import { Link } from "@/lib/nav";
import { useAccessToken } from "@/hooks";
import { reportError } from "@/lib/reportError";
import { PreBuiltPill } from "@/components/EvaluatorPills";
import { DeleteConfirmationDialog } from "@/components/DeleteConfirmationDialog";
import { CreateEvaluatorFlow } from "@/components/evaluators/CreateEvaluatorFlow";
import { SearchInput } from "@/components/ui";
import {
  canDeleteEvaluator,
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
  /** Only evaluators of these kinds are listed and created here. */
  evaluatorTypes: EvaluatorType[];
  /**
   * Set when the panel is the whole page rather than one tab of it: the panel
   * then draws the page header (title, description under it, action on the
   * right) the same way every other list page does.
   */
  title?: string;
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
  evaluatorTypes,
  title,
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
  const [searchQuery, setSearchQuery] = useState("");

  const load = useCallback(async () => {
    if (!backendAccessToken) return;
    try {
      setIsLoading(true);
      setError(null);
      const all = await fetchAllEvaluators(backendAccessToken);
      const kinds = new Set(evaluatorTypes);
      setEvaluators(
        all.filter(
          (e) => e.evaluator_type != null && kinds.has(e.evaluator_type),
        ),
      );
    } catch (err) {
      reportError("Error loading evaluators:", err);
      setError(
        err instanceof Error ? err.message : "Failed to load evaluators",
      );
    } finally {
      setIsLoading(false);
    }
    // The list of kinds is rebuilt on every render, so depend on its contents
    // rather than the array itself or every render would refetch.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [backendAccessToken, evaluatorTypes.join(",")]);

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

  const query = searchQuery.trim().toLowerCase();
  const shown = query
    ? evaluators.filter(
        (e) =>
          e.name.toLowerCase().includes(query) ||
          (e.description ?? "").toLowerCase().includes(query),
      )
    : evaluators;

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
      {title ? (
        <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3 mb-4 md:mb-6">
          <div>
            <h1 className="text-xl md:text-2xl font-semibold">{title}</h1>
            <p className="text-muted-foreground text-sm md:text-base leading-relaxed mt-1">
              {description}
            </p>
          </div>
          {createButton}
        </div>
      ) : (
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-4">
          <p className="text-sm md:text-base text-muted-foreground">
            {description}
          </p>
          {createButton}
        </div>
      )}

      <SearchInput
        value={searchQuery}
        onChange={setSearchQuery}
        placeholder="Search evaluators"
        className="max-w-md mb-5 md:mb-6"
      />

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
      ) : shown.length === 0 ? (
        <div className="flex-1 border border-border rounded-xl p-6 md:p-12 flex flex-col items-center justify-center bg-muted/20">
          <h3 className="text-base md:text-lg font-semibold text-foreground mb-1">
            {query ? "No evaluators found" : "No evaluators yet"}
          </h3>
          <p className="text-sm md:text-base text-muted-foreground mb-3 md:mb-4 text-center max-w-md">
            {query
              ? "No evaluators match your search."
              : `${description}. Create one to use it in your next evaluation.`}
          </p>
        </div>
      ) : (
        <div className="space-y-3 md:space-y-4">
          {shown.map((evaluator) => (
            <div
              key={evaluator.uuid}
              className="relative border border-border rounded-xl bg-background dark:bg-muted px-4 py-3 md:px-5 md:py-3 transition-colors cursor-pointer hover:bg-muted/20 dark:hover:bg-accent"
            >
              {/* Covers the whole card so it behaves like a link: clicking anywhere
                  opens the evaluator, and the buttons still sit above it. */}
              <Link
                href={`/evaluators/${evaluator.uuid}`}
                aria-label={`Open ${evaluator.name}`}
                className="absolute inset-0 rounded-xl z-0"
              />
              <div className="relative z-10 pointer-events-none flex items-start justify-between gap-3">
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
                <div className="flex items-center gap-1 flex-shrink-0 pointer-events-auto">
                  <Link
                    href={`/evaluators/${evaluator.uuid}`}
                    className="h-8 md:h-9 px-3 rounded-md text-xs md:text-sm font-medium border border-border bg-background hover:bg-muted/50 transition-colors cursor-pointer inline-flex items-center"
                    title="View evaluator"
                  >
                    View
                  </Link>
                  {canDeleteEvaluator(evaluator) && (
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
                  )}
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
        useCaseTypes={evaluatorTypes}
        onCreated={() => {
          setCreateFlowOpen(false);
          load();
        }}
      />
    </div>
  );
}
