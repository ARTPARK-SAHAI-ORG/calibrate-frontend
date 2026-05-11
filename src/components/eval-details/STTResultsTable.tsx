import React from "react";
import { Tooltip } from "@/components/Tooltip";

// Per-row results table for STT. Two modes:
//
// 1) Legacy single-evaluator mode (default): the row is expected to carry the
//    flat `llm_judge_score` / `llm_judge_reasoning` / `string_similarity`
//    fields. This is what the older `/public/stt/[token]` payload looks like
//    and what the table has always rendered.
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
// included. Keeping both paths in one component lets the public STT page —
// which still receives the legacy payload — share the same component as the
// authenticated detail page that has migrated to per-evaluator columns.
export type STTResultRow = {
  id: string;
  audio_url?: string;
  gt: string;
  pred: string;
  wer: string;
  string_similarity?: string;
  llm_judge_score?: string;
  llm_judge_reasoning?: string;
  // Dynamic per-evaluator fields. In the new format the score column is
  // named after the evaluator (e.g. `semantic_match`); in the legacy `_info`
  // format it's `${prefix}_score`.
  [k: string]: unknown;
};

export type STTEvaluatorColumn = {
  /** Stable identity key. Used for React keys and as a fallback for `scoreField`/`reasoningField`. */
  key: string;
  /** Header text. The auth STT page passes the evaluator's `name` (default or custom) and the public page falls back to `judgeLabel`. */
  label: string;
  /** Drives the cell renderer: binary → Pass/Fail badge, rating → numeric value with tooltip. */
  outputType: "binary" | "rating";
  /** Stable evaluator UUID. When present, the cell renderer reads
   * `result.evaluator_outputs[uuid]` (canonical, properly typed, surfaces
   * per-row `error: true`) and falls back to the flat `scoreField` /
   * `reasoningField` only if that lookup misses. */
  evaluatorUuid?: string;
  /** Row data field for the score (defaults to `${key}_score` for legacy callers). */
  scoreField?: string;
  /** Row data field for the reasoning (defaults to `${key}_reasoning` for legacy callers). */
  reasoningField?: string;
  /** Optional bounds for rating evaluators — drives the "score/max" cell
   * format and the leaderboard chart's y-axis domain. */
  scaleMin?: number | null;
  scaleMax?: number | null;
};

type STTResultsTableProps = {
  results: STTResultRow[];
  showMetrics?: boolean;
  /** Show the String Similarity column / mobile field. Defaults to `true` so existing callers (e.g. the public STT page) keep their column. The authenticated `/stt/[uuid]` page passes `false` to hide it. */
  showSimilarity?: boolean;
  /** Header label for the legacy single-evaluator score column. Ignored when `evaluatorColumns` is provided. */
  judgeLabel?: string;
  /** When provided, replaces the single LLM-judge column with one column per entry. Each evaluator's score/reasoning is read from `result[col.scoreField ?? `${col.key}_score`]` and `result[col.reasoningField ?? `${col.key}_reasoning`]`. */
  evaluatorColumns?: STTEvaluatorColumn[];
  tableRef?: React.RefObject<HTMLDivElement | null>;
};

// Fixed pixel widths for the desktop layout. Text columns get a stable
// width so they don't get squeezed every time another evaluator is added,
// and evaluator columns are sized uniformly so the header / body line up
// and the table grows by a known amount per evaluator — when the sum
// exceeds the container the wrapper scrolls horizontally.
const STT_COL_WIDTHS = {
  id: 40,
  audio: 180,
  text: 280,
  wer: 80,
  similarity: 110,
  evaluator: 130,
  llmJudge: 110,
} as const;

