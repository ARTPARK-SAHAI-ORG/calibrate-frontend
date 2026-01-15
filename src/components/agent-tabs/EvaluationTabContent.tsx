"use client";

import React, { useState } from "react";
import { DeleteConfirmationDialog } from "@/components/DeleteConfirmationDialog";

type EvaluationCriteriaData = {
  uuid: string;
  name: string;
  description: string;
  agent_id: string;
  created_at: string;
  updated_at: string;
};

type EvaluationTabContentProps = {
  agentUuid: string;
  evaluationCriteria: EvaluationCriteriaData[];
  setEvaluationCriteria: React.Dispatch<
    React.SetStateAction<EvaluationCriteriaData[]>
  >;
  evaluationCriteriaLoading: boolean;
  evaluationCriteriaError: string | null;
  saveRef: React.MutableRefObject<() => void>;
};

export type { EvaluationCriteriaData };

export function EvaluationTabContent({
  agentUuid,
  evaluationCriteria,
  setEvaluationCriteria,
  evaluationCriteriaLoading,
  evaluationCriteriaError,
  saveRef,
}: EvaluationTabContentProps) {
  // Evaluation criteria sidebar state
  const [addCriteriaSidebarOpen, setAddCriteriaSidebarOpen] = useState(false);
  const [editingCriteriaUuid, setEditingCriteriaUuid] = useState<string | null>(
    null
  );
  const [criteriaName, setCriteriaName] = useState("");
  const [criteriaInstructions, setCriteriaInstructions] = useState("");
  const [validationAttempted, setValidationAttempted] = useState(false);

  // Delete confirmation state
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [criteriaToDelete, setCriteriaToDelete] =
    useState<EvaluationCriteriaData | null>(null);

  // Open delete confirmation dialog
  const openDeleteDialog = (criteria: EvaluationCriteriaData) => {
    setCriteriaToDelete(criteria);
    setDeleteDialogOpen(true);
  };

  // Close delete confirmation dialog
  const closeDeleteDialog = () => {
    setDeleteDialogOpen(false);
    setCriteriaToDelete(null);
  };

  // Handle delete criteria
  const handleDeleteCriteria = () => {
    if (!criteriaToDelete) return;

    // Remove from local state
    setEvaluationCriteria((prev) =>
      prev.filter((c) => c.uuid !== criteriaToDelete.uuid)
    );

    // Save the updated agent config
    setTimeout(() => {
      saveRef.current();
    }, 0);
    closeDeleteDialog();
  };

  // Check if the name already exists (excluding current criteria being edited)
  const isNameDuplicate = (name: string): boolean => {
    const trimmedName = name.trim().toLowerCase();
    return evaluationCriteria.some(
      (c) =>
        c.name.toLowerCase() === trimmedName && c.uuid !== editingCriteriaUuid
    );
  };

  // Reset criteria form
  const resetCriteriaForm = () => {
    setEditingCriteriaUuid(null);
    setCriteriaName("");
    setCriteriaInstructions("");
    setValidationAttempted(false);
  };

  // Open a criteria for editing
  const openEditCriteria = (criteria: EvaluationCriteriaData) => {
    setEditingCriteriaUuid(criteria.uuid);
    setCriteriaName(criteria.name);
    setCriteriaInstructions(criteria.description);
    setValidationAttempted(false);
    setAddCriteriaSidebarOpen(true);
  };

  return (
    <>
      <div className="space-y-6">
        {/* Header with Add button */}
        {evaluationCriteria.length > 0 && (
          <div className="flex items-center justify-between">
            <button
              onClick={() => {
                resetCriteriaForm();
                setAddCriteriaSidebarOpen(true);
              }}
              className="h-10 px-4 rounded-md text-base font-medium bg-foreground text-background hover:opacity-90 transition-opacity cursor-pointer"
            >
              Add criteria
            </button>
          </div>
        )}

        {/* Loading State */}
        {evaluationCriteriaLoading ? (
          <div className="border border-border rounded-xl p-12 flex flex-col items-center justify-center bg-muted/20">
            <div className="flex items-center gap-3">
              <svg
                className="w-5 h-5 animate-spin"
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
                ></circle>
                <path
                  className="opacity-75"
                  fill="currentColor"
                  d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                ></path>
              </svg>
            </div>
          </div>
        ) : evaluationCriteriaError ? (
          /* Error State */
          <div className="border border-border rounded-xl p-12 flex flex-col items-center justify-center bg-muted/20">
            <p className="text-base text-red-500 mb-2">
              {evaluationCriteriaError}
            </p>
            <button
              onClick={() => window.location.reload()}
              className="text-base text-muted-foreground hover:text-foreground transition-colors cursor-pointer"
            >
              Retry
            </button>
          </div>
        ) : evaluationCriteria.length === 0 ? (
          /* Empty State */
          <div className="border border-border rounded-xl p-12 flex flex-col items-center justify-center bg-muted/20">
            <div className="w-14 h-14 rounded-xl bg-muted flex items-center justify-center mb-4">
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
                  d="M9 12.75L11.25 15 15 9.75M21 12c0 1.268-.63 2.39-1.593 3.068a3.745 3.745 0 01-1.043 3.296 3.745 3.745 0 01-3.296 1.043A3.745 3.745 0 0112 21c-1.268 0-2.39-.63-3.068-1.593a3.746 3.746 0 01-3.296-1.043 3.745 3.745 0 01-1.043-3.296A3.745 3.745 0 013 12c0-1.268.63-2.39 1.593-3.068a3.745 3.745 0 011.043-3.296 3.746 3.746 0 013.296-1.043A3.746 3.746 0 0112 3c1.268 0 2.39.63 3.068 1.593a3.746 3.746 0 013.296 1.043 3.746 3.746 0 011.043 3.296A3.745 3.745 0 0121 12z"
                />
              </svg>
            </div>
            <h3 className="text-lg font-semibold text-foreground mb-1">
              No evaluation criteria defined
            </h3>
            <p className="text-base text-muted-foreground mb-4 text-center max-w-2xl">
              Define criteria to evaluate whether conversations were successful
              or not
            </p>
            <button
              onClick={() => {
                resetCriteriaForm();
                setAddCriteriaSidebarOpen(true);
              }}
              className="h-10 px-4 rounded-md text-base font-medium border border-border bg-background hover:bg-muted/50 transition-colors cursor-pointer"
            >
              Add criteria
            </button>
          </div>
        ) : (
          /* Criteria List */
          <div className="border border-border rounded-xl overflow-hidden">
            {/* Table Header */}
            <div className="grid grid-cols-[1fr_2fr_auto] gap-4 px-4 py-2 border-b border-border bg-muted/30">
              <div className="text-sm font-medium text-muted-foreground">
                Name
              </div>
              <div className="text-sm font-medium text-muted-foreground">
                Description
              </div>
              <div className="w-8"></div>
            </div>
            {/* Table Body */}
            {evaluationCriteria.map((criteria) => (
              <div
                key={criteria.uuid}
                onClick={() => openEditCriteria(criteria)}
                className="grid grid-cols-[1fr_2fr_auto] gap-4 px-4 py-2 border-b border-border last:border-b-0 hover:bg-muted/20 transition-colors cursor-pointer"
              >
                {/* Name Column */}
                <div className="flex items-center">
                  <div className="text-sm font-medium text-foreground">
                    {criteria.name}
                  </div>
                </div>
                {/* Description Column */}
                <div className="flex items-center">
                  <p className="text-sm text-muted-foreground line-clamp-1">
                    {criteria.description || "—"}
                  </p>
                </div>
                {/* Delete Button */}
                <div className="flex items-center">
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      openDeleteDialog(criteria);
                    }}
                    className="w-8 h-8 flex items-center justify-center rounded-md text-muted-foreground hover:text-red-500 hover:bg-red-500/10 transition-colors cursor-pointer"
                    title="Delete criteria"
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
                        d="M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 01-2.244 2.077H8.084a2.25 2.25 0 01-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 00-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 013.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 00-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 00-7.5 0"
                      />
                    </svg>
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Add Evaluation Criteria Sidebar */}
      {addCriteriaSidebarOpen && (
        <div className="fixed inset-0 z-50 flex justify-end">
          {/* Backdrop */}
          <div
            className="absolute inset-0 bg-black/50"
            onClick={() => {
              resetCriteriaForm();
              setAddCriteriaSidebarOpen(false);
            }}
          />
          {/* Sidebar */}
          <div className="relative w-full max-w-xl bg-background border-l border-border flex flex-col h-full shadow-2xl">
            {/* Header */}
            <div className="flex items-center justify-between px-6 py-4 border-b border-border">
              <div className="flex items-center gap-3">
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
                    d="M9 12.75L11.25 15 15 9.75m-3-7.036A11.959 11.959 0 013.598 6 11.99 11.99 0 003 9.749c0 5.592 3.824 10.29 9 11.623 5.176-1.332 9-6.03 9-11.622 0-1.31-.21-2.571-.598-3.751h-.152c-3.196 0-6.1-1.248-8.25-3.285z"
                  />
                </svg>
                <h2 className="text-lg font-semibold">
                  {editingCriteriaUuid
                    ? "Edit evaluation criteria"
                    : "Add evaluation criteria"}
                </h2>
              </div>
              <button
                onClick={() => {
                  resetCriteriaForm();
                  setAddCriteriaSidebarOpen(false);
                }}
                className="flex items-center justify-center w-8 h-8 rounded-full border border-border hover:bg-muted transition-colors cursor-pointer"
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

            {/* Content */}
            <div className="flex-1 overflow-y-auto p-6 flex flex-col gap-6">
              {/* Criteria name */}
              <div>
                <label className="block text-sm font-medium mb-2">
                  Criteria name <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  value={criteriaName}
                  placeholder="Enter the name of the criteria"
                  onChange={(e) => setCriteriaName(e.target.value)}
                  className={`w-full h-10 px-4 rounded-md text-base border bg-background text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-accent focus:border-transparent ${
                    validationAttempted &&
                    (!criteriaName.trim() || isNameDuplicate(criteriaName))
                      ? "border-red-500"
                      : "border-border"
                  }`}
                />
                {validationAttempted && isNameDuplicate(criteriaName) && (
                  <p className="text-sm text-red-500 mt-1">
                    A criteria with this name already exists
                  </p>
                )}
              </div>

              {/* Evaluation instructions */}
              <div className="flex-1 flex flex-col min-h-0">
                <label className="block text-sm font-medium mb-1">
                  Evaluation instructions
                </label>
                <textarea
                  value={criteriaInstructions}
                  onChange={(e) => setCriteriaInstructions(e.target.value)}
                  placeholder="Describe how the agent should evaluate whether the
                  conversation was a success"
                  className="flex-1 w-full px-4 py-3 rounded-md text-base border border-border bg-background text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-accent focus:border-transparent resize-none"
                />
              </div>
            </div>

            {/* Footer */}
            <div className="px-6 py-4 border-t border-border space-y-3">
              <div className="flex items-center justify-end gap-3">
                <button
                  onClick={() => {
                    resetCriteriaForm();
                    setAddCriteriaSidebarOpen(false);
                  }}
                  className="h-10 px-4 rounded-md text-base font-medium border border-border bg-background hover:bg-muted/50 transition-colors cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  onClick={() => {
                    setValidationAttempted(true);
                    if (!criteriaName.trim() || isNameDuplicate(criteriaName))
                      return;

                    if (editingCriteriaUuid) {
                      // Update existing criteria
                      setEvaluationCriteria((prev) =>
                        prev.map((c) =>
                          c.uuid === editingCriteriaUuid
                            ? {
                                ...c,
                                name: criteriaName.trim(),
                                description: criteriaInstructions.trim(),
                                updated_at: new Date().toISOString(),
                              }
                            : c
                        )
                      );
                    } else {
                      // Create a new criteria object with generated UUID
                      const newCriteria: EvaluationCriteriaData = {
                        uuid: crypto.randomUUID(),
                        name: criteriaName.trim(),
                        description: criteriaInstructions.trim(),
                        agent_id: agentUuid,
                        created_at: new Date().toISOString(),
                        updated_at: new Date().toISOString(),
                      };

                      // Add the new criteria to the list
                      setEvaluationCriteria((prev) => [...prev, newCriteria]);
                    }

                    // Reset and close
                    resetCriteriaForm();
                    setAddCriteriaSidebarOpen(false);

                    // Save the updated agent config
                    setTimeout(() => {
                      saveRef.current();
                    }, 0);
                  }}
                  className="h-10 px-4 rounded-md text-base font-medium bg-foreground text-background hover:opacity-90 transition-opacity cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
                >
                  {editingCriteriaUuid ? "Save" : "Add criteria"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Delete Confirmation Dialog */}
      <DeleteConfirmationDialog
        isOpen={deleteDialogOpen}
        onClose={closeDeleteDialog}
        onConfirm={handleDeleteCriteria}
        title="Delete criteria"
        message={`Are you sure you want to delete "${criteriaToDelete?.name}"?`}
        confirmText="Delete"
      />
    </>
  );
}
