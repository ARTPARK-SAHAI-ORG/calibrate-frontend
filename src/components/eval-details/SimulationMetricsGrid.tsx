import React, { useState } from "react";
import { Tooltip } from "@/components/Tooltip";
import { EvaluatorPreviewModal } from "@/components/evaluators/EvaluatorPreviewModal";
import type { SimulationResult } from "./SimulationResultsTable";

// `MetricData` represents one entry in `runData.metrics`. Newer simulation
// runs include `type` (`"binary" | "rating"`) plus rating bounds
// (`scale_min` / `scale_max`); older runs ship only `mean` / `std` /
// `values` and we treat them as binary for backward compat.
export type MetricData = {
  mean: number;
  std: number;
  values: number[];
  type?: "binary" | "rating" | string;
  scale_min?: number;
  scale_max?: number;
};

type SimulationMetricsGridProps = {
  metrics: Record<string, MetricData | undefined> | null;
  type: "text" | "voice";
  /**
   * Optional metric-name → evaluator UUID map. When provided, evaluator
   * cards link to `/evaluators/{uuid}`. The auth `/simulations/run/{id}`
   * page passes this; the public share page omits it (the route is
   * authenticated and would 404 anonymous users).
   */
  evaluatorUuidByName?: Record<string, string>;
  /** Optional metric-name → snapshotted evaluator description map. */
  evaluatorDescriptionByName?: Record<string, string>;
  /**
   * The run's per-simulation results. Only used to work out the latency
   * cards for older runs whose `metrics` carry no latency entries; the
   * numbers are averaged from each simulation's own results.
   */
  simulations?: SimulationResult[];
};

const LATENCY_KEYS = ["stt/ttft", "llm/ttft", "tts/ttft", "stt/processing_time", "llm/processing_time", "tts/processing_time"];

// Plain-words hover text for a latency card, e.g. "llm/ttft".
export function latencyMetricTooltip(metricKey: string): string {
  const [component, metricType] = metricKey.split("/");
  const componentName =
    component === "stt"
      ? "speech to text"
      : component === "llm"
      ? "language model"
      : component === "tts"
      ? "text to speech"
      : component;
  if (metricType === "ttft") return `Time to first byte for ${componentName}`;
  if (metricType === "processing_time") return `Processing time for ${componentName}`;
  return "";
}

// Speech-to-text accuracy is a built-in score rather than an evaluator the
// user wrote, so it carries no description of its own.
const STT_JUDGE_DESCRIPTION =
  "This is the speech to text accuracy for the text spoken by the simulated user calculated by comparing it with the transcribed text by the agent";

// Average each latency number across the run's simulations. Used only when
// `metrics` has no latency entries of its own.
function latencyMetricsFromSimulations(simulations: SimulationResult[]): Array<[string, MetricData]> {
  const out: Array<[string, MetricData]> = [];
  for (const key of LATENCY_KEYS) {
    const values: number[] = [];
    for (const sim of simulations) {
      const found = sim.evaluation_results?.find((r) => r.name === key);
      if (found && typeof found.value === "number") values.push(found.value);
    }
    if (values.length > 0) {
      out.push([key, { mean: values.reduce((a, b) => a + b, 0) / values.length, std: 0, values }]);
    }
  }
  return out;
}

// Display formatter for the headline scalar on each metric card. Binary
// metrics show pass count / total (the user expects "pass/fail"-style
// information at a glance; for an aggregate that's the count of passing
// runs over all runs). Rating metrics show `mean / scale_max`. Anything
// else (including older runs that don't carry `type`) falls through to
// the legacy percent-of-mean rendering so existing dashboards keep
// working.
export function formatMetricCardValue(metric: MetricData): string {
  // Coerce numerics defensively. The backend has been observed to
  // serialize decimal fields (`mean`) as strings on some responses,
  // which makes `mean.toFixed(...)` blow up at runtime even though
  // TypeScript thinks it's `number`.
  const numericMean = Number(metric.mean);
  const safeMean = Number.isFinite(numericMean) ? numericMean : 0;
  if (metric.type === "rating" && typeof metric.scale_max === "number") {
    return `${parseFloat(safeMean.toFixed(2))}/${metric.scale_max}`;
  }
  // Binary and legacy/typeless metrics both render as a percentage of
  // the mean — same display as before the typed-evaluator migration so
  // existing dashboards keep their familiar look.
  return `${Math.round(safeMean * 100)}%`;
}