export function STTResultsTable({ results, showMetrics = true, showSimilarity = true, judgeLabel = "Evaluator", evaluatorColumns, tableRef }: STTResultsTableProps) {
  const hasAudio = results.some((r) => !!r.audio_url);
  // When `evaluatorColumns` is provided, each evaluator gets its own column;
  // the legacy `llm_judge_*` rendering branch is skipped.
  const useDynamic = Array.isArray(evaluatorColumns) && evaluatorColumns.length > 0;

  // Compute the table's minimum pixel width from the column widths above so
  // the inner `overflow-x-auto` wrapper can scroll once we run out of room.
  // Without this the `table-fixed w-full` layout would shrink each column to
  // fit the container — which is what we explicitly don't want when there
  // are several evaluators.
  const tableMinWidth = (() => {
    let total = STT_COL_WIDTHS.id + STT_COL_WIDTHS.text * 2; // ID + GT + Pred
    if (hasAudio) total += STT_COL_WIDTHS.audio;
    if (showMetrics) {
      total += STT_COL_WIDTHS.wer;
      if (showSimilarity) total += STT_COL_WIDTHS.similarity;
      if (useDynamic) total += evaluatorColumns!.length * STT_COL_WIDTHS.evaluator;
      else total += STT_COL_WIDTHS.llmJudge;
    }
    return total;
  })();

  return (
    <>
      {/* Desktop: Table layout */}
      <div className="hidden md:block border rounded-xl overflow-hidden" ref={tableRef}>
        <div className="overflow-x-auto">
          <table className="w-full table-fixed" style={{ minWidth: `${tableMinWidth}px` }}>
            <thead className="bg-muted/50 border-b border-border">
              <tr>
                <th style={{ width: STT_COL_WIDTHS.id }} className="px-3 py-3 text-left text-[12px] font-medium text-foreground">ID</th>
                {hasAudio && (
                  <th style={{ width: STT_COL_WIDTHS.audio }} className="px-3 py-3 text-left text-[12px] font-medium text-foreground">Audio</th>
                )}
                <th style={{ width: STT_COL_WIDTHS.text }} className="px-3 py-3 text-left text-[12px] font-medium text-foreground">Ground Truth</th>
                <th style={{ width: STT_COL_WIDTHS.text }} className="px-3 py-3 text-left text-[12px] font-medium text-foreground">Prediction</th>
                {showMetrics && (
                  <>
                    <th style={{ width: STT_COL_WIDTHS.wer }} className="px-3 py-3 text-left text-[12px] font-medium text-foreground">WER</th>
                    {showSimilarity && (
                      <th style={{ width: STT_COL_WIDTHS.similarity }} className="px-3 py-3 text-left text-[12px] font-medium text-foreground">Similarity</th>
                    )}
                    {useDynamic
                      ? evaluatorColumns!.map((col) => (
                          <th key={col.key} style={{ width: STT_COL_WIDTHS.evaluator }} className="px-3 py-3 text-left text-[12px] font-medium text-foreground">
                            {col.label}
                          </th>
                        ))
                      : (
                          <th style={{ width: STT_COL_WIDTHS.llmJudge }} className="px-3 py-3 text-left text-[12px] font-medium text-foreground">{judgeLabel}</th>
                        )}
                  </>
                )}
              </tr>
            </thead>
            <tbody>
              {results.map((result, index) => {
                const isEmptyPrediction = !result.pred || result.pred.trim() === "";
                return (
                  <tr
                    key={index}
                    data-row-index={index}
                    className={`border-b border-border last:border-b-0 ${isEmptyPrediction ? "bg-red-500/10" : ""}`}
                  >
                    <td className="px-3 py-3 text-[13px] text-foreground">{index + 1}</td>
                    {hasAudio && (
                      <td className="px-3 py-3">
                        {result.audio_url ? (
                          <audio src={result.audio_url} controls preload="none" className="h-8 w-full max-w-[160px]" />
                        ) : (
                          <span className="text-[13px] text-muted-foreground">&mdash;</span>
                        )}
                      </td>
                    )}
                    <td className="px-3 py-3 text-[13px] text-foreground break-words">{result.gt}</td>
                    <td className="px-3 py-3 text-[13px] break-words">
                      {isEmptyPrediction ? (
                        <span className="text-muted-foreground">No transcript generated</span>
                      ) : (
                        <span className="text-foreground">{result.pred}</span>
                      )}
                    </td>
                    {showMetrics && (
                      <>
                        <td className="px-4 py-3 text-[13px] text-foreground">
                          {result.wer != null ? parseFloat(parseFloat(result.wer).toFixed(4)) : "-"}
                        </td>
                        {showSimilarity && (
                          <td className="px-4 py-3 text-[13px] text-foreground">
                            {result.string_similarity != null ? parseFloat(parseFloat(result.string_similarity).toFixed(4)) : "-"}
                          </td>
                        )}
                        {useDynamic ? (
                          evaluatorColumns!.map((col) => (
                            <td key={col.key} className="px-4 py-3">
                              {(() => {
                                const cell = readEvaluatorCell(result, col);
                                return (
                                  <EvaluatorScoreCell
                                    score={cell.score}
                                    reasoning={cell.reasoning}
                                    error={cell.error}
                                    outputType={col.outputType}
                                    scaleMax={col.scaleMax}
                                  />
                                );
                              })()}
                            </td>
                          ))
                        ) : (
                          <td className="px-4 py-3">
                            <LLMJudgeBadge score={result.llm_judge_score} reasoning={result.llm_judge_reasoning} />
                          </td>
                        )}
                      </>
                    )}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Mobile: Card layout */}
      <div className="md:hidden space-y-3">
        {results.map((result, index) => {
          const isEmptyPrediction = !result.pred || result.pred.trim() === "";
          // Header pill on mobile: in legacy mode shows the single LLM-judge
          // pass/fail; in dynamic mode it's omitted (each evaluator surfaces
          // its own pill / value below the metrics block instead).
          const legacyScoreStr = String(result.llm_judge_score || "").toLowerCase();
          const legacyPassed = legacyScoreStr === "true" || legacyScoreStr === "1";
          return (
            <div
              key={index}
              data-row-index={index}
              className={`border border-border rounded-xl p-4 space-y-3 ${isEmptyPrediction ? "bg-red-500/10" : ""}`}
            >
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
              {result.audio_url && (
                <div>
                  <span className="text-[11px] text-muted-foreground uppercase tracking-wide">Audio</span>
                  <div className="mt-1">
                    <audio src={result.audio_url} controls preload="none" className="w-full h-8" />
                  </div>
                </div>
              )}
              <div>
                <span className="text-[11px] text-muted-foreground uppercase tracking-wide">Ground Truth</span>
                <p className="text-[13px] text-foreground mt-0.5">{result.gt}</p>
              </div>
              <div>
                <span className="text-[11px] text-muted-foreground uppercase tracking-wide">Prediction</span>
                {isEmptyPrediction ? (
                  <p className="text-[13px] text-muted-foreground mt-0.5">No transcript generated</p>
                ) : (
                  <p className="text-[13px] text-foreground mt-0.5">{result.pred}</p>
                )}
              </div>
              {showMetrics && (
                <div className="space-y-2 pt-1 border-t border-border">
                  <div className="flex gap-4">
                    <div>
                      <span className="text-[11px] text-muted-foreground uppercase tracking-wide">WER</span>
                      <p className="text-[13px] text-foreground">{result.wer != null ? parseFloat(parseFloat(result.wer).toFixed(4)) : "-"}</p>
                    </div>
                    {showSimilarity && (
                      <div>
                        <span className="text-[11px] text-muted-foreground uppercase tracking-wide">Similarity</span>
                        <p className="text-[13px] text-foreground">{result.string_similarity != null ? parseFloat(parseFloat(result.string_similarity).toFixed(4)) : "-"}</p>
                      </div>
                    )}
                  </div>
                  {useDynamic
                    ? evaluatorColumns!.map((col) => {
                        const { score, reasoning, error } = readEvaluatorCell(result, col);
                        if (!score && !reasoning && !error) return null;
                        return (
                          <div key={col.key}>
                            <div className="flex items-center gap-2">
                              <span className="text-[11px] text-muted-foreground uppercase tracking-wide">{col.label}</span>
                              <EvaluatorScoreCell score={score} reasoning={reasoning} error={error} outputType={col.outputType} scaleMax={col.scaleMax} hideTooltipButton />
                            </div>
                            {reasoning && (
                              <p className="text-[12px] text-muted-foreground mt-0.5">{reasoning}</p>
                            )}
                          </div>
                        );
                      })
                    : (result.llm_judge_reasoning && (
                        <div>
                          <span className="text-[11px] text-muted-foreground uppercase tracking-wide">{judgeLabel} Reasoning</span>
                          <p className="text-[12px] text-muted-foreground mt-0.5">{result.llm_judge_reasoning}</p>
                        </div>
                      ))}
                </div>
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

/**
 * Reads an evaluator's cell for one row. Prefers the canonical namespaced
 * shape (`result.evaluator_outputs[<evaluator_uuid>]`) introduced by the
 * STT/TTS API refresh, and falls back to the legacy flat keys
 * (`result[<scoreField>]` / `result[<reasoningField>]`) for older cached
 * responses. Also surfaces the explicit per-row `error: true` flag so the
 * cell renderer can show a "couldn't grade" affordance instead of treating
 * a missing/null value as a Fail.
 */
export function readEvaluatorCell(
  row: Record<string, unknown>,
  col: Pick<STTEvaluatorColumn, "key" | "evaluatorUuid" | "scoreField" | "reasoningField">,
): { score: string | undefined; reasoning: string | undefined; error: boolean } {
  if (col.evaluatorUuid) {
    const outputs = row.evaluator_outputs;
    if (outputs && typeof outputs === "object" && !Array.isArray(outputs)) {
      const entry = (outputs as Record<string, unknown>)[col.evaluatorUuid];
      if (entry && typeof entry === "object" && !Array.isArray(entry)) {
        const e = entry as { value?: unknown; reasoning?: unknown; error?: unknown };
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

function EvaluatorScoreCell({
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
  /** Rating max — when present, the cell renders as `${score}/${scaleMax}`. */
  scaleMax?: number | null;
  /** When true, the per-row judge call failed (timeout / parse / 5xx).
   * Render a distinct "couldn't grade" pill instead of Pass/Fail. */
  error?: boolean;
  hideTooltipButton?: boolean;
}) {
  // Errored rows render their own affordance with the error message as the
  // tooltip, regardless of whether `score` is null/undefined.
  if (error) {
    const tooltipContent = reasoning || "Evaluator could not grade this row.";
    const badge = (
      <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md text-xs font-medium bg-amber-100 text-amber-800 dark:bg-amber-500/20 dark:text-amber-300">
        <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m9-.75a9 9 0 11-18 0 9 9 0 0118 0zm-9 3.75h.008v.008H12v-.008z" />
        </svg>
        Error
      </span>
    );
    if (hideTooltipButton) return badge;
    return (
      <div className="flex items-center gap-1.5">
        {badge}
        <Tooltip content={tooltipContent}>
          <button type="button" className="p-1 rounded-md hover:bg-muted transition-colors cursor-pointer" aria-label="View error">
            <svg className="w-4 h-4 text-muted-foreground" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          </button>
        </Tooltip>
      </div>
    );
  }

  if (!score) return <span className="text-muted-foreground text-[12px]">-</span>;

  const tooltipContent = reasoning || `Score: ${score}`;

  // Binary evaluators render the same Pass/Fail pill the page has always used
  // for the LLM-judge column. Rating evaluators show the raw numeric value
  // (rounded to 4 dp when possible) — colorless, matching how WER/similarity
  // values are rendered elsewhere in the table.
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
