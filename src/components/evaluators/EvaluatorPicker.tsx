"use client";

import React, { useEffect, useState } from "react";
import { EvaluatorPromptPreview } from "./EvaluatorPromptPreview";
import { PickerRow } from "@/components/ui/PickerRow";
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
   * Show this evaluator's prompt on the right, as if its row had been clicked.
   * Set it after creating one, so the reader sees what they just made.
   */
  previewUuid?: string | null;
  /**
   * Stretch both columns to the height the parent gives them, instead of the
   * built-in one. For a dialog that holds nothing but this picker, so the
   * prompt reaches the footer instead of stopping short. The parent must be a
   * flex child with a real height (`flex-1 min-h-0`).
   */
  fillHeight?: boolean;
  /** Permanently deletes the previewed evaluator. Omit to hide the button. */
  onDeleteEvaluator?: (evaluatorUuid: string) => void;
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
  previewUuid: previewUuidProp,
  fillHeight = false,
  allowConversationType = false,
  onDeleteEvaluator,
}: EvaluatorPickerProps) {
  const [search, setSearch] = useState("");
  // Everything this picker could offer, before the reader's own search.
  const offerable = evaluators.filter(
    // Full-conversation evaluators are hidden unless the caller is a place
    // where they are the only kind that works, such as simulation setup.
    (ev) => allowConversationType || ev.evaluator_type !== "conversation",
  );
  // The evaluator whose prompt is on show. Defaults to the first one that is
  // already selected (so opening the picker shows what it will actually add),
  // falling back to the first evaluator in the list when nothing is selected
  // yet. Only the initial value — from then on, the reader's own clicks (or
  // the parent naming one below) drive it.
  const [previewUuid, setPreviewUuid] = useState<string | null>(() => {
    const firstSelected = offerable.find((ev) => selectedIds.has(ev.uuid));
    return firstSelected?.uuid ?? offerable[0]?.uuid ?? null;
  });
  // A parent that names an evaluator (one just created) opens it on the right.
  // Clicking another row afterwards still wins, until the parent names a new one.
  useEffect(() => {
    if (previewUuidProp) setPreviewUuid(previewUuidProp);
  }, [previewUuidProp]);

  const q = search.trim().toLowerCase();
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

  const renderEvaluatorRow = (ev: EvaluatorData) => (
    // Name only: what it judges and how it scores are in the prompt on the
    // right, so no badge here.
    <PickerRow
      key={ev.uuid}
      ariaLabel={`Select ${ev.name}`}
      checked={selectedIds.has(ev.uuid)}
      onToggle={() => onToggle(ev.uuid)}
      isPreviewed={previewUuid === ev.uuid}
      onPreview={() => setPreviewUuid(ev.uuid)}
      name={ev.name}
      description={ev.description}
    />
  );

  const renderSectionLabel = (label: string) => (
    <div
      key={label}
      className="px-3 pt-3 pb-1 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground"
    >
      {label}
    </div>
  );

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

    // Flat, not one wrapper per section: the list draws its dividing lines
    // between its own children, so a wrapper would swallow every line between
    // the rows inside it and this list would stop matching the tool picker.
    return (
      <>
        {renderSectionLabel("My evaluators")}
        {customEvaluators.map(renderEvaluatorRow)}
        {renderSectionLabel("Default")}
        {defaultEvaluators.map(renderEvaluatorRow)}
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
        <EvaluatorPromptPreview
          evaluatorUuid={previewUuid}
          onDelete={onDeleteEvaluator}
        />
      </div>
    </div>
  );
}
