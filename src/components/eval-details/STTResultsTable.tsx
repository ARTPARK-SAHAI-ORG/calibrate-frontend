import React from "react";
import { Tooltip } from "@/components/Tooltip";
import { LazyAudioPlayer } from "@/components/evaluations/LazyAudioPlayer";
import {
  useLabellingColumn,
  LabellingHeaderCheckbox,
  LabellingSelectCell,
  LABELLING_CHECKBOX_COL_WIDTH,
} from "./labellingSelectionColumn";
import {
  EvaluatorScoreCell,
  readEvaluatorCell,
} from "./EvaluatorScoreCell";
import { SARVAM_METRIC_FIELDS, type SarvamMetricField } from "./sarvamMetrics";

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
  cer?: string;
  // LLM-judged word error rate that ignores errors which wouldn't change an
  // agent's understanding — present only when the run computed it.
  // `semantic_wer_reasoning` is the judge's plain-text explanation.
  semantic_wer?: number | string;
  semantic_wer_reasoning?: string;
  // Per-row latency in seconds — TTFS (Time To Final Segment). Labelled
  // "Latency (s)" in the UI; `null` for providers that don't report it.
  ttfs?: number | string | null;
  string_similarity?: string;
  // Sarvam LLM-judge metrics — present only when the run used Sarvam LLM
  // judges. `sarvam_llm_wer_reasoning` is a JSON string of the judged segments;
  // intent / entity reasoning are plain-text explanations.
  sarvam_llm_wer?: number | string;
  sarvam_llm_cer?: number | string;
  sarvam_intent_score?: number | string;
  sarvam_entity_score?: number | string;
  sarvam_llm_wer_reasoning?: string;
  sarvam_intent_reasoning?: string;
  sarvam_entity_reasoning?: string;
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
  // --- Labelling selection (opt-in) --------------------------------------
  // When `onToggleLabellingSelection` + `labellingKeyForRow` are provided, a
  // leading checkbox column is rendered so rows can be picked for "Submit for
  // labelling" (mirrors the LLM test-run flow). Callers own the selection set
  // and the row→key mapping (STT rows are keyed per provider, e.g.
  // `openai:0`). Public / read-only tables pass none of these and render no
  // checkbox column.
  labellingSelection?: Set<string>;
  onToggleLabellingSelection?: (key: string) => void;
  onLabellingBulkToggle?: (keys: string[]) => void;
  labellingKeyForRow?: (row: STTResultRow, index: number) => string;
  /** Rows for which selection is disabled (e.g. empty ground truth). Defaults to all-eligible. */
  labellingRowEligible?: (row: STTResultRow, index: number) => boolean;
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
  cer: 80,
  semanticWer: 130,
  similarity: 110,
  latency: 100,
  evaluator: 130,
  llmJudge: 110,
} as const;

// Format a numeric metric that may arrive as a number or a stringified number
// (STT rows historically carry `wer` as a string). Returns "-" when absent.
function fmtMetric(v: number | string | undefined | null): string {
  if (v == null || v === "") return "-";
  const n = typeof v === "number" ? v : parseFloat(v);
  return Number.isNaN(n) ? "-" : String(parseFloat(n.toFixed(4)));
}

// Whether a per-row latency (TTFS) value is a usable finite number.
function hasRowTtfs(v: unknown): boolean {
  if (typeof v === "number") return Number.isFinite(v);
  if (typeof v === "string" && v.trim() !== "") return !Number.isNaN(parseFloat(v));
  return false;
}

// Reasoning shown in a metric tooltip. Sarvam LLM-WER carries a JSON string of
// judged segments (pretty-printed here); Intent / Entity and Semantic WER carry
// plain-text explanations (passed through unchanged when JSON parsing fails).
function formatReasoningTooltip(raw: string | undefined): string | undefined {
  if (!raw) return undefined;
  try {
    const parsed = JSON.parse(raw);
    // An empty judged-segments list (or empty object) carries no reasoning —
    // don't surface an info tooltip that just shows "[]".
    const isEmpty =
      (Array.isArray(parsed) && parsed.length === 0) ||
      (parsed != null &&
        typeof parsed === "object" &&
        Object.keys(parsed).length === 0);
    return isEmpty ? undefined : JSON.stringify(parsed, null, 2);
  } catch {
    return raw;
  }
}

