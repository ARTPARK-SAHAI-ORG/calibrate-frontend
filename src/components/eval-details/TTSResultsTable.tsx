import React from "react";
import { Tooltip } from "@/components/Tooltip";

// Per-row results table for TTS. Two modes:
//
// 1) Legacy single-evaluator mode (default): the row is expected to carry the
//    flat `llm_judge_score` / `llm_judge_reasoning` fields. This is what the
//    older `/public/tts/[token]` payload looks like and what the table has
//    always rendered.
//
// 2) Dynamic multi-evaluator mode (`evaluatorColumns` prop provided): one
//    column per evaluator. For each evaluator the row is read at
//    `result[col.scoreField]` and `result[col.reasoningField]`. Callers
//    provide the field names directly because the CSV column convention
//    differs between API formats:
//      - new format (post-migration): `result[name]` for the score and
//        `result[`${name}_reasoning`]` for the reasoning;
//      - legacy `*_info` format: `result[`${prefix}_score`]` and
//        `result[`${prefix}_reasoning`]`;
//      - legacy single-evaluator format: `result.llm_judge_score` and
//        `result.llm_judge_reasoning`.
//    When `scoreField` / `reasoningField` are omitted on a column, the
//    component falls back to the historical templating from `key` so older
//    callers keep working.
//
// The row shape is intentionally open-ended (`[k: string]: unknown`) so callers
// in either mode can pass in whatever extra evaluator fields the backend
// included. Keeping both paths in one component lets the public TTS page —
// which still receives the legacy payload — share the same component as the
// authenticated detail page that has migrated to per-evaluator columns.
export type TTSResultRow = {
  id: string;
  text: string;
  audio_path: string;
  llm_judge_score?: string;
  llm_judge_reasoning?: string;
  // Dynamic per-evaluator fields. In the new format the score column is
  // named after the evaluator (e.g. `semantic_match`); in the legacy `_info`
  // format it's `${prefix}_score`.
  [k: string]: unknown;
};

export type TTSEvaluatorColumn = {
  /** Stable identity key. Used for React keys and as a fallback for `scoreField`/`reasoningField`. */
  key: string;
  /** Header text. The auth TTS page passes the evaluator's `name` (default or custom) and the public page falls back to `judgeLabel`. */
  label: string;
  /** Drives the cell renderer: binary → Pass/Fail badge, rating → numeric value with tooltip. */
  outputType: "binary" | "rating";
  /** Row data field for the score (defaults to `${key}_score` for legacy callers). */
  scoreField?: string;
  /** Row data field for the reasoning (defaults to `${key}_reasoning` for legacy callers). */
  reasoningField?: string;
};

type TTSResultsTableProps = {
  results: TTSResultRow[];
  showMetrics?: boolean;
  /** Header label for the legacy single-evaluator score column. Ignored when `evaluatorColumns` is provided. */
  judgeLabel?: string;
  /** When provided, replaces the single LLM-judge column with one column per entry. Each evaluator's score/reasoning is read from `result[col.scoreField ?? `${col.key}_score`]` and `result[col.reasoningField ?? `${col.key}_reasoning`]`. */
  evaluatorColumns?: TTSEvaluatorColumn[];
};

// Fixed pixel widths for the desktop layout. Evaluator columns are sized
// uniformly so the header / body line up and the table grows by a known
// amount per evaluator — when the sum exceeds the container, the wrapper
// scrolls horizontally instead of squishing each column into a sliver.
const TTS_COL_WIDTHS = {
  id: 48,
  text: 240,
  audio: 300,
  evaluator: 140,
} as const;

