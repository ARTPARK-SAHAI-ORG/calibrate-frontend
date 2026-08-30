import React from "react";
import { Tooltip } from "@/components/Tooltip";
import {
  useLabellingColumn,
  LabellingHeaderCheckbox,
  LabellingSelectCell,
  type LabellingColumnProps,
} from "./labellingSelectionColumn";

// `evaluator_uuid` is added on newer runs (rename-safe link target). `name`
// on each row is still the CSV column name from run time and may drift
// from the live evaluator name after renames.
export type EvaluationResult = {
  name: string;
  value: number;
  reasoning: string;
  evaluator_uuid?: string;
  description?: string | null;
};
export type Persona = { label: string; characteristics: string; gender: string; language: string };
export type Scenario = { name: string; description: string };
export type TranscriptEntry = { role: string; content?: string; tool_calls?: any[] | null; tool_call_id?: string };

export type SimulationResult = {
  simulation_name: string;
  aborted?: boolean;
  persona: Persona;
  scenario: Scenario;
  evaluation_results: EvaluationResult[] | null;
  transcript?: TranscriptEntry[] | null;
  audio_urls?: string[];
  conversation_wav_url?: string;
};

// Per-metric display info derived from `runData.metrics[key]`. Used to
// switch the per-row cell between Pass/Fail (binary) and `value/max`
// (rating). Older runs that don't carry `type` fall through to the
// legacy Pass/Fail rendering so existing share links keep working.
export type MetricDisplayInfo = {
  type?: "binary" | "rating" | string;
  scale_max?: number;
};

type SimulationResultsTableProps = {
  simulations: SimulationResult[];
  metricKeys: string[];
  onSelectSimulation: (sim: SimulationResult) => void;
  /** Optional per-metric type / scale info, keyed by metric name. */
  metricInfo?: Record<string, MetricDisplayInfo | undefined>;
} & LabellingColumnProps<SimulationResult>;

const getEvaluationResult = (sim: SimulationResult, key: string): number | null => {
  if (!sim.evaluation_results) return null;
  const mapped = key === "stt_llm_judge" ? "stt_llm_judge_score" : key;
  const found = sim.evaluation_results.find((r) => r.name === key || r.name === mapped);
  return found ? found.value : null;
};

const getEvaluationReasoning = (sim: SimulationResult, key: string): string | null => {
  if (!sim.evaluation_results) return null;
  const mapped = key === "stt_llm_judge" ? "stt_llm_judge_score" : key;
  const found = sim.evaluation_results.find((r) => r.name === key || r.name === mapped);
  return found?.reasoning ?? null;
};

const hasTranscript = (sim: SimulationResult) => (sim.transcript?.length ?? 0) > 0;

// A simulation that has started talking but has no scores yet shows a yellow
// spinner; one that has not started at all shows a grey one.
const isProcessing = (sim: SimulationResult) =>
  !sim.aborted && hasTranscript(sim) && !sim.evaluation_results;
const isWaiting = (sim: SimulationResult) =>
  !sim.aborted && !hasTranscript(sim) && !sim.evaluation_results;

/**
 * A simulation can be sent for labelling once it produced a real
 * conversation: not aborted, and with at least one turn that is not the
 * `end_reason` sentinel.
 */
export const isSimulationLabellable = (sim: SimulationResult) =>
  !sim.aborted && (sim.transcript ?? []).some((t) => t.role !== "end_reason");

// Finished simulations first, then ones still talking, then ones not started.
const rowPriority = (sim: SimulationResult) => {
  if (sim.evaluation_results) return 3;
  if (hasTranscript(sim)) return 2;
  return 1;
};

const spinner = (className: string) => (
  <svg className={className} fill="none" viewBox="0 0 24 24">
    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
    <path
      className="opacity-75"
      fill="currentColor"
      d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
    ></path>
  </svg>
);

const playIcon = (
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
      d="M5.25 5.653c0-.856.917-1.398 1.667-.986l11.54 6.348a1.125 1.125 0 010 1.971l-11.54 6.347a1.125 1.125 0 01-1.667-.986V5.653z"
    />
  </svg>
);

const infoIcon = (
  <svg
    className="w-3.5 h-3.5 text-muted-foreground cursor-pointer"
    fill="none"
    viewBox="0 0 24 24"
    stroke="currentColor"
    strokeWidth={2}
  >
    <path
      strokeLinecap="round"
      strokeLinejoin="round"
      d="M11.25 11.25l.041-.02a.75.75 0 011.063.852l-.708 2.836a.75.75 0 001.063.853l.041-.021M21 12a9 9 0 11-18 0 9 9 0 0118 0zm-9-3.75h.008v.008H12V8.25z"
    />
  </svg>
);

