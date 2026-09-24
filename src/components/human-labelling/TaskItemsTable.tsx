"use client";

import React, { useRef, type ReactNode } from "react";
import { Tooltip } from "@/components/Tooltip";
import {
  EMPTY_SCORE_CELL,
  SCORE_TONE_CLASS,
  type ItemScoreCell,
  type ScoreLine,
} from "./itemScores";

/**
 * The item list on a labelling task's Items tab, for every task type. The
 * checkbox and name stay pinned on the left and the actions on the right,
 * while Labelled by, Updated at and one column per evaluator scroll sideways
 * between them. The page supplies what differs per task type through the
 * render props, and keeps all selection logic.
 */
export type TaskItemsTableProps<T extends { uuid: string }> = {
  items: readonly T[];
  /** One column each, in this order. */
  evaluators: readonly { uuid: string; name?: string | null }[];
  /** Item uuid -> evaluator uuid -> cell, from `buildItemScores`. */
  scores: Map<string, Map<string, ItemScoreCell>>;
  isSelected: (item: T) => boolean;
  allSelected: boolean;
  someSelected: boolean;
  onToggleAll: () => void;
  /** Plain click on a row's checkbox. */
  onToggleRow: (item: T) => void;
  /** Shift+click on a row or its checkbox. */
  onSelectRange: (item: T) => void;
  onOpen: (item: T) => void;
  sortDirection: "asc" | "desc" | null;
  onToggleSort: () => void;
  /** Used in the row checkbox's label, e.g. "Select item 12". */
  itemLabel: (item: T) => string | number;
  renderName: (item: T) => ReactNode;
  renderLabelledBy: (item: T) => ReactNode;
  renderUpdatedAt: (item: T) => ReactNode;
  renderActions: (item: T) => ReactNode;
};

const NAME_WIDTH = 360;
const LABELLED_BY_WIDTH = 200;
const UPDATED_AT_WIDTH = 180;
const EVALUATOR_WIDTH = 200;
const ACTIONS_WIDTH = 300;

const HEADING = "text-sm font-medium text-muted-foreground";
const CELL = "px-3 py-3 min-w-0";
const HEAD_CELL = "px-3 py-2 min-w-0";
// The pinned cells need a solid background so the scrolling columns never
// show through. The row's tint is layered on top as a flat gradient, so the
// pinned cells match the rest of the row in every state. They pin only on wide
// screens: below 1280px the name and buttons alone fill the table, leaving no
// room for the scores, so the whole row scrolls instead.
const PINNED = "xl:sticky z-10 bg-background flex items-center self-stretch";
const PINNED_LEFT = `${PINNED} xl:left-0 border-r border-border`;
const PINNED_RIGHT = `${PINNED} xl:right-0 border-l border-border justify-center`;

function SortIndicator({ direction }: { direction: "asc" | "desc" | null }) {
  return (
    <svg
      className={`w-3 h-3 transition-transform ${
        direction === "asc" ? "rotate-180" : ""
      } ${direction ? "text-foreground" : "text-muted-foreground/40"}`}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      aria-hidden="true"
    >
      <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
    </svg>
  );
}

function ScorePill({ line }: { line: ScoreLine }) {
  return (
    // A long score label can outrun the column, so the full text is on hover.
    <Tooltip content={line.text} position="top" className="w-fit max-w-full">
      <span
        className={`inline-block max-w-full truncate px-2 py-0.5 rounded text-xs font-medium ${
          SCORE_TONE_CLASS[line.tone]
        }`}
      >
        {line.text}
      </span>
    </Tooltip>
  );
}