export function TTSResultsTable({ results, showMetrics = true, judgeLabel = "Evaluator", evaluatorColumns }: TTSResultsTableProps) {
  // When `evaluatorColumns` is provided, each evaluator gets its own column;
  // the legacy `llm_judge_*` rendering branch is skipped.
  const useDynamic = Array.isArray(evaluatorColumns) && evaluatorColumns.length > 0;

  // Compute the table's minimum pixel width from the column widths above so
  // the inner `overflow-x-auto` wrapper can scroll once we run out of room.
  // Without this the `table-fixed w-full` layout would shrink each column to
  // fit the container — which is what we explicitly don't want when there
  // are several evaluators.
  const evaluatorColCount = showMetrics ? (useDynamic ? evaluatorColumns!.length : 1) : 0;
  const tableMinWidth =
    TTS_COL_WIDTHS.id +
    TTS_COL_WIDTHS.text +
    TTS_COL_WIDTHS.audio +
    evaluatorColCount * TTS_COL_WIDTHS.evaluator;

  return (
    <>
      {/* Desktop: Table layout */}
      <div className="hidden md:block border rounded-xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full table-fixed" style={{ minWidth: `${tableMinWidth}px` }}>
            <thead className="bg-muted/50 border-b border-border">
              <tr>
                <th style={{ width: TTS_COL_WIDTHS.id }} className="px-4 py-3 text-left text-[12px] font-medium text-foreground">ID</th>
                <th style={{ width: TTS_COL_WIDTHS.text }} className="px-4 py-3 text-left text-[12px] font-medium text-foreground">Text</th>
                <th style={{ width: TTS_COL_WIDTHS.audio }} className="px-4 py-3 text-left text-[12px] font-medium text-foreground">Audio</th>
                {showMetrics && (
                  useDynamic
                    ? evaluatorColumns!.map((col) => (
                        <th key={col.key} style={{ width: TTS_COL_WIDTHS.evaluator }} className="px-4 py-3 text-left text-[12px] font-medium text-foreground">
                          {col.label}
                        </th>
                      ))
                    : (
                        <th style={{ width: TTS_COL_WIDTHS.evaluator }} className="px-4 py-3 text-left text-[12px] font-medium text-foreground">{judgeLabel}</th>
                      )
                )}
              </tr>
            </thead>
            <tbody>
              {results.map((result, index) => (
                <tr key={index} className="border-b border-border last:border-b-0">
                  <td className="px-4 py-3 text-[13px] text-foreground">{index + 1}</td>
                  <td className="px-4 py-3 text-[13px] text-foreground break-words">{result.text}</td>
                  <td className="px-4 py-3 text-[13px] text-foreground">
                    <audio controls className="w-full" src={result.audio_path}>
                      Your browser does not support the audio element.
                    </audio>
                  </td>
                  {showMetrics && (
                    useDynamic ? (
                      evaluatorColumns!.map((col) => (
                        <td key={col.key} className="px-4 py-3">
                          <EvaluatorScoreCell
                            score={asScoreString(result[col.scoreField ?? `${col.key}_score`])}
                            reasoning={asScoreString(result[col.reasoningField ?? `${col.key}_reasoning`])}
                            outputType={col.outputType}
                          />
                        </td>
                      ))
                    ) : (
                      <td className="px-4 py-3">
                        <LLMJudgeBadge score={result.llm_judge_score} reasoning={result.llm_judge_reasoning} />
                      </td>
                    )
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Mobile: Card layout */}
      <div className="md:hidden space-y-3">
        {results.map((result, index) => {
          // Header pill on mobile: in legacy mode shows the single LLM-judge
          // pass/fail; in dynamic mode it's omitted (each evaluator surfaces
          // its own pill / value below the metrics block instead).
          const legacyScoreStr = String(result.llm_judge_score || "").toLowerCase();
          const legacyPassed = legacyScoreStr === "true" || legacyScoreStr === "1";
          return (
            <div key={index} className="border border-border rounded-xl p-4 space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-[12px] text-muted-foreground font-medium">#{index + 1}</span>
                {showMetrics && !useDynamic && result.llm_judge_score && (
                  <span className={`inline-flex items-center px-2.5 py-1 rounded-md text-xs font-medium ${
                    legacyPassed
                      ? "bg-green-100 text-green-700 dark:bg-green-500/20 dark:text-green-400"
                      : "bg-red-100 text-red-700 dark:bg-red-500/20 dark:text-red-400"
                  }`}>
                    {legacyPassed ? "Pass" : "Fail"}
                  </span>
                )}
              </div>
              <div>
                <span className="text-[11px] text-muted-foreground uppercase tracking-wide">Text</span>
                <p className="text-[13px] text-foreground mt-0.5">{result.text}</p>
              </div>
              <div>
                <span className="text-[11px] text-muted-foreground uppercase tracking-wide">Audio</span>
                <audio controls className="w-full mt-1" src={result.audio_path}>
                  Your browser does not support the audio element.
                </audio>
              </div>
              {showMetrics && (
                useDynamic
                  ? evaluatorColumns!.map((col) => {
                      const score = asScoreString(result[col.scoreField ?? `${col.key}_score`]);
                      const reasoning = asScoreString(result[col.reasoningField ?? `${col.key}_reasoning`]);
                      if (!score && !reasoning) return null;
                      return (
                        <div key={col.key} className="pt-1 border-t border-border">
                          <div className="flex items-center gap-2">
                            <span className="text-[11px] text-muted-foreground uppercase tracking-wide">{col.label}</span>
                            <EvaluatorScoreCell score={score} reasoning={reasoning} outputType={col.outputType} hideTooltipButton />
                          </div>
                          {reasoning && (
                            <p className="text-[12px] text-muted-foreground mt-0.5">{reasoning}</p>
                          )}
                        </div>
                      );
                    })
                  : (result.llm_judge_reasoning && (
                      <div className="pt-1 border-t border-border">
                        <span className="text-[11px] text-muted-foreground uppercase tracking-wide">{judgeLabel} Reasoning</span>
                        <p className="text-[12px] text-muted-foreground mt-0.5">{result.llm_judge_reasoning}</p>
                      </div>
                    ))
              )}
            </div>
          );
        })}
      </div>
    </>
  );
}

// Coerces a row's evaluator field (which is typed as `unknown` because the row
// is open-ended) into a string we can render. Returns `undefined` for missing
// values so the cell renderer can show its empty state.
function asScoreString(value: unknown): string | undefined {
  if (value === null || value === undefined) return undefined;
  if (typeof value === "string") return value;
  return String(value);
}

function EvaluatorScoreCell({
  score,
  reasoning,
  outputType,
  hideTooltipButton = false,
}: {
  score?: string;
  reasoning?: string;
  outputType: "binary" | "rating";
  hideTooltipButton?: boolean;
}) {
  if (!score) return <span className="text-muted-foreground text-[12px]">-</span>;

  const tooltipContent = reasoning || `Score: ${score}`;

  // Binary evaluators render the same Pass/Fail pill the page has always used
  // for the LLM-judge column. Rating evaluators show the raw numeric value
  // (rounded to 4 dp when possible) — colorless, matching how rating values
  // are rendered on the STT page.
  let badge: React.ReactNode;
  if (outputType === "binary") {
    const scoreStr = score.toLowerCase();
    const passed = scoreStr === "true" || scoreStr === "1";
    badge = (
      <span className={`inline-flex items-center px-2.5 py-1 rounded-md text-xs font-medium ${
        passed
          ? "bg-green-100 text-green-700 dark:bg-green-500/20 dark:text-green-400"
          : "bg-red-100 text-red-700 dark:bg-red-500/20 dark:text-red-400"
      }`}>
        {passed ? "Pass" : "Fail"}
      </span>
    );
  } else {
    const numeric = Number(score);
    const display = Number.isFinite(numeric) ? parseFloat(numeric.toFixed(4)) : score;
    badge = <span className="text-[13px] text-foreground">{display}</span>;
  }

  if (hideTooltipButton) return badge;

  return (
    <div className="flex items-center gap-1.5">
      {badge}
      <Tooltip content={tooltipContent}>
        <button type="button" className="p-1 rounded-md hover:bg-muted transition-colors cursor-pointer" aria-label="View reasoning">
          <svg className="w-4 h-4 text-muted-foreground" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
        </button>
      </Tooltip>
    </div>
  );
}

function LLMJudgeBadge({ score, reasoning }: { score?: string; reasoning?: string }) {
  if (!score) return <span className="text-muted-foreground text-[12px]">-</span>;

  const scoreStr = String(score).toLowerCase();
  const passed = scoreStr === "true" || scoreStr === "1";
  const tooltipContent = reasoning || `Score: ${score}`;

  return (
    <div className="flex items-center gap-1.5">
      <span className={`inline-flex items-center px-2.5 py-1 rounded-md text-xs font-medium ${
        passed
          ? "bg-green-100 text-green-700 dark:bg-green-500/20 dark:text-green-400"
          : "bg-red-100 text-red-700 dark:bg-red-500/20 dark:text-red-400"
      }`}>
        {passed ? "Pass" : "Fail"}
      </span>
      <Tooltip content={tooltipContent}>
        <button type="button" className="p-1 rounded-md hover:bg-muted transition-colors cursor-pointer" aria-label="View reasoning">
          <svg className="w-4 h-4 text-muted-foreground" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
        </button>
      </Tooltip>
    </div>
  );
}
