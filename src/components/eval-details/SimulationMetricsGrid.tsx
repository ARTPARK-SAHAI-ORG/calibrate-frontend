import React, { useState } from "react";
import Link from "next/link";

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
};

const LATENCY_KEYS = ["stt/ttft", "llm/ttft", "tts/ttft", "stt/processing_time", "llm/processing_time", "tts/processing_time"];

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

export function SimulationMetricsGrid({ metrics, type, evaluatorUuidByName }: SimulationMetricsGridProps) {
  const [activeTab, setActiveTab] = useState<"performance" | "latency">("performance");

  if (!metrics) return null;

  const regularMetrics: Array<[string, MetricData]> = [];
  const latencyMetrics: Array<[string, MetricData]> = [];
  Object.entries(metrics).forEach(([key, metric]) => {
    if (!metric) return;
    if (LATENCY_KEYS.includes(key)) latencyMetrics.push([key, metric]);
    else regularMetrics.push([key, metric]);
  });

  if (regularMetrics.length === 0 && latencyMetrics.length === 0) return null;

  const isTextType = type === "text";

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
            // When linkable, the entire card becomes a `<Link>` (with
            // hover-highlight + arrow icon) so the affordance is
            // obvious. Otherwise it's a plain div.
            const cardInner = (
              <>
                <div className="text-[12px] text-muted-foreground mb-1 flex items-center gap-1.5">
                  <span>{key}</span>
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
                <Link
                  key={key}
                  href={`/evaluators/${evaluatorUuid}`}
                  className="group block border border-border rounded-xl p-4 bg-muted/10 hover:border-foreground/40 hover:bg-muted/30 transition-colors cursor-pointer"
                >
                  {cardInner}
                </Link>
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
          {latencyMetrics.map(([key, metric]) => (
            <div key={key} className="border border-border rounded-xl p-4 bg-muted/10">
              <div className="text-[12px] text-muted-foreground mb-1">{key}</div>
              <div className="text-[18px] font-semibold text-foreground">
                {metric.mean < 1 ? `${(metric.mean * 1000).toFixed(0)}ms` : `${metric.mean.toFixed(2)}s`}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export { LATENCY_KEYS };
