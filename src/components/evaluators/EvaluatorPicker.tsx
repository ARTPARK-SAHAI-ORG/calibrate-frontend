"use client";

import React, { useState } from "react";
import {
  EvaluatorTypePill,
  OutputTypePill,
} from "@/components/EvaluatorPills";
import type { EvaluatorData } from "@/lib/evaluatorApi";
import { isDefaultEvaluator, isOwnedEvaluator } from "@/lib/evaluatorApi";

type EvaluatorPickerProps = {
  /** Already filtered by the caller (e.g. library minus already-attached). */
  evaluators: EvaluatorData[];
  selectedIds: Set<string>;
  onToggle: (uuid: string) => void;
  /** Shown when `evaluators` is empty. Override where the reason differs. */
  emptyMessage?: string;
};

/**
 * The searchable evaluator checkbox list, split into "My evaluators" and
 * "Default". Presentational: the caller owns the selection and the surrounding
 * dialog/panel chrome.
 */
export function EvaluatorPicker({
  evaluators,
  selectedIds,
  onToggle,
  emptyMessage = "No evaluators can judge a reply yet. Create one on the Evaluators page.",
}: EvaluatorPickerProps) {
  const [search, setSearch] = useState("");

  const q = search.trim().toLowerCase();
  const filteredEvaluators = evaluators.filter((ev) => {
    if (!q) return true;
    return (
      ev.name.toLowerCase().includes(q) ||
      (ev.description ?? "").toLowerCase().includes(q)
    );
  });
  const defaultEvaluators = filteredEvaluators.filter(isDefaultEvaluator);
  const customEvaluators = filteredEvaluators.filter(isOwnedEvaluator);
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
          onChange={() => onToggle(ev.uuid)}
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
          {q ? "No matching evaluators." : emptyMessage}
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

  return (
    <div className="space-y-3">
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
  );
}