// The score badge for one row and one evaluator. `stt_llm_judge` keeps its
// own percentage display; rating evaluators show `value/max`; binary and
// older typeless runs show Pass/Fail. Values are coerced to numbers first —
// the backend has been observed to send them as strings, which would make
// `toFixed` throw and `=== 1` always false.
export function scoreBadge(
  metricKey: string,
  value: number,
  info: MetricDisplayInfo | undefined,
): { text: string; className: string } {
  const numeric = Number(value);
  const safe = Number.isFinite(numeric) ? numeric : NaN;
  const plain = "inline-flex items-center px-2.5 py-1 rounded-md text-xs font-medium text-foreground";
  if (metricKey === "stt_llm_judge" || metricKey === "stt_llm_judge_score") {
    if (!Number.isFinite(safe)) return { text: `${value}`, className: plain };
    return { text: `${parseFloat((safe * 100).toFixed(2))}%`, className: plain };
  }
  if (info?.type === "rating") {
    const rounded = Number.isFinite(safe) ? parseFloat(safe.toFixed(2)) : value;
    const text = typeof info.scale_max === "number" ? `${rounded}/${info.scale_max}` : `${rounded}`;
    return { text, className: plain };
  }
  const passed = safe === 1;
  return {
    text: passed ? "Pass" : "Fail",
    className: `inline-flex items-center px-2.5 py-1 rounded-md text-xs font-medium ${
      passed
        ? "bg-green-100 text-green-700 dark:bg-green-500/20 dark:text-green-400"
        : "bg-red-100 text-red-700 dark:bg-red-500/20 dark:text-red-400"
    }`,
  };
}

// What one evaluator's cell shows for one simulation, in the table and in
// the phone card alike: the score, or why there is no score.
function MetricValue({
  sim,
  metricKey,
  metricInfo,
  compact,
}: {
  sim: SimulationResult;
  metricKey: string;
  metricInfo?: MetricDisplayInfo;
  compact?: boolean;
}) {
  const value = getEvaluationResult(sim, metricKey);
  const reasoning = getEvaluationReasoning(sim, metricKey);
  if (value === null) {
    if (sim.aborted) return <span className="text-xs text-muted-foreground">N/A</span>;
    // The run finished but this evaluator never scored the row: nothing was
    // measured, which is not the same as a failure.
    if (sim.evaluation_results) return <span className="text-xs text-muted-foreground">&mdash;</span>;
    return spinner(
      `${compact ? "w-4 h-4" : "w-5 h-5"} flex-shrink-0 animate-spin ${
        isProcessing(sim) ? "text-yellow-500" : "text-gray-500"
      }`,
    );
  }
  const badge = scoreBadge(metricKey, value, metricInfo);
  const className = compact
    ? badge.className.replace("px-2.5 py-1 rounded-md", "px-2 py-0.5 rounded")
    : badge.className;
  // The judge's reasoning always sits behind the same small circle next to
  // the score, on both pages and on a phone, so a reader learns one place to
  // look for why a score is what it is.
  return (
    <div className="flex items-center gap-1.5">
      <span className={className}>{badge.text}</span>
      {reasoning && <Tooltip content={reasoning}>{infoIcon}</Tooltip>}
    </div>
  );
}