// A metric cell that shows a numeric score plus an optional reasoning tooltip.
// Used for the Sarvam LLM judges (LLM-WER's judged segments, Intent / Entity's
// explanation) and for Semantic WER (its judge reasoning).
function MetricValueWithReasoning({
  value,
  reasoning,
  label,
}: {
  value: number | string | undefined;
  reasoning?: string;
  /** Metric label, used for the reasoning button's accessible name. */
  label: string;
}) {
  const text = fmtMetric(value);
  const tip = formatReasoningTooltip(reasoning);
  if (!tip) return <>{text}</>;
  return (
    <span className="inline-flex items-center gap-1">
      {text}
      <Tooltip content={tip}>
        <button
          type="button"
          className="p-0.5 rounded hover:bg-muted transition-colors cursor-pointer"
          aria-label={`View ${label} reasoning`}
        >
          <svg className="w-3.5 h-3.5 text-muted-foreground" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
        </button>
      </Tooltip>
    </span>
  );
}

// Read a Sarvam metric off a row (open-ended `[k: string]: unknown` shape).
function readSarvamValue(
  row: STTResultRow,
  key: string,
): number | string | undefined {
  return row[key] as number | string | undefined;
}

// Render a single Sarvam metric value — the reasoning-tooltip cell for fields
// that carry a `reasoningKey` (LLM-WER, Intent, Entity), plain formatted text
// otherwise (LLM-CER).
function renderSarvamValue(field: SarvamMetricField, row: STTResultRow) {
  const value = readSarvamValue(row, field.key);
  return field.reasoningKey ? (
    <MetricValueWithReasoning
      value={value}
      reasoning={row[field.reasoningKey] as string | undefined}
      label={field.label}
    />
  ) : (
    <>{fmtMetric(value)}</>
  );
}

