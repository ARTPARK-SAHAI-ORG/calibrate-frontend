"use client";

import { useCallback, useMemo, useRef, useState } from "react";
import {
  ScatterChart,
  Scatter,
  XAxis,
  YAxis,
  ZAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Cell,
} from "recharts";
import {
  computeParetoFrontier,
  orderFrontierByCost,
  type ParetoPoint,
} from "@/lib/paretoFrontier";
import { formatCostUsd, formatLatencyMs, formatPercent } from "@/lib/llmMetrics";
import { downloadChartPng } from "./downloadChart";

export type ParetoModelPoint = {
  /** Stable model id (matches the leaderboard row `model`) — used for colors. */
  model: string;
  /** Display label for the model. */
  label: string;
  /** Cost objective (USD, per test) — X axis, lower is better. */
  cost: number;
  /** Accuracy objective (0–100 pass rate) — Y axis, higher is better. */
  accuracy: number;
  /** Latency (ms) — mapped to bubble size. Optional. */
  latency?: number;
};

type ParetoFrontierChartProps = {
  points: ParetoModelPoint[];
  colorMap: Map<string, string>;
  title?: string;
  accuracyLabel?: string;
  filename?: string;
  height?: number;
};

// Bubble area range (px²) passed to recharts ZAxis for the latency dimension.
const BUBBLE_RANGE: [number, number] = [120, 900];
// Fixed bubble area when no model reported a latency.
const FIXED_BUBBLE: [number, number] = [260, 260];
// Largest bubble radius ≈ sqrt(maxArea / π). Chart margins must clear it so
// bubbles sitting on the axis edges (e.g. a model at 100%) aren't clipped.
const MAX_BUBBLE_RADIUS = Math.ceil(Math.sqrt(BUBBLE_RANGE[1] / Math.PI)); // ~17
const EDGE_PAD = MAX_BUBBLE_RADIUS + 8;

type ChartDatum = ParetoModelPoint & { z: number; onFrontier: boolean };

function ParetoTooltip({
  active,
  payload,
  accuracyLabel,
}: {
  active?: boolean;
  payload?: Array<{ payload: ChartDatum }>;
  accuracyLabel: string;
}) {
  if (!active || !payload || payload.length === 0) return null;
  const d = payload[0].payload;
  return (
    <div className="rounded-lg border border-border bg-background px-3 py-2 text-xs shadow-md">
      <div className="mb-1 flex items-center gap-1.5 font-semibold text-foreground">
        {d.label}
        {d.onFrontier && (
          <span className="rounded bg-foreground px-1.5 py-0.5 text-[10px] font-medium text-background">
            Frontier
          </span>
        )}
      </div>
      <div className="text-muted-foreground">
        {accuracyLabel}: <span className="text-foreground">{formatPercent(d.accuracy)}</span>
      </div>
      <div className="text-muted-foreground">
        Cost: <span className="text-foreground">{formatCostUsd(d.cost)}</span>
      </div>
      {typeof d.latency === "number" && Number.isFinite(d.latency) && (
        <div className="text-muted-foreground">
          Latency: <span className="text-foreground">{formatLatencyMs(d.latency)}</span>
        </div>
      )}
    </div>
  );
}

/**
 * Pareto-frontier scatter of the benchmarked models: cost on X (lower better),
 * accuracy on Y (higher better), latency as bubble size. The dashed line traces
 * the non-dominated frontier — the models where you can't get cheaper without
 * giving up accuracy. Dominated models are faded (and can be hidden entirely
 * via the "Frontier only" toggle). Renders nothing when fewer than one model
 * has both a finite cost and accuracy.
 */
