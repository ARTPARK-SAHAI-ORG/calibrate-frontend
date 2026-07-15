"use client";

import { useState } from "react";
import { signOut } from "next-auth/react";
import { reportError } from "@/lib/reportError";
import { getBackendUrl, getDefaultHeaders } from "@/lib/api";
import {
  type EvaluatorData,
  getEvaluatorErrorMessage,
  isEvaluatorNameConflict,
} from "@/lib/evaluatorApi";
import { useHideFloatingButton } from "@/components/AppLayout";
import {
  isReservedEvaluatorName,
  reservedEvaluatorNameError,
} from "@/lib/evaluatorNames";

type DuplicateEvaluatorDialogProps = {
  originalEvaluator: EvaluatorData;
  existingEvaluators: EvaluatorData[];
  onClose: () => void;
  onDuplicated: (evaluator: EvaluatorData) => void;
  backendAccessToken?: string;
};

/**
 * Prompt for a name and POST /evaluators/{uuid}/duplicate. Shared by the
 * /evaluators page and the agent Evaluators tab.
 */
export function DuplicateEvaluatorDialog({
  originalEvaluator,
  existingEvaluators,
  onClose,
  onDuplicated,
  backendAccessToken,
}: DuplicateEvaluatorDialogProps) {
  // Hide the floating "Talk to Us" button when this dialog is rendered
  useHideFloatingButton(true);

  const [evaluatorName, setEvaluatorName] = useState(
    `Copy of ${originalEvaluator.name}`,
  );
  const [isDuplicating, setIsDuplicating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [nameError, setNameError] = useState<string | null>(null);
  const maxLength = 50;

  // Check if the name already exists
  const isNameDuplicate = (name: string): boolean => {
    const trimmedName = name.trim().toLowerCase();
    return existingEvaluators.some((e) => e.name.toLowerCase() === trimmedName);
  };

  const handleDuplicate = async () => {
    if (!evaluatorName.trim() || isNameDuplicate(evaluatorName)) return;
    if (isReservedEvaluatorName(evaluatorName)) {
      setNameError(reservedEvaluatorNameError(evaluatorName));
      return;
    }

    try {
      setIsDuplicating(true);
      setError(null);
      setNameError(null);

      // Call the duplicate endpoint
      const response = await fetch(
        `${getBackendUrl()}/evaluators/${originalEvaluator.uuid}/duplicate`,
        {
          method: "POST",
          headers: {
            ...getDefaultHeaders(backendAccessToken),
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            name: evaluatorName.trim(),
          }),
        },
      );

      if (response.status === 401) {
        await signOut({ callbackUrl: "/login" });
        return;
      }

      if (!response.ok) {
        const message = await getEvaluatorErrorMessage(
          response,
          "Failed to duplicate evaluator",
        );
        if (isEvaluatorNameConflict(response, message)) {
          setNameError(message);
          return;
        }
        throw new Error(message);
      }

      const data = await response.json();
      const newEvaluator: EvaluatorData = {
        uuid: data.uuid,
        name: evaluatorName.trim(),
        description: data.description || originalEvaluator.description,
        created_at: data.created_at || new Date().toISOString(),
        updated_at: data.updated_at || new Date().toISOString(),
        // A duplicate is always a new custom evaluator, never an org default.
        is_default: data.is_default ?? false,
        evaluator_type: data.evaluator_type ?? originalEvaluator.evaluator_type,
        output_type: data.output_type ?? originalEvaluator.output_type,
        data_type: data.data_type ?? originalEvaluator.data_type,
        kind: data.kind ?? originalEvaluator.kind,
      };

      onDuplicated(newEvaluator);
      onClose();
    } catch (err) {
      reportError("Error duplicating evaluator:", err);
      setError(
        err instanceof Error ? err.message : "Failed to duplicate evaluator",
      );
    } finally {
      setIsDuplicating(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="bg-background border border-border rounded-xl p-8 max-w-lg w-full mx-4 shadow-lg"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="mb-4 md:mb-6">
          <h2 className="text-xl md:text-2xl font-semibold tracking-tight mb-1">
            Duplicate evaluator
          </h2>
          <p className="text-muted-foreground text-sm md:text-[15px]">
            Choose a name for the duplicated evaluator
          </p>
        </div>

        {/* Evaluator Name Input */}
        <div className="mb-6">
          <label className="block text-[13px] font-medium text-foreground mb-2">
            Evaluator Name <span className="text-red-500">*</span>
          </label>
          <div className="relative">
            <input
              type="text"
              value={evaluatorName}
              onChange={(e) => {
                if (e.target.value.length <= maxLength) {
                  setEvaluatorName(e.target.value);
                  setError(null);
                  setNameError(null);
                }
              }}
              placeholder="Enter evaluator name"
              className={`w-full h-10 px-3 pr-16 rounded-md text-[13px] border bg-background dark:bg-muted text-foreground focus:outline-none focus:ring-2 focus:ring-accent focus:border-transparent ${
                (evaluatorName.trim() &&
                  (isNameDuplicate(evaluatorName) ||
                    isReservedEvaluatorName(evaluatorName))) ||
                nameError
                  ? "border-red-500"
                  : "border-border"
              }`}
              maxLength={maxLength}
            />
            <div className="absolute inset-y-0 right-0 flex items-center pr-3 pointer-events-none">
              <span className="text-[12px] text-muted-foreground">
                {evaluatorName.length}/{maxLength}
              </span>
            </div>
          </div>
          {evaluatorName.trim() && isNameDuplicate(evaluatorName) && (
            <p className="text-sm text-red-500 mt-1">
              An evaluator with this name already exists
            </p>
          )}
          {evaluatorName.trim() &&
            !isNameDuplicate(evaluatorName) &&
            isReservedEvaluatorName(evaluatorName) && (
              <p className="text-sm text-red-500 mt-1">
                {reservedEvaluatorNameError(evaluatorName)}
              </p>
            )}
          {nameError && <p className="text-sm text-red-500 mt-1">{nameError}</p>}
        </div>

        {/* Error Message */}
        {error && (
          <div className="mb-6 p-3 rounded-md bg-red-500/10 border border-red-500/20">
            <p className="text-[13px] text-red-500">{error}</p>
          </div>
        )}

        {/* Footer Buttons */}
        <div className="flex items-center justify-between">
          <button
            onClick={onClose}
            className="h-9 px-4 rounded-md text-[13px] font-medium bg-muted text-foreground hover:bg-muted/80 transition-colors cursor-pointer flex items-center gap-2"
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
                d="M15.75 19.5L8.25 12l7.5-7.5"
              />
            </svg>
            Cancel
          </button>
          <button
            onClick={handleDuplicate}
            disabled={
              !evaluatorName.trim() ||
              isDuplicating ||
              isNameDuplicate(evaluatorName) ||
              isReservedEvaluatorName(evaluatorName)
            }
            className="h-9 px-4 rounded-md text-[13px] font-medium bg-foreground text-background hover:opacity-90 transition-opacity cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
          >
            {isDuplicating ? (
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
                  ></circle>
                  <path
                    className="opacity-75"
                    fill="currentColor"
                    d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                  ></path>
                </svg>
                Duplicating...
              </>
            ) : (
              "Duplicate"
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
