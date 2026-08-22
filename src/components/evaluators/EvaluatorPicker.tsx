"use client";

import React, { useState } from "react";
import { EvaluatorPromptPreview } from "./EvaluatorPromptPreview";
import type { EvaluatorData } from "@/lib/evaluatorApi";
import { isDefaultEvaluator, isOwnedEvaluator } from "@/lib/evaluatorApi";

type EvaluatorPickerProps = {
  /** Already filtered by the caller (e.g. library minus already-attached). */
  evaluators: EvaluatorData[];
  selectedIds: Set<string>;
  onToggle: (uuid: string) => void;
  /** Shown when `evaluators` is empty. Override where the reason differs. */
  emptyMessage?: string;
  /**
   * Offered under `emptyMessage` when there is nothing left to pick, so the
   * reader can make one instead of leaving empty-handed.
   */
  emptyAction?: React.ReactNode;
  /**
   * Show full-conversation evaluators, which are hidden everywhere else. Set
   * where they are the only kind that works, such as simulation setup.
   */
  allowConversationType?: boolean;
  /**
   * Stretch both columns to the height the parent gives them, instead of the
   * built-in one. For a dialog that holds nothing but this picker, so the
   * prompt reaches the footer instead of stopping short. The parent must be a
   * flex child with a real height (`flex-1 min-h-0`).
   */
  fillHeight?: boolean;
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
  emptyAction,
  fillHeight = false,
  allowConversationType = false,
}: EvaluatorPickerProps) {
  const [search, setSearch] = useState("");
  // The evaluator whose prompt is on show. Null until one is clicked.
  const [previewUuid, setPreviewUuid] = useState<string | null>(null);

  const q = search.trim().toLowerCase();
  // Everything this picker could offer, before the reader's own search.
  const offerable = evaluators.filter(
    // Full-conversation evaluators are hidden unless the caller is a place
    // where they are the only kind that works, such as simulation setup.
    (ev) => allowConversationType || ev.evaluator_type !== "conversation",
  );
  const filteredEvaluators = offerable.filter((ev) => {
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
      <div
        key={ev.uuid}
        className={`flex items-start gap-3 px-3 py-2.5 transition-colors ${
          previewUuid === ev.uuid
            ? "bg-muted/60 border-l-2 border-foreground/40 pl-[calc(0.75rem-2px)]"
            : "hover:bg-muted/30"
        }`}
      >
        <input
          type="checkbox"
          aria-label={`Select ${ev.name}`}
          checked={checked}
          onChange={() => onToggle(ev.uuid)}
          className="mt-0.5 w-4 h-4 cursor-pointer accent-foreground"
        />
        {/* The body opens the prompt on the right rather than ticking the box,
            so an evaluator can be read before it is added. */}
        <button
          type="button"
          onClick={() => setPreviewUuid(ev.uuid)}
          className="min-w-0 flex-1 text-left cursor-pointer focus:outline-none focus-visible:ring-1 focus-visible:ring-border rounded-sm"
        >
          {/* Name only: what it judges and how it scores are in the prompt
              on the right. */}
          <span className="text-sm font-medium text-foreground">{ev.name}</span>
          {ev.description && (
            <div className="text-xs text-muted-foreground line-clamp-2 mt-0.5">
              {ev.description}
            </div>
          )}
        </button>
      </div>
    );
  };

  const renderEvaluatorList = () => {
    if (filteredEvaluators.length === 0) {
      return (
        <div className="p-6 text-sm text-muted-foreground text-center">
          No matching evaluators.
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

  if (offerable.length === 0) {
    return (
      <div
        className={`flex flex-col items-center justify-center text-center gap-4 p-8 ${
          fillHeight ? "md:h-full md:min-h-0" : "min-h-[12rem]"
        }`}
      >
        <p className="text-sm md:text-base text-muted-foreground max-w-md text-balance">
          {emptyMessage}
        </p>
        {emptyAction}
      </div>
    );
  }

  return (
    <div
      className={`flex flex-col md:flex-row gap-3 md:gap-4 ${
        fillHeight ? "md:h-full md:min-h-0" : ""
      }`}
    >
      <div
        className={`space-y-3 md:flex-1 md:min-w-0 ${
          fillHeight ? "md:flex md:flex-col md:min-h-0" : ""
        }`}
      >
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
        <div
          className={`border border-border rounded-md overflow-y-auto divide-y divide-border ${
            fillHeight
              ? "max-h-96 md:max-h-none md:flex-1 md:min-h-0"
              : "md:h-[32rem] max-h-[60vh]"
          }`}
        >
          {renderEvaluatorList()}
        </div>
      </div>

      {/* How the picked evaluator judges. Below the list on a phone, where two
          columns will not fit. */}
      <div
        className={`md:flex-1 md:min-w-0 border border-border rounded-md overflow-hidden ${
          fillHeight
            ? "max-h-[60vh] md:max-h-none md:h-full md:min-h-0"
            : "md:h-[35.25rem] max-h-[60vh]"
        }`}
      >
        <EvaluatorPromptPreview evaluatorUuid={previewUuid} />
      </div>
    </div>
  );
}