export function STTResultsTable({ results, showMetrics = true, showSimilarity = true, judgeLabel = "Evaluator", evaluatorColumns, tableRef, labellingSelection, onToggleLabellingSelection, onLabellingBulkToggle, labellingKeyForRow, labellingRowEligible }: STTResultsTableProps) {
  const hasAudio = results.some((r) => !!r.audio_url);
  // Sarvam LLM-judge columns render only for the metrics the run actually
  // carries (Sarvam judges were on). Older runs / judges-off runs show none.
  const sarvamFields = SARVAM_METRIC_FIELDS.filter((f) =>
    results.some((r) => {
      const v = readSarvamValue(r, f.key);
      return v != null && v !== "";
    }),
  );
  // Semantic WER column renders only when the run carries it. Mirrors the
  // Sarvam-metric filtering above.
  const hasSemanticWer = results.some(
    (r) => r.semantic_wer != null && r.semantic_wer !== "",
  );
  // Per-row latency (TTFS) column renders only when the run carries it (absent
  // for providers like Gemini that don't report TTFS). Mirrors the filters above.
  const hasTtfs = results.some((r) => hasRowTtfs(r.ttfs));
  // When `evaluatorColumns` is provided, each evaluator gets its own column;
  // the legacy `llm_judge_*` rendering branch is skipped.
  const useDynamic = Array.isArray(evaluatorColumns) && evaluatorColumns.length > 0;

  // Drop evaluator columns that no row has a value for. STT evaluations can now
  // run with no evaluators, and older payloads may carry an evaluator with only
  // empty cells — an all-"-" column is just noise. Mirrors the Sarvam-metric
  // filtering above; reads via `readEvaluatorCell` so both the canonical
  // `evaluator_outputs[uuid]` shape and the legacy flat fields count, and keeps
  // a column that errored (the evaluator ran but couldn't grade).
  const visibleEvaluatorColumns = useDynamic
    ? evaluatorColumns!.filter((col) =>
        results.some((r) => {
          const { score, error } = readEvaluatorCell(r, col);
          return error || (score != null && score !== "");
        }),
      )
    : [];

  // Labelling checkbox column (opt-in). Eligibility defaults to "row has
  // ground truth". The shared hook owns the derived state so this table and
  // TTSResultsTable can't drift.
  const { showCheckboxes, rowEligible, allSelectableKeys, allSelected } =
    useLabellingColumn(
      results,
      {
        labellingSelection,
        onToggleLabellingSelection,
        onLabellingBulkToggle,
        labellingKeyForRow,
        labellingRowEligible,
      },
      (r) => !!r.gt && r.gt.trim() !== "",
    );

  // Compute the table's minimum pixel width from the column widths above so
  // the inner `overflow-x-auto` wrapper can scroll once we run out of room.
  // Without this the `table-fixed w-full` layout would shrink each column to
  // fit the container — which is what we explicitly don't want when there
  // are several evaluators.
  const tableMinWidth = (() => {
    let total = STT_COL_WIDTHS.id + STT_COL_WIDTHS.text * 2; // ID + GT + Pred
    if (showCheckboxes) total += LABELLING_CHECKBOX_COL_WIDTH;
    if (hasAudio) total += STT_COL_WIDTHS.audio;
    if (showMetrics) {
      total += STT_COL_WIDTHS.wer;
      total += STT_COL_WIDTHS.cer;
      if (hasSemanticWer) total += STT_COL_WIDTHS.semanticWer;
      total += sarvamFields.reduce((sum, f) => sum + f.width, 0);
      if (showSimilarity) total += STT_COL_WIDTHS.similarity;
      if (hasTtfs) total += STT_COL_WIDTHS.latency;
      if (useDynamic) total += visibleEvaluatorColumns.length * STT_COL_WIDTHS.evaluator;
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
                {showCheckboxes && (
                  <LabellingHeaderCheckbox
                    allSelectableKeys={allSelectableKeys}
                    allSelected={allSelected}
                    onBulkToggle={onLabellingBulkToggle}
                  />
                )}
                <th style={{ width: STT_COL_WIDTHS.id }} className="px-3 py-3 text-left text-[12px] font-medium text-foreground">ID</th>
                {hasAudio && (
                  <th style={{ width: STT_COL_WIDTHS.audio }} className="px-3 py-3 text-left text-[12px] font-medium text-foreground">Audio</th>
                )}
                <th style={{ width: STT_COL_WIDTHS.text }} className="px-3 py-3 text-left text-[12px] font-medium text-foreground">Ground Truth</th>
                <th style={{ width: STT_COL_WIDTHS.text }} className="px-3 py-3 text-left text-[12px] font-medium text-foreground">Prediction</th>
                {showMetrics && (
                  <>
                    <th style={{ width: STT_COL_WIDTHS.wer }} className="px-3 py-3 text-left text-[12px] font-medium text-foreground">WER</th>
                    <th style={{ width: STT_COL_WIDTHS.cer }} className="px-3 py-3 text-left text-[12px] font-medium text-foreground">CER</th>
                    {hasSemanticWer && (
                      <th style={{ width: STT_COL_WIDTHS.semanticWer }} className="px-3 py-3 text-left text-[12px] font-medium text-foreground">Semantic WER</th>
                    )}
                    {sarvamFields.map((f) => (
                      <th key={f.key} style={{ width: f.width }} className="px-3 py-3 text-left text-[12px] font-medium text-foreground">{f.label}</th>
                    ))}
                    {showSimilarity && (
                      <th style={{ width: STT_COL_WIDTHS.similarity }} className="px-3 py-3 text-left text-[12px] font-medium text-foreground">Similarity</th>
                    )}
                    {hasTtfs && (
                      <th style={{ width: STT_COL_WIDTHS.latency }} className="px-3 py-3 text-left text-[12px] font-medium text-foreground">Latency (s)</th>
                    )}
                    {useDynamic
                      ? visibleEvaluatorColumns.map((col) => (
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
                    {showCheckboxes && (() => {
                      const key = labellingKeyForRow!(result, index);
                      return (
                        <LabellingSelectCell
                          eligible={rowEligible(result, index)}
                          checked={labellingSelection?.has(key) ?? false}
                          onToggle={() => onToggleLabellingSelection!(key)}
                          disabledTitle="Rows without ground truth can't be labelled"
                        />
                      );
                    })()}
                    <td className="px-3 py-3 text-[13px] text-foreground">{index + 1}</td>
                    {hasAudio && (
                      <td className="px-3 py-3">
                        {result.audio_url ? (
                          <LazyAudioPlayer src={result.audio_url} className="w-full max-w-[160px]" />
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
                        <td className="px-4 py-3 text-[13px] text-foreground">
                          {result.cer != null ? parseFloat(parseFloat(result.cer).toFixed(4)) : "-"}
                        </td>
                        {hasSemanticWer && (
                          <td className="px-4 py-3 text-[13px] text-foreground">
                            <MetricValueWithReasoning
                              value={result.semantic_wer}
                              reasoning={result.semantic_wer_reasoning}
                              label="Semantic WER"
                            />
                          </td>
                        )}
                        {sarvamFields.map((f) => (
                          <td key={f.key} className="px-4 py-3 text-[13px] text-foreground">
                            {renderSarvamValue(f, result)}
                          </td>
                        ))}
                        {showSimilarity && (
                          <td className="px-4 py-3 text-[13px] text-foreground">
                            {result.string_similarity != null ? parseFloat(parseFloat(result.string_similarity).toFixed(4)) : "-"}
                          </td>
                        )}
                        {hasTtfs && (
                          <td className="px-4 py-3 text-[13px] text-foreground">
                            {fmtMetric(result.ttfs)}
                          </td>
                        )}
                        {useDynamic ? (
                          visibleEvaluatorColumns.map((col) => (
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
                {/* Labelling checkboxes are desktop-only — the "Submit for
                    labelling" button is hidden on mobile, so selecting here
                    would be a dead end. */}
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
                    <LazyAudioPlayer src={result.audio_url} className="w-full" />
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
                  <div className="flex gap-4 flex-wrap">
                    <div>
                      <span className="text-[11px] text-muted-foreground uppercase tracking-wide">WER</span>
                      <p className="text-[13px] text-foreground">{result.wer != null ? parseFloat(parseFloat(result.wer).toFixed(4)) : "-"}</p>
                    </div>
                    <div>
                      <span className="text-[11px] text-muted-foreground uppercase tracking-wide">CER</span>
                      <p className="text-[13px] text-foreground">{result.cer != null ? parseFloat(parseFloat(result.cer).toFixed(4)) : "-"}</p>
                    </div>
                    {hasSemanticWer && (
                      <div>
                        <span className="text-[11px] text-muted-foreground uppercase tracking-wide">Semantic WER</span>
                        {/* div (not p) — the reasoning tooltip renders a block
                            wrapper, which can't nest inside a <p>. */}
                        <div className="text-[13px] text-foreground">
                          <MetricValueWithReasoning
                            value={result.semantic_wer}
                            reasoning={result.semantic_wer_reasoning}
                            label="Semantic WER"
                          />
                        </div>
                      </div>
                    )}
                    {sarvamFields.map((f) => (
                      <div key={f.key}>
                        <span className="text-[11px] text-muted-foreground uppercase tracking-wide">{f.label}</span>
                        {/* div (not p) — the LLM-WER tooltip renders a block
                            wrapper, which can't nest inside a <p>. */}
                        <div className="text-[13px] text-foreground">{renderSarvamValue(f, result)}</div>
                      </div>
                    ))}
                    {showSimilarity && (
                      <div>
                        <span className="text-[11px] text-muted-foreground uppercase tracking-wide">Similarity</span>
                        <p className="text-[13px] text-foreground">{result.string_similarity != null ? parseFloat(parseFloat(result.string_similarity).toFixed(4)) : "-"}</p>
                      </div>
                    )}
                    {hasTtfs && (
                      <div>
                        <span className="text-[11px] text-muted-foreground uppercase tracking-wide">Latency (s)</span>
                        <p className="text-[13px] text-foreground">{fmtMetric(result.ttfs)}</p>
                      </div>
                    )}
                  </div>
                  {useDynamic
                    ? visibleEvaluatorColumns.map((col) => {
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
