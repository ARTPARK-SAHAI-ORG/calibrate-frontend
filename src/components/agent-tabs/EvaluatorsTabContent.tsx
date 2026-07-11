"use client";

import React, { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { useAccessToken } from "@/hooks";
import { reportError } from "@/lib/reportError";
import { EvaluatorTypePill, OutputTypePill } from "@/components/EvaluatorPills";
import { DeleteConfirmationDialog } from "@/components/DeleteConfirmationDialog";
import { AddEvaluatorsDialog } from "@/components/agent-tabs/AddEvaluatorsDialog";
import { CreateEvaluatorFlow } from "@/components/evaluators/CreateEvaluatorFlow";
import { DuplicateEvaluatorDialog } from "@/components/evaluators/DuplicateEvaluatorDialog";
import {
  type EvaluatorData,
  fetchAllEvaluators,
  fetchAgentEvaluators,
  attachEvaluatorToAgent,
  detachEvaluatorFromAgent,
  deleteEvaluator,
  isOwnedEvaluator,
} from "@/lib/evaluatorApi";

// Two remove flavours share one confirmation dialog:
//   "remove"     → detach from this agent only (evaluator stays in library).
//   "permanent"  → permanently delete the evaluator record (owned only).
type DeleteMode = "remove" | "permanent";

// Attach-existing action → indigo tint; Create → emerald tint. Mirrors the
// fixed-tint convention used by the Tests tab header so the two "add" actions
// read as distinct.
const ADD_BUTTON_CLASS =
  "h-9 md:h-10 px-3 md:px-4 rounded-md text-sm md:text-base font-medium border cursor-pointer transition-colors bg-indigo-500/12 border-indigo-500/45 text-indigo-950 dark:text-indigo-100 hover:bg-indigo-500/22 dark:hover:bg-indigo-500/18";
const CREATE_BUTTON_CLASS =
  "h-9 md:h-10 px-3 md:px-4 rounded-md text-sm md:text-base font-medium border cursor-pointer transition-colors bg-emerald-500/12 border-emerald-500/45 text-emerald-950 dark:text-emerald-100 hover:bg-emerald-500/22 dark:hover:bg-emerald-500/18";

// Agent tests only use next-reply (`llm`) and conversation evaluators.
const AGENT_EVALUATOR_TYPES = new Set(["llm", "conversation"]);

export function EvaluatorsTabContent({
  agentUuid,
}: {
  agentUuid: string;
  agentName?: string;
}) {
  const backendAccessToken = useAccessToken();

  // Attached list (rendered as cards) + full library (Add dialog +
  // duplicate-name validation for the create/duplicate flows).
  const [attachedEvaluators, setAttachedEvaluators] = useState<EvaluatorData[]>(
    [],
  );
  const [allEvaluators, setAllEvaluators] = useState<EvaluatorData[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Dialog / flow state
  const [addDialogOpen, setAddDialogOpen] = useState(false);
  const [createFlowOpen, setCreateFlowOpen] = useState(false);
  const [duplicateTarget, setDuplicateTarget] = useState<EvaluatorData | null>(
    null,
  );

  // Shared destructive-confirmation dialog state.
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<EvaluatorData | null>(null);
  const [deleteMode, setDeleteMode] = useState<DeleteMode>("remove");
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  const loadAttached = useCallback(async () => {
    if (!backendAccessToken) return;
    const data = await fetchAgentEvaluators(agentUuid, backendAccessToken);
    setAttachedEvaluators(data);
  }, [agentUuid, backendAccessToken]);

  const loadLibrary = useCallback(async () => {
    if (!backendAccessToken) return;
    const data = await fetchAllEvaluators(backendAccessToken);
    setAllEvaluators(data);
  }, [backendAccessToken]);

  // Initial load of both lists.
  useEffect(() => {
    if (!agentUuid || !backendAccessToken) return;
    let cancelled = false;
    (async () => {
      try {
        setLoading(true);
        setError(null);
        await Promise.all([loadAttached(), loadLibrary()]);
      } catch (err) {
        if (!cancelled) {
          reportError("Error loading agent evaluators:", err);
          setError(
            err instanceof Error ? err.message : "Failed to load evaluators",
          );
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [agentUuid, backendAccessToken, loadAttached, loadLibrary]);

  // Attach the newly-selected library evaluators to the agent (add-only, one
  // POST each so other changes to the agent's list aren't disturbed), then
  // refresh.
  const handleAddEvaluators = useCallback(
    async (selectedUuids: string[]) => {
      if (!backendAccessToken || selectedUuids.length === 0) return;
      try {
        for (const uuid of selectedUuids) {
          await attachEvaluatorToAgent(agentUuid, uuid, backendAccessToken);
        }
        await loadAttached();
      } catch (err) {
        reportError("Error adding evaluators to agent:", err);
        // Re-throw so AddEvaluatorsDialog can surface the failure and stay open
        // rather than closing as if the add succeeded.
        throw err;
      }
    },
    [agentUuid, backendAccessToken, loadAttached],
  );

  // A freshly-created evaluator: attach it to the agent, then refresh both
  // lists (it's new to the library too).
  const handleCreated = useCallback(
    async (evaluator: EvaluatorData) => {
      if (!backendAccessToken) return;
      try {
        await attachEvaluatorToAgent(
          agentUuid,
          evaluator.uuid,
          backendAccessToken,
        );
        await Promise.all([loadAttached(), loadLibrary()]);
      } catch (err) {
        reportError("Error attaching created evaluator:", err);
      } finally {
        setCreateFlowOpen(false);
      }
    },
    [agentUuid, backendAccessToken, loadAttached, loadLibrary],
  );

  // A duplicate is owned but NOT auto-attached — just refresh the library so
  // it shows up in the Add dialog and close.
  const handleDuplicated = useCallback(async () => {
    try {
      await loadLibrary();
    } catch (err) {
      reportError("Error refreshing evaluators after duplicate:", err);
    } finally {
      setDuplicateTarget(null);
    }
  }, [loadLibrary]);

  const openRemoveDialog = (evaluator: EvaluatorData) => {
    setDeleteTarget(evaluator);
    setDeleteMode("remove");
    setDeleteError(null);
    setDeleteDialogOpen(true);
  };

  const closeDeleteDialog = () => {
    if (isDeleting) return;
    setDeleteDialogOpen(false);
    setDeleteTarget(null);
    setDeleteMode("remove");
    setDeleteError(null);
  };

  const handleConfirmDelete = async () => {
    if (!deleteTarget || !backendAccessToken) return;
    const { uuid } = deleteTarget;
    try {
      setIsDeleting(true);
      setDeleteError(null);
      if (deleteMode === "permanent") {
        await deleteEvaluator(uuid, backendAccessToken);
        setAttachedEvaluators((prev) => prev.filter((e) => e.uuid !== uuid));
        setAllEvaluators((prev) => prev.filter((e) => e.uuid !== uuid));
      } else {
        await detachEvaluatorFromAgent(agentUuid, uuid, backendAccessToken);
        setAttachedEvaluators((prev) => prev.filter((e) => e.uuid !== uuid));
      }
      setDeleteDialogOpen(false);
      setDeleteTarget(null);
      setDeleteMode("remove");
    } catch (err) {
      reportError(
        deleteMode === "permanent"
          ? "Error deleting evaluator:"
          : "Error removing evaluator from agent:",
        err,
      );
      // Keep the dialog open and show the failure instead of closing silently.
      setDeleteError(
        err instanceof Error
          ? err.message
          : deleteMode === "permanent"
            ? "Failed to delete evaluator"
            : "Failed to remove evaluator from this agent",
      );
    } finally {
      setIsDeleting(false);
    }
  };

  // Library minus already-attached — what the Add dialog can offer.
  const attachedUuids = new Set(attachedEvaluators.map((e) => e.uuid));
  const availableEvaluators = allEvaluators.filter(
    (e) =>
      !attachedUuids.has(e.uuid) &&
      e.evaluator_type != null &&
      AGENT_EVALUATOR_TYPES.has(e.evaluator_type),
  );

  const deleteDialogTitle =
    deleteMode === "permanent" ? "Delete evaluator" : "Remove evaluator";
  const deleteDialogMessage =
    deleteMode === "permanent"
      ? `Permanently deleting "${deleteTarget?.name ?? ""}" will remove it from every agent that uses it and cannot be undone.`
      : `Are you sure you want to remove "${deleteTarget?.name ?? ""}" from this agent? The evaluator will stay in your library and on any other agents that use it.`;
  const canPermanentlyDelete = !!deleteTarget && isOwnedEvaluator(deleteTarget);

  const renderHeaderButtons = () => (
    <div className="flex flex-wrap items-center gap-2 md:gap-3">
      <button
        type="button"
        onClick={() => setAddDialogOpen(true)}
        className={ADD_BUTTON_CLASS}
      >
        Add evaluators
      </button>
      <button
        type="button"
        onClick={() => setCreateFlowOpen(true)}
        className={CREATE_BUTTON_CLASS}
      >
        Create evaluator
      </button>
    </div>
  );

  return (
    <div className="flex flex-col">
      {/* Header — title/subtitle on the left, add/create actions on the right.
          Only shown once at least one evaluator is attached; the empty state
          carries its own call-to-action. */}
      {attachedEvaluators.length > 0 && (
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-5 md:mb-6">
          <div>
            <h2 className="text-base md:text-lg font-semibold text-foreground">
              Evaluators
            </h2>
            <p className="text-sm text-muted-foreground mt-0.5">
              LLM judges for evaluating the agent&rsquo;s responses
            </p>
          </div>
          {renderHeaderButtons()}
        </div>
      )}

      {/* List / Loading / Error / Empty state */}
      {loading ? (
        <div className="flex-1 border border-border rounded-xl p-6 md:p-12 flex flex-col items-center justify-center bg-muted/20">
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
            onClick={() => window.location.reload()}
            className="text-sm md:text-base text-muted-foreground hover:text-foreground transition-colors cursor-pointer"
          >
            Retry
          </button>
        </div>
      ) : attachedEvaluators.length === 0 ? (
        <div className="flex-1 border border-border rounded-xl p-6 md:p-12 flex flex-col items-center justify-center bg-muted/20">
          <div className="w-12 h-12 md:w-14 md:h-14 rounded-xl bg-muted flex items-center justify-center mb-3 md:mb-4">
            <svg
              className="w-6 h-6 md:w-7 md:h-7 text-muted-foreground"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={1.5}
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M9 12.75L11.25 15 15 9.75M21 12c0 1.268-.63 2.39-1.593 3.068a3.745 3.745 0 01-1.043 3.296 3.745 3.745 0 01-3.296 1.043A3.745 3.745 0 0112 21c-1.268 0-2.39-.63-3.068-1.593a3.746 3.746 0 01-3.296-1.043 3.745 3.745 0 01-1.043-3.296A3.745 3.745 0 013 12c0-1.268.63-2.39 1.593-3.068a3.745 3.745 0 011.043-3.296 3.746 3.746 0 013.296-1.043A3.746 3.746 0 0112 3c1.268 0 2.39.63 3.068 1.593a3.746 3.746 0 013.296 1.043 3.746 3.746 0 011.043 3.296A3.745 3.745 0 0121 12z"
              />
            </svg>
          </div>
          <h3 className="text-base md:text-lg font-semibold text-foreground mb-1">
            No evaluators added yet
          </h3>
          <p className="text-sm md:text-base text-muted-foreground mb-3 md:mb-4 text-center max-w-md">
            Choose the LLM judges to evaluate the agent&rsquo;s responses. Add an
            existing one from your list of evaluators or create a new one.
          </p>
          <div className="flex flex-wrap items-center justify-center gap-2 md:gap-3">
            <button
              type="button"
              onClick={() => setAddDialogOpen(true)}
              className={ADD_BUTTON_CLASS}
            >
              Add evaluators
            </button>
            <button
              type="button"
              onClick={() => setCreateFlowOpen(true)}
              className={CREATE_BUTTON_CLASS}
            >
              Create evaluator
            </button>
          </div>
        </div>
      ) : (
        <div className="space-y-3">
          {attachedEvaluators.map((evaluator) => {
            return (
              <div
                key={evaluator.uuid}
                className="relative border border-border rounded-xl bg-background dark:bg-muted px-4 py-4 md:px-5 md:py-4 transition-colors"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <h3 className="text-base md:text-lg font-semibold text-foreground">
                        {evaluator.name}
                      </h3>
                      {evaluator.evaluator_type && (
                        <EvaluatorTypePill
                          evaluatorType={evaluator.evaluator_type}
                        />
                      )}
                      {evaluator.output_type && (
                        <OutputTypePill outputType={evaluator.output_type} />
                      )}
                    </div>
                    {evaluator.description && (
                      <p className="text-sm text-muted-foreground mt-2 leading-relaxed">
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
                      onClick={() => setDuplicateTarget(evaluator)}
                      className="h-8 md:h-9 px-3 rounded-md text-xs md:text-sm font-medium border border-border bg-background hover:bg-muted/50 transition-colors cursor-pointer flex items-center gap-1.5"
                      title="Duplicate evaluator"
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
                          d="M15.75 17.25v3.375c0 .621-.504 1.125-1.125 1.125h-9.75a1.125 1.125 0 01-1.125-1.125V7.875c0-.621.504-1.125 1.125-1.125H6.75a9.06 9.06 0 011.5.124m7.5 10.376h3.375c.621 0 1.125-.504 1.125-1.125V11.25c0-4.46-3.243-8.161-7.5-8.876a9.06 9.06 0 00-1.5-.124H9.375c-.621 0-1.125.504-1.125 1.125v3.5m7.5 10.375H9.375a1.125 1.125 0 01-1.125-1.125v-9.25m12 6.625v-1.875a3.375 3.375 0 00-3.375-3.375h-1.5a1.125 1.125 0 01-1.125-1.125v-1.5a3.375 3.375 0 00-3.375-3.375H9.75"
                        />
                      </svg>
                      Duplicate
                    </button>
                    <button
                      onClick={() => openRemoveDialog(evaluator)}
                      className="h-8 md:h-9 px-3 rounded-md text-xs md:text-sm font-medium border border-border bg-background hover:bg-muted/50 transition-colors cursor-pointer"
                      title="Remove from agent"
                    >
                      Remove
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Add existing evaluators */}
      <AddEvaluatorsDialog
        isOpen={addDialogOpen}
        availableEvaluators={availableEvaluators}
        onClose={() => setAddDialogOpen(false)}
        onAdd={handleAddEvaluators}
      />

      {/* Create a new evaluator inline (drives its own multi-step flow) */}
      <CreateEvaluatorFlow
        open={createFlowOpen}
        onClose={() => setCreateFlowOpen(false)}
        existingEvaluators={allEvaluators}
        onCreated={handleCreated}
        useCaseGroups={["conversation"]}
      />

      {/* Duplicate an attached evaluator */}
      {duplicateTarget && (
        <DuplicateEvaluatorDialog
          originalEvaluator={duplicateTarget}
          existingEvaluators={allEvaluators}
          onClose={() => setDuplicateTarget(null)}
          onDuplicated={handleDuplicated}
          backendAccessToken={backendAccessToken ?? undefined}
        />
      )}

      {/* Shared detach/delete confirmation */}
      <DeleteConfirmationDialog
        isOpen={deleteDialogOpen}
        onClose={closeDeleteDialog}
        onConfirm={handleConfirmDelete}
        title={deleteDialogTitle}
        message={deleteDialogMessage}
        confirmText={deleteMode === "permanent" ? "Delete" : "Remove"}
        isDeleting={isDeleting}
        extraContent={
          <div className="space-y-3">
            {canPermanentlyDelete && (
              <label className="flex items-start gap-2.5 rounded-md border border-red-500/30 bg-red-500/5 px-3 py-2.5 cursor-pointer">
                <input
                  type="checkbox"
                  checked={deleteMode === "permanent"}
                  onChange={(e) =>
                    setDeleteMode(e.target.checked ? "permanent" : "remove")
                  }
                  disabled={isDeleting}
                  className="mt-0.5 w-4 h-4 accent-red-600 cursor-pointer flex-shrink-0 disabled:cursor-not-allowed"
                />
                <span className="text-sm text-foreground">
                  Also delete this evaluator permanently from my evaluator
                  library
                  <span className="block text-xs text-muted-foreground mt-0.5">
                    Removes the evaluator from every agent that uses it
                  </span>
                </span>
              </label>
            )}
            {deleteError && (
              <p role="alert" className="text-sm text-red-600 dark:text-red-400">
                {deleteError}
              </p>
            )}
          </div>
        }
      />
    </div>
  );
}
