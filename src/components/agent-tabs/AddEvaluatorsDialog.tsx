"use client";

import React, { useState, useEffect } from "react";
import { useHideFloatingButton } from "@/components/AppLayout";
import {
  EvaluatorTypePill,
  OutputTypePill,
} from "@/components/EvaluatorPills";
import type { EvaluatorData } from "@/lib/evaluatorApi";
import { isOwnedEvaluator } from "@/lib/evaluatorApi";

type AddEvaluatorsDialogProps = {
  isOpen: boolean;
  /** Library minus already-attached (parent filters, but we stay defensive). */
  availableEvaluators: EvaluatorData[];
  onClose: () => void;
  /** Parent does the attaching + refresh; we just hand back the picked uuids. */
  onAdd: (selectedUuids: string[]) => Promise<void> | void;
};

export function AddEvaluatorsDialog({
  isOpen,
  availableEvaluators,
  onClose,
  onAdd,
}: AddEvaluatorsDialogProps) {
  // Hide the floating "Talk to Us" button while the modal is open.
  useHideFloatingButton(isOpen);

  const [search, setSearch] = useState("");
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Reset transient state each time the dialog opens so a re-open starts fresh.
  useEffect(() => {
    if (isOpen) {
      setSearch("");
      setSelectedIds(new Set());
      setSaving(false);
      setError(null);
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const q = search.trim().toLowerCase();
  const filteredEvaluators = availableEvaluators.filter((ev) => {
    if (!q) return true;
    return (
      ev.name.toLowerCase().includes(q) ||
      (ev.description ?? "").toLowerCase().includes(q)
    );
  });
  const defaultEvaluators = filteredEvaluators.filter(
    (ev) => !isOwnedEvaluator(ev),
  );
  const customEvaluators = filteredEvaluators.filter((ev) =>
    isOwnedEvaluator(ev),
  );
  const showSections =
    defaultEvaluators.length > 0 && customEvaluators.length > 0;

  const renderEvaluatorRow = (ev: EvaluatorData) => {
    const checked = selectedIds.has(ev.uuid);
    return (
      <label
        key={ev.uuid}
        className="flex items-start gap-3 px-3 py-2.5 hover:bg-muted/30 transition-colors cursor-pointer"
      >
        <input
          type="checkbox"
          checked={checked}
          onChange={() => toggle(ev.uuid)}
          className="mt-0.5 w-4 h-4 cursor-pointer accent-foreground"
        />
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-sm font-medium text-foreground">
              {ev.name}
            </span>
            {ev.evaluator_type && (
              <EvaluatorTypePill evaluatorType={ev.evaluator_type} />
            )}
            {ev.output_type && (
              <OutputTypePill outputType={ev.output_type} />
            )}
          </div>
          {ev.description && (
            <div className="text-xs text-muted-foreground line-clamp-2 mt-0.5">
              {ev.description}
            </div>
          )}
        </div>
      </label>
    );
  };

  const renderEvaluatorList = () => {
    if (filteredEvaluators.length === 0) {
      return (
        <div className="p-4 text-sm text-muted-foreground">
          {q
            ? "No matching evaluators."
            : availableEvaluators.length === 0
              ? "All evaluators are already added"
              : "No evaluators yet."}
        </div>
      );
    }

    if (!showSections) {
      return filteredEvaluators.map(renderEvaluatorRow);
    }

    return (
      <>
        <div>
          <div className="px-3 pt-3 pb-1 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
            My evaluators
          </div>
          {customEvaluators.map(renderEvaluatorRow)}
        </div>
        <div>
          <div className="px-3 pt-3 pb-1 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
            Default
          </div>
          {defaultEvaluators.map(renderEvaluatorRow)}
        </div>
      </>
    );
  };

  const toggle = (uuid: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(uuid)) {
        next.delete(uuid);
      } else {
        next.add(uuid);
      }
      return next;
    });
  };

  const handleClose = () => {
    if (!saving) onClose();
  };

  const handleAdd = async () => {
    if (selectedIds.size === 0 || saving) return;
    try {
      setSaving(true);
      setError(null);
      await onAdd(Array.from(selectedIds));
      onClose();
    } catch (err) {
      // Keep the dialog open and surface the failure instead of closing as if
      // the add succeeded.
      setError(
        err instanceof Error ? err.message : "Failed to add evaluators",
      );
    } finally {
      setSaving(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4"
      onClick={handleClose}
    >
      <div
        data-tour="add-evaluators-dialog"
        className="bg-background border border-border rounded-xl w-full max-w-2xl shadow-2xl flex flex-col max-h-[90vh]"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-start justify-between gap-3 px-5 md:px-6 py-4 border-b border-border">
          <div>
            <h2 className="text-base md:text-lg font-semibold text-foreground">
              Add evaluators
            </h2>
            <p className="text-xs md:text-sm text-muted-foreground mt-1">
              Choose evaluators from your library to add to this agent
            </p>
          </div>
          <button
            onClick={handleClose}
            disabled={saving}
            className="flex items-center justify-center w-8 h-8 rounded-md hover:bg-muted transition-colors cursor-pointer flex-shrink-0 disabled:opacity-50 disabled:cursor-not-allowed"
            aria-label="Close"
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

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-4 md:p-6 space-y-3">
          {/* Search */}
          <div className="relative">
            <div className="absolute inset-y-0 left-0 flex items-center pl-3 pointer-events-none">
              <svg
                className="w-4 h-4 text-muted-foreground"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth={2}
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z"
                />
              </svg>
            </div>
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search evaluators"
              className="w-full h-9 pl-9 pr-3 rounded-md text-sm border border-border bg-background text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-accent"
            />
          </div>

          {/* Checkbox list */}
          <div className="border border-border rounded-md max-h-96 overflow-y-auto divide-y divide-border">
            {renderEvaluatorList()}
          </div>
        </div>

        {/* Footer */}
        <div className="flex flex-col gap-2 px-5 md:px-6 py-4 border-t border-border">
          {error && (
            <p
              role="alert"
              className="text-sm text-red-600 dark:text-red-400 text-right"
            >
              {error}
            </p>
          )}
          <div className="flex items-center justify-end gap-2 md:gap-3">
          <button
            onClick={handleClose}
            disabled={saving}
            className="h-9 md:h-10 px-4 rounded-md text-sm md:text-base font-medium border border-border bg-background dark:bg-muted hover:bg-muted/50 dark:hover:bg-accent transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
          >
            Cancel
          </button>
          <button
            data-tour="evaluators-add-confirm"
            onClick={handleAdd}
            disabled={selectedIds.size === 0 || saving}
            className="h-9 md:h-10 px-4 rounded-md text-sm md:text-base font-medium bg-foreground text-background hover:opacity-90 transition-opacity cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
          >
            {saving && (
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
            {saving
              ? "Adding..."
              : `Add${selectedIds.size > 0 ? ` (${selectedIds.size})` : ""}`}
          </button>
          </div>
        </div>
      </div>
    </div>
  );
}