export function ParetoFrontierChart({
  points,
  colorMap,
  title = "Cost vs accuracy (Pareto frontier)",
  accuracyLabel = "Accuracy",
  filename = "pareto-frontier",
  height = 400,
}: ParetoFrontierChartProps) {
  const chartRef = useRef<HTMLDivElement>(null);
  const [frontierOnly, setFrontierOnly] = useState(false);

  const { allData, frontierData, dominatedData, hasLatency } = useMemo(() => {
    const valid = points.filter(
      (p) => Number.isFinite(p.cost) && Number.isFinite(p.accuracy),
    );
    const paretoInput: ParetoPoint[] = valid.map((p) => ({
      model: p.model,
      cost: p.cost,
      accuracy: p.accuracy,
    }));
    const frontier = computeParetoFrontier(paretoInput);
    const anyLatency = valid.some(
      (p) => typeof p.latency === "number" && Number.isFinite(p.latency),
    );

    const enrich = (p: ParetoModelPoint): ChartDatum => ({
      ...p,
      // ZAxis needs a finite z on every point; models missing a latency fall
      // back to 0 so their bubble sits at the small end of the range.
      z:
        typeof p.latency === "number" && Number.isFinite(p.latency)
          ? p.latency
          : 0,
      onFrontier: frontier.has(p.model),
    });

    const all = valid.map(enrich);
    const orderedFrontier = orderFrontierByCost(paretoInput, frontier);
    const byModel = new Map(all.map((d) => [d.model, d]));

    return {
      allData: all,
      hasLatency: anyLatency,
      frontierData: orderedFrontier
        .map((p) => byModel.get(p.model))
        .filter((d): d is ChartDatum => Boolean(d)),
      dominatedData: all.filter((d) => !d.onFrontier),
    };
  }, [points]);

  const download = useCallback(() => {
    downloadChartPng(chartRef.current, title, filename);
  }, [title, filename]);

  const hasDominated = dominatedData.length > 0;
  const showDominated = !frontierOnly;
  // Points currently visible drive the axis domains so the view stays tight
  // when the dominated models are hidden.
  const visible = showDominated ? allData : frontierData;

  if (allData.length === 0) {
    return (
      <div className="flex flex-col min-h-[160px]">
        <h3 className="text-[15px] font-semibold mb-2">{title}</h3>
        <p className="text-xs text-muted-foreground mt-auto mb-auto text-center py-8">
          No chart data (models are missing cost or accuracy values).
        </p>
      </div>
    );
  }

  const costMax = Math.max(...visible.map((d) => d.cost));
  const accVals = visible.map((d) => d.accuracy);
  const accMin = Math.min(...accVals);
  const accMax = Math.max(...accVals);
  const accPad = Math.max(2, (accMax - accMin) * 0.15);
  const yDomain: [number, number] = [
    Math.max(0, Math.floor(accMin - accPad)),
    Math.min(100, Math.ceil(accMax + accPad)),
  ];

  const cellProps = (d: ChartDatum) => ({
    fill: colorMap.get(d.model) || "#A8D5E2",
    fillOpacity: d.onFrontier ? 0.9 : 0.4,
    stroke: d.onFrontier ? "#0f172a" : "#94a3b8",
    strokeWidth: d.onFrontier ? 1.5 : 1,
  });

  return (
    <div>
      <div className="flex items-start justify-between mb-2 gap-3">
        <div>
          <h3 className="text-[15px] font-semibold">{title}</h3>
          <p className="mt-0.5 text-xs text-muted-foreground">
            Up and to the left is better. Bubble size ={" "}
            {hasLatency ? "latency (larger = slower)" : "latency (not reported)"}. The
            dashed line marks the non-dominated frontier.
          </p>
        </div>
        <div className="flex flex-shrink-0 items-center gap-2">
          {hasDominated && (
            <button
              onClick={() => setFrontierOnly((v) => !v)}
              className={`rounded-md border px-2 py-1 text-xs font-medium transition-colors cursor-pointer ${
                frontierOnly
                  ? "border-foreground bg-foreground text-background"
                  : "border-border text-muted-foreground hover:bg-muted/50 hover:text-foreground"
              }`}
              title="Show only the models on the Pareto frontier"
            >
              Frontier only
            </button>
          )}
          <button
            onClick={download}
            className="flex items-center gap-1.5 rounded-md border border-border px-2 py-1 text-xs font-medium text-muted-foreground transition-colors hover:bg-muted/50 hover:text-foreground cursor-pointer"
            title="Download as PNG"
          >
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
                d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5M16.5 12L12 16.5m0 0L7.5 12m4.5 4.5V3"
              />
            </svg>
            PNG
          </button>
        </div>
      </div>
      <div ref={chartRef}>
        <ResponsiveContainer width="100%" height={height}>
          <ScatterChart
            margin={{
              top: EDGE_PAD,
              right: EDGE_PAD,
              bottom: 44,
              left: 12,
            }}
          >
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis
              type="number"
              dataKey="cost"
              name="Cost"
              domain={[0, costMax * 1.1 || "auto"]}
              tick={{ fontSize: 12 }}
              tickFormatter={(v) => formatCostUsd(v)}
              label={{
                value: "Average cost (USD) →  cheaper is better",
                position: "insideBottom",
                offset: -24,
                style: { fontSize: 12, fill: "currentColor" },
              }}
            />
            <YAxis
              type="number"
              dataKey="accuracy"
              name={accuracyLabel}
              domain={yDomain}
              tick={{ fontSize: 12 }}
              tickFormatter={(v) => `${v}%`}
              label={{
                value: `${accuracyLabel} (%)`,
                angle: -90,
                position: "insideLeft",
                style: { fontSize: 12, fill: "currentColor", textAnchor: "middle" },
              }}
            />
            <ZAxis
              type="number"
              dataKey="z"
              range={hasLatency ? BUBBLE_RANGE : FIXED_BUBBLE}
              name="Latency"
            />
            <Tooltip
              cursor={{ strokeDasharray: "3 3" }}
              content={<ParetoTooltip accuracyLabel={accuracyLabel} />}
            />
            {/* Frontier line drawn through non-dominated points, sorted by cost. */}
            <Scatter
              data={frontierData}
              line={{ stroke: "#64748b", strokeWidth: 2, strokeDasharray: "6 4" }}
              lineType="joint"
              isAnimationActive={false}
            >
              {frontierData.map((d) => (
                <Cell key={`f-${d.model}`} {...cellProps(d)} />
              ))}
            </Scatter>
            {/* Dominated points (no connecting line) — hidden in "Frontier only". */}
            {showDominated && (
              <Scatter data={dominatedData} isAnimationActive={false}>
                {dominatedData.map((d) => (
                  <Cell key={`d-${d.model}`} {...cellProps(d)} />
                ))}
              </Scatter>
            )}
          </ScatterChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