export function SimulationResultsTable({
  simulations,
  metricKeys,
  onSelectSimulation,
  metricInfo,
  ...labellingProps
}: SimulationResultsTableProps) {
  const { showCheckboxes, rowEligible, allSelectableKeys, allSelected } = useLabellingColumn(
    simulations,
    labellingProps,
    isSimulationLabellable,
  );
  const { labellingSelection, onToggleLabellingSelection, onLabellingBulkToggle, labellingKeyForRow } =
    labellingProps;

  // Keep each row's original position so labelling keys stay stable no
  // matter how the table is sorted for display.
  const ordered = simulations
    .map((sim, originalIndex) => ({ sim, originalIndex }))
    .sort((a, b) => rowPriority(b.sim) - rowPriority(a.sim));

  return (
    <div>
      <div className="flex items-baseline gap-3 mb-3 md:mb-4">
        <h2 className="hidden md:block text-base md:text-lg font-semibold">Simulation Results</h2>
        <p className="text-sm text-muted-foreground">
          {simulations.length} {simulations.length === 1 ? "simulation" : "simulations"}
        </p>
      </div>

      {/* Desktop table */}
      <div className="hidden md:block border border-border rounded-xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full table-fixed">
            <thead className="bg-muted/50 border-b border-border">
              <tr>
                {showCheckboxes && (
                  <LabellingHeaderCheckbox
                    allSelectableKeys={allSelectableKeys}
                    allSelected={allSelected}
                    onBulkToggle={onLabellingBulkToggle}
                  />
                )}
                <th className="w-10 px-2 py-3 text-left text-[12px] font-medium text-muted-foreground"></th>
                <th className="w-44 px-3 py-3 text-left text-[12px] font-medium text-muted-foreground uppercase tracking-wider">
                  Persona
                </th>
                <th className="w-44 px-3 py-3 text-left text-[12px] font-medium text-muted-foreground uppercase tracking-wider">
                  Scenario
                </th>
                {metricKeys.map((k) => (
                  <th
                    key={k}
                    className="w-36 px-3 py-3 text-left text-[12px] font-medium text-muted-foreground tracking-wider"
                  >
                    <div className="overflow-x-auto max-w-full">
                      <div className="whitespace-nowrap">{k}</div>
                    </div>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {ordered.map(({ sim, originalIndex }) => {
                const processing = isProcessing(sim);
                const waiting = isWaiting(sim);
                const eligible = rowEligible(sim, originalIndex);
                const rowKey = labellingKeyForRow?.(sim, originalIndex) ?? "";
                return (
                  <tr key={originalIndex} className="hover:bg-muted/30 transition-colors">
                    {showCheckboxes && (
                      <LabellingSelectCell
                        eligible={eligible}
                        checked={!!labellingSelection?.has(rowKey)}
                        onToggle={() => onToggleLabellingSelection?.(rowKey)}
                        disabledTitle="Aborted or empty runs can't be labelled"
                      />
                    )}
                    <td className="px-2 py-4 whitespace-nowrap">
                      <div className="relative w-6 h-6 flex items-center justify-center">
                        {processing && spinner("absolute inset-0 w-6 h-6 animate-spin text-yellow-500")}
                        {waiting && spinner("absolute inset-0 w-6 h-6 animate-spin text-gray-500")}
                        {hasTranscript(sim) && (
                          <button
                            onClick={() => onSelectSimulation(sim)}
                            title="View transcript"
                            aria-label="View transcript"
                            className={`relative z-10 flex items-center justify-center w-4 h-4 cursor-pointer ${
                              sim.aborted ? "text-red-500" : "text-foreground"
                            }`}
                          >
                            {playIcon}
                          </button>
                        )}
                      </div>
                    </td>
                    <td className="px-3 py-4 text-[13px] text-foreground">
                      <div className="overflow-x-auto max-w-full">
                        <div className="whitespace-nowrap">{sim.persona.label}</div>
                      </div>
                    </td>
                    <td className="px-3 py-4 text-[13px] text-foreground">
                      <div className="overflow-x-auto max-w-full">
                        <div className="whitespace-nowrap">{sim.scenario.name}</div>
                      </div>
                    </td>
                    {metricKeys.map((metricKey) => (
                      <td key={metricKey} className="px-3 py-4 whitespace-nowrap">
                        <div className="flex justify-center">
                          <MetricValue
                            sim={sim}
                            metricKey={metricKey}
                            metricInfo={metricInfo?.[metricKey]}
                          />
                        </div>
                      </td>
                    ))}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Mobile cards. Labelling checkboxes are desktop-only: the "Submit for
          labelling" button is hidden on mobile, so ticking rows here would be
          a dead end. */}
      <div className="md:hidden space-y-4">
        {ordered.map(({ sim, originalIndex }) => {
          const processing = isProcessing(sim);
          return (
            <div
              key={originalIndex}
              className="border border-border rounded-xl overflow-hidden bg-background"
            >
              <div className="p-5">
                <div className="space-y-3 mb-4 pb-4 border-b border-border/50">
                  <div>
                    <div className="text-xs text-muted-foreground mb-1">Persona</div>
                    <div className="text-sm font-medium text-foreground">{sim.persona.label}</div>
                  </div>
                  <div>
                    <div className="text-xs text-muted-foreground mb-1">Scenario</div>
                    <div className="text-sm font-medium text-foreground">{sim.scenario.name}</div>
                  </div>
                </div>

                {metricKeys.length > 0 && (
                  <div className="mb-4">
                    <div className="text-xs font-semibold text-foreground mb-3">Metrics</div>
                    <div className="space-y-3">
                      {metricKeys.map((metricKey) => (
                        <div
                          key={metricKey}
                          className="flex items-center justify-between py-2 border-b border-border/50 last:border-b-0"
                        >
                          <div className="min-w-0 pr-3">
                            <span className="text-xs text-muted-foreground">{metricKey}</span>
                          </div>
                          <div className="flex items-center gap-2">
                            <MetricValue
                              sim={sim}
                              metricKey={metricKey}
                              metricInfo={metricInfo?.[metricKey]}
                              compact
                            />
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {hasTranscript(sim) && (
                  <button
                    onClick={() => onSelectSimulation(sim)}
                    className={`w-full h-9 flex items-center justify-center gap-2 rounded-md text-sm font-medium hover:opacity-90 transition-opacity cursor-pointer ${
                      sim.aborted
                        ? "bg-red-500/10 border border-red-500/30 text-red-500"
                        : "bg-foreground text-background"
                    }`}
                  >
                    {playIcon}
                    {processing ? "Processing..." : "View Transcript"}
                  </button>
                )}
                {sim.aborted && !hasTranscript(sim) && (
                  <div className="w-full h-9 flex items-center justify-center gap-2 rounded-md text-sm font-medium bg-red-500/10 border border-red-500/30 text-red-500">
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        d="M12 9v3.75m9-.75a9 9 0 11-18 0 9 9 0 0118 0zm-9 3.75h.008v.008H12v-.008z"
                      />
                    </svg>
                    Simulation aborted by user
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