export function SimulationMetricsGrid({
  metrics,
  type,
  evaluatorUuidByName,
  evaluatorDescriptionByName,
  simulations,
}: SimulationMetricsGridProps) {
  const [activeTab, setActiveTab] = useState<"performance" | "latency">("performance");
  // The evaluator whose prompt is on show, opened from a metric card's name.
  const [previewEvaluator, setPreviewEvaluator] = useState<{
    uuid: string;
    name: string;
  } | null>(null);

  if (!metrics) return null;

  const regularMetrics: Array<[string, MetricData]> = [];
  let latencyMetrics: Array<[string, MetricData]> = [];
  Object.entries(metrics).forEach(([key, metric]) => {
    if (!metric) return;
    if (LATENCY_KEYS.includes(key)) latencyMetrics.push([key, metric]);
    else regularMetrics.push([key, metric]);
  });
  if (latencyMetrics.length === 0 && simulations?.length) {
    latencyMetrics = latencyMetricsFromSimulations(simulations);
  }

  if (regularMetrics.length === 0 && latencyMetrics.length === 0) return null;

  const isTextType = type === "text";
  const descriptionIcon = (
    <svg
      className="w-3.5 h-3.5 text-muted-foreground hover:text-foreground transition-colors cursor-pointer"
      fill="none"
      viewBox="0 0 24 24"
      stroke="currentColor"
      strokeWidth={2}
      aria-hidden="true"
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M11.25 11.25l.041-.02a.75.75 0 011.063.852l-.708 2.836a.75.75 0 001.063.853l.041-.021M21 12a9 9 0 11-18 0 9 9 0 0118 0zm-9-3.75h.008v.008H12V8.25z"
      />
    </svg>
  );

  return (
    <div>
      <h2 className="text-base md:text-lg font-semibold mb-3">Overall Metrics</h2>
      {!isTextType && (
        <div className="flex gap-2 border-b border-border mb-4">
          <button
            onClick={() => setActiveTab("performance")}
            className={`px-4 py-2 text-[13px] font-medium border-b-2 transition-colors cursor-pointer ${
              activeTab === "performance" ? "border-foreground text-foreground" : "border-transparent text-muted-foreground hover:text-foreground"
            }`}
          >
            Performance
          </button>
          <button
            onClick={() => setActiveTab("latency")}
            className={`px-4 py-2 text-[13px] font-medium border-b-2 transition-colors cursor-pointer ${
              activeTab === "latency" ? "border-foreground text-foreground" : "border-transparent text-muted-foreground hover:text-foreground"
            }`}
          >
            Latency
          </button>
        </div>
      )}
      {(isTextType || activeTab === "performance") && regularMetrics.length > 0 && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {regularMetrics.map(([key, metric]) => {
            const evaluatorUuid = evaluatorUuidByName?.[key];
            const description =
              evaluatorDescriptionByName?.[key] ??
              (key === "stt_llm_judge" || key === "stt_llm_judge_score" ? STT_JUDGE_DESCRIPTION : undefined);
            // When an evaluator uuid is available, the entire card
            // becomes a button that opens a preview of how that
            // evaluator judges (with hover-highlight + arrow icon) so
            // the affordance is obvious. Otherwise it's a plain div.
            const cardInner = (
              <>
                <div className="text-[12px] text-muted-foreground mb-1 flex items-center gap-1.5">
                  <span>{key}</span>
                  {description && (
                    <Tooltip content={description}>{descriptionIcon}</Tooltip>
                  )}
                  {evaluatorUuid && (
                    <svg
                      className="ml-auto w-3.5 h-3.5 text-muted-foreground group-hover:text-foreground transition-colors"
                      fill="none"
                      viewBox="0 0 24 24"
                      stroke="currentColor"
                      strokeWidth={2}
                      aria-hidden="true"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        d="M13.5 6H5.25A2.25 2.25 0 003 8.25v10.5A2.25 2.25 0 005.25 21h10.5A2.25 2.25 0 0018 18.75V10.5m-10.5 6L21 3m0 0h-5.25M21 3v5.25"
                      />
                    </svg>
                  )}
                </div>
                <div className="text-[18px] font-semibold text-foreground">{formatMetricCardValue(metric)}</div>
              </>
            );
            if (evaluatorUuid) {
              return (
                <button
                  type="button"
                  key={key}
                  onClick={() => setPreviewEvaluator({ uuid: evaluatorUuid, name: key })}
                  className="group block w-full text-left border border-border rounded-xl p-4 bg-muted/10 hover:border-foreground/40 hover:bg-muted/30 transition-colors cursor-pointer"
                >
                  {cardInner}
                </button>
              );
            }
            return (
              <div key={key} className="border border-border rounded-xl p-4 bg-muted/10">
                {cardInner}
              </div>
            );
          })}
        </div>
      )}
      {!isTextType && activeTab === "latency" && latencyMetrics.length > 0 && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {latencyMetrics.map(([key, metric]) => {
            const tooltip = latencyMetricTooltip(key);
            return (
              <div key={key} className="border border-border rounded-xl p-4 bg-muted/10">
                <div className="text-[12px] text-muted-foreground mb-1 flex items-center gap-1.5">
                  {key}
                  {tooltip && <Tooltip content={tooltip}>{descriptionIcon}</Tooltip>}
                </div>
                <div className="text-[18px] font-semibold text-foreground">
                  {metric.mean < 1 ? `${(metric.mean * 1000).toFixed(0)}ms` : `${metric.mean.toFixed(2)}s`}
                </div>
              </div>
            );
          })}
        </div>
      )}
      <EvaluatorPreviewModal
        evaluatorUuid={previewEvaluator?.uuid ?? null}
        evaluatorName={previewEvaluator?.name}
        onClose={() => setPreviewEvaluator(null)}
      />
    </div>
  );
}

export { LATENCY_KEYS };
