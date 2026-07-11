"use client";

import React, { useState, useEffect, useCallback } from "react";
import { useAccessToken } from "@/hooks";
import { reportError } from "@/lib/reportError";
import {
  EvaluatorTypePill,
  OutputTypePill,
} from "@/components/EvaluatorPills";
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
} from "@/lib/evaluatorApi";

// Two destructive flavours share one confirmation dialog:
//   "detach"  → remove the evaluator from THIS agent only (the record is kept).
//   "delete"  → permanently delete the evaluator record (owned evaluators only).
type DeleteMode = "detach" | "delete";

// Attach-existing action → indigo tint; Create → emerald tint. Mirrors the
// fixed-tint convention used by the Tests tab header so the two "add" actions
// read as distinct.
const ADD_BUTTON_CLASS =
  "h-9 md:h-10 px-3 md:px-4 rounded-md text-sm md:text-base font-medium border cursor-pointer transition-colors bg-indigo-500/12 border-indigo-500/45 text-indigo-950 dark:text-indigo-100 hover:bg-indigo-500/22 dark:hover:bg-indigo-500/18";
const CREATE_BUTTON_CLASS =
  "h-9 md:h-10 px-3 md:px-4 rounded-md text-sm md:text-base font-medium border cursor-pointer transition-colors bg-emerald-500/12 border-emerald-500/45 text-emerald-950 dark:text-emerald-100 hover:bg-emerald-500/22 dark:hover:bg-emerald-500/18";

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
  const [deleteMode, setDeleteMode] = useState<DeleteMode>("detach");
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

  // Attach a batch of library evaluators to the agent, then refresh the
  // attached list. Called by the Add dialog's onAdd.
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

  const openDetachDialog = (evaluator: EvaluatorData) => {
    setDeleteTarget(evaluator);
    setDeleteMode("detach");
    setDeleteDialogOpen(true);
  };

  const openDeleteDialog = (evaluator: EvaluatorData) => {
    setDeleteTarget(evaluator);
    setDeleteMode("delete");
    setDeleteDialogOpen(true);
  };

  const closeDeleteDialog = () => {
    if (isDeleting) return;
    setDeleteDialogOpen(false);
    setDeleteTarget(null);
    setDeleteMode("detach");
  };

  const handleConfirmDelete = async () => {
    if (!deleteTarget || !backendAccessToken) return;
    const { uuid } = deleteTarget;
    try {
      setIsDeleting(true);
      if (deleteMode === "delete") {
        await deleteEvaluator(uuid, backendAccessToken);
        setAttachedEvaluators((prev) => prev.filter((e) => e.uuid !== uuid));
        setAllEvaluators((prev) => prev.filter((e) => e.uuid !== uuid));
      } else {
        await detachEvaluatorFromAgent(agentUuid, uuid, backendAccessToken);
        setAttachedEvaluators((prev) => prev.filter((e) => e.uuid !== uuid));
      }
      setDeleteDialogOpen(false);
      setDeleteTarget(null);
      setDeleteMode("detach");
    } catch (err) {
      reportError(
        deleteMode === "delete"
          ? "Error deleting evaluator:"
          : "Error removing evaluator from agent:",
        err,
      );
    } finally {
      setIsDeleting(false);
    }
  };

  // Library minus already-attached — what the Add dialog can offer.
  const attachedUuids = new Set(attachedEvaluators.map((e) => e.uuid));
  const availableEvaluators = allEvaluators.filter(
    (e) => !attachedUuids.has(e.uuid),
  );

  const deleteDialogTitle =
    deleteMode === "delete"
      ? "Delete evaluator"
      : "Remove evaluator from agent";
  const deleteDialogMessage =
    deleteMode === "delete"
      ? `Are you sure you want to permanently delete "${deleteTarget?.name ?? ""}"? This action cannot be undone and affects every agent that uses it.`
      : `Remove "${deleteTarget?.name ?? ""}" from this agent? The evaluator itself is kept and stays available in your library.`;

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
              Choose the evaluators that matter for this agent
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
            Choose the evaluators that matter for this agent. Add an existing one
            from your library or create a new one.
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
            const isOwned = !!evaluator.owner_user_id;
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
                      onClick={() => openDetachDialog(evaluator)}
                      className="h-8 md:h-9 px-3 rounded-md text-xs md:text-sm font-medium border border-border bg-background hover:bg-muted/50 transition-colors cursor-pointer"
                      title="Remove from agent"
                    >
                      Remove
                    </button>
                    {isOwned && (
                      <button
                        onClick={() => openDeleteDialog(evaluator)}
                        className="w-8 h-8 md:w-9 md:h-9 flex items-center justify-center rounded-md text-muted-foreground hover:text-red-500 hover:bg-red-500/10 transition-colors cursor-pointer"
                        title="Delete evaluator permanently"
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
                            d="M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 01-2.244 2.077H8.084a2.25 2.25 0 01-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 00-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 013.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 00-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 00-7.5 0"
                          />
                        </svg>
                      </button>
                    )}
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
        confirmText={deleteMode === "delete" ? "Delete" : "Remove"}
        isDeleting={isDeleting}
      />
    </div>
  );
}