export function TaskItemsTable<T extends { uuid: string }>({
  items,
  evaluators,
  scores,
  isSelected,
  allSelected,
  someSelected,
  onToggleAll,
  onToggleRow,
  onSelectRange,
  onOpen,
  sortDirection,
  onToggleSort,
  itemLabel,
  renderName,
  renderLabelledBy,
  renderUpdatedAt,
  renderActions,
}: TaskItemsTableProps<T>) {
  // A checkbox's change event does not say whether shift was held, so the
  // mousedown before it records that.
  const pendingShiftRef = useRef(false);

  // Tailwind only compiles class names it can read in the source, so the
  // column widths are an inline style. The name column takes any spare
  // width; past the minimum the table scrolls sideways.
  const gridTemplateColumns = `minmax(${NAME_WIDTH}px, 1fr) ${LABELLED_BY_WIDTH}px ${UPDATED_AT_WIDTH}px${
    evaluators.length ? ` repeat(${evaluators.length}, ${EVALUATOR_WIDTH}px)` : ""
  } ${ACTIONS_WIDTH}px`;
  const minWidth =
    NAME_WIDTH +
    LABELLED_BY_WIDTH +
    UPDATED_AT_WIDTH +
    evaluators.length * EVALUATOR_WIDTH +
    ACTIONS_WIDTH;
  const rowStyle = { gridTemplateColumns };

  return (
    <div className="border border-border rounded-xl overflow-x-auto">
      <div style={{ minWidth }}>
        <div
          style={rowStyle}
          className="grid border-b border-border bg-muted/30 items-center"
        >
          <div
            className={`${PINNED_LEFT} bg-linear-to-r from-muted/30 to-muted/30 gap-4 pl-4 pr-3 py-2`}
          >
            <input
              type="checkbox"
              checked={allSelected}
              ref={(el) => {
                if (el) el.indeterminate = someSelected;
              }}
              onChange={onToggleAll}
              aria-label="Select all"
              className="w-5 h-5 shrink-0 cursor-pointer accent-foreground"
            />
            <div className={HEADING}>Name</div>
          </div>
          <div className={`${HEAD_CELL} ${HEADING}`}>Labelled by</div>
          <div className={HEAD_CELL}>
            <button
              type="button"
              onClick={onToggleSort}
              className="flex items-center gap-1 text-sm font-medium text-muted-foreground hover:text-foreground transition-colors cursor-pointer text-left"
              aria-label="Sort by updated at"
            >
              <span>Updated at</span>
              <SortIndicator direction={sortDirection} />
            </button>
          </div>
          {evaluators.map((ev) => (
            <div key={ev.uuid} className={`${HEAD_CELL} ${HEADING} min-w-0`}>
              <Tooltip content={ev.name || "Evaluator"} position="top" className="min-w-0">
                <span className="block truncate">{ev.name || "Evaluator"}</span>
              </Tooltip>
            </div>
          ))}
          <div
            className={`${PINNED_RIGHT} bg-linear-to-r from-muted/30 to-muted/30 px-4 py-2 ${HEADING}`}
          >
            Actions
          </div>
        </div>
        {items.map((item) => {
          const selected = isSelected(item);
          const tint = selected
            ? "bg-linear-to-r from-muted/30 to-muted/30"
            : "group-hover:bg-linear-to-r group-hover:from-muted/20 group-hover:to-muted/20";
          const itemScores = scores.get(item.uuid);
          return (
            <div
              key={item.uuid}
              style={rowStyle}
              onMouseDown={(e) => {
                // Shift+click on text starts a browser text selection;
                // suppress it so selecting a range of rows stays clean.
                if (e.shiftKey) e.preventDefault();
              }}
              onClick={(e) => {
                if (e.shiftKey) {
                  e.preventDefault();
                  onSelectRange(item);
                  return;
                }
                onOpen(item);
              }}
              className={`group grid border-b border-border last:border-b-0 transition-colors items-center cursor-pointer ${
                selected ? "bg-muted/30" : "hover:bg-muted/20"
              }`}
            >
              <div className={`${PINNED_LEFT} ${tint} gap-4 pl-4 pr-3 py-3`}>
                <input
                  type="checkbox"
                  checked={selected}
                  onMouseDown={(e) => {
                    pendingShiftRef.current = e.shiftKey;
                  }}
                  onChange={() => {
                    if (pendingShiftRef.current) onSelectRange(item);
                    else onToggleRow(item);
                    pendingShiftRef.current = false;
                  }}
                  onClick={(e) => e.stopPropagation()}
                  aria-label={`Select item ${itemLabel(item)}`}
                  className="w-5 h-5 shrink-0 cursor-pointer accent-foreground"
                />
                <div className="min-w-0 flex-1">{renderName(item)}</div>
              </div>
              <div className={CELL}>{renderLabelledBy(item)}</div>
              <div className={CELL}>{renderUpdatedAt(item)}</div>
              {evaluators.map((ev) => {
                const cell = itemScores?.get(ev.uuid) ?? EMPTY_SCORE_CELL;
                return (
                  <div key={ev.uuid} className={`${CELL} flex flex-col gap-1`}>
                    <ScorePill line={cell.evaluator} />
                    <ScorePill line={cell.humans} />
                  </div>
                );
              })}
              <div className={`${PINNED_RIGHT} ${tint} px-4 py-3`}>
                {renderActions(item)}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
