"use client";

import React from "react";
import { Tooltip } from "@/components/Tooltip";

/**
 * Minimum shape of an evaluator column the cell renderer needs. STT and TTS
 * column types are structurally compatible with this; both extend it with
 * surface-specific extras (header label etc.).
 */
export type EvaluatorColumnLike = {
  key: string;
  evaluatorUuid?: string;
  scoreField?: string;
  reasoningField?: string;
};

/** Coerces a row's evaluator field into a string for rendering. */
function asScoreString(value: unknown): string | undefined {
  if (value === null || value === undefined) return undefined;
  if (typeof value === "string") return value;
  return String(value);
}

/**
 * Reads an evaluator's cell for one row. Prefers the canonical namespaced
 * shape (`result.evaluator_outputs[<evaluator_uuid>]`) introduced by the
 * STT/TTS API refresh, and falls back to the legacy flat keys
 * (`result[<scoreField>]` / `result[<reasoningField>]`) for older cached
 * responses. Surfaces the explicit per-row `error: true` flag so the cell
 * renderer can show a "couldn't grade" affordance instead of treating a
 * missing/null value as a Fail.
 */
export function readEvaluatorCell(
  row: Record<string, unknown>,
  col: EvaluatorColumnLike,
): { score: string | undefined; reasoning: string | undefined; error: boolean } {
  if (col.evaluatorUuid) {
    const outputs = row.evaluator_outputs;
    if (outputs && typeof outputs === "object" && !Array.isArray(outputs)) {
      const entry = (outputs as Record<string, unknown>)[col.evaluatorUuid];
      if (entry && typeof entry === "object" && !Array.isArray(entry)) {
        const e = entry as {
          value?: unknown;
          reasoning?: unknown;
          error?: unknown;
        };
        return {
          score: asScoreString(e.value),
          reasoning: asScoreString(e.reasoning),
          error: e.error === true,
        };
      }
    }
  }
  return {
    score: asScoreString(row[col.scoreField ?? `${col.key}_score`]),
    reasoning: asScoreString(row[col.reasoningField ?? `${col.key}_reasoning`]),
    error: false,
  };
}

/**
 * Shared cell renderer for per-row evaluator outputs, used by both
 * STTResultsTable and TTSResultsTable. Renders three visual states:
 * - `error` (amber pill + reasoning tooltip)
 * - binary score (Pass/Fail pill)
 * - rating score (numeric, optionally `score/scaleMax`)
 *
 * `hideTooltipButton` suppresses the secondary info button (used in the
 * mobile cards where the reasoning is rendered inline below the pill).
 */
export function EvaluatorScoreCell({
  score,
  reasoning,
  outputType,
  scaleMax,
  error = false,
  hideTooltipButton = false,
}: {
  score?: string;
  reasoning?: string;
  outputType: "binary" | "rating";
  scaleMax?: number | null;
  error?: boolean;
  hideTooltipButton?: boolean;
}) {
  if (error) {
    const tooltipContent = reasoning || "Evaluator could not grade this row.";
    const badge = (
      <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md text-xs font-medium bg-amber-100 text-amber-800 dark:bg-amber-500/20 dark:text-amber-300">
        <svg
          className="w-3.5 h-3.5"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          strokeWidth={2}
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M12 9v3.75m9-.75a9 9 0 11-18 0 9 9 0 0118 0zm-9 3.75h.008v.008H12v-.008z"
          />
        </svg>
        Error
      </span>
    );
    if (hideTooltipButton) return badge;
    return (
      <div className="flex items-center gap-1.5">
        {badge}
        <Tooltip content={tooltipContent}>
          <button
            type="button"
            className="p-1 rounded-md hover:bg-muted transition-colors cursor-pointer"
            aria-label="View error"
          >
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
                d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
              />
            </svg>
          </button>
        </Tooltip>
      </div>
    );
  }

  if (!score) {
    return <span className="text-muted-foreground text-[12px]">-</span>;
  }

  const tooltipContent = reasoning || `Score: ${score}`;

  let badge: React.ReactNode;
  if (outputType === "binary") {
    const scoreStr = score.toLowerCase();
    const passed = scoreStr === "true" || scoreStr === "1";
    badge = (
      <span
        className={`inline-flex items-center px-2.5 py-1 rounded-md text-xs font-medium ${
          passed
            ? "bg-green-100 text-green-700 dark:bg-green-500/20 dark:text-green-400"
            : "bg-red-100 text-red-700 dark:bg-red-500/20 dark:text-red-400"
        }`}
      >
        {passed ? "Pass" : "Fail"}
      </span>
    );
  } else {
    const numeric = Number(score);
    const rounded = Number.isFinite(numeric)
      ? parseFloat(numeric.toFixed(4))
      : null;
    const text =
      rounded == null
        ? score
        : typeof scaleMax === "number" && Number.isFinite(scaleMax)
          ? `${rounded}/${scaleMax}`
          : `${rounded}`;
    badge = <span className="text-[13px] text-foreground">{text}</span>;
  }

  if (hideTooltipButton) return badge;

  return (
    <div className="flex items-center gap-1.5">
      {badge}
      <Tooltip content={tooltipContent}>
        <button
          type="button"
          className="p-1 rounded-md hover:bg-muted transition-colors cursor-pointer"
          aria-label="View reasoning"
        >
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
              d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
            />
          </svg>
        </button>
      </Tooltip>
    </div>
  );
}
