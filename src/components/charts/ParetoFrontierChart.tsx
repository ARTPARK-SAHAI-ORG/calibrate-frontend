"use client";

import { useCallback, useMemo, useRef } from "react";
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
 * giving up accuracy. Dominated models are faded. Renders nothing when fewer
 * than one model has both a finite cost and accuracy.
 */
export function ParetoFrontierChart({
  points,
  colorMap,
  title = "Cost vs accuracy (Pareto frontier)",
  accuracyLabel = "Accuracy",
  filename = "pareto-frontier",
  height = 380,
}: ParetoFrontierChartProps) {
  const chartRef = useRef<HTMLDivElement>(null);

  const { data, frontierData, dominatedData, hasLatency } = useMemo(() => {
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
      // back to the mid of the range so their bubble is a neutral size.
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
      data: all,
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

  if (data.length === 0) {
    return (
      <div className="border rounded-xl p-4 bg-muted/10 flex flex-col min-h-[200px]">
        <h3 className="text-[15px] font-semibold mb-2">{title}</h3>
        <p className="text-xs text-muted-foreground mt-auto mb-auto text-center py-8">
          No chart data (models are missing cost or accuracy values).
        </p>
      </div>
    );
  }

  const costMax = Math.max(...data.map((d) => d.cost));
  const accVals = data.map((d) => d.accuracy);
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
    <div className="border rounded-xl p-4 bg-muted/10">
      <div className="flex items-start justify-between mb-1 gap-2">
        <div>
          <h3 className="text-[15px] font-semibold">{title}</h3>
          <p className="mt-0.5 text-xs text-muted-foreground">
            Up and to the left is better. Bubble size ={" "}
            {hasLatency ? "latency (larger = slower)" : "latency (not reported)"}. The
            dashed line marks the non-dominated frontier.
          </p>
        </div>
        <button
          onClick={download}
          className="flex flex-shrink-0 items-center gap-1.5 rounded-md border border-border px-2 py-1 text-xs font-medium text-muted-foreground transition-colors hover:bg-muted/50 hover:text-foreground cursor-pointer"
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
      <div ref={chartRef}>
        <ResponsiveContainer width="100%" height={height}>
          <ScatterChart margin={{ top: 16, right: 24, bottom: 40, left: 8 }}>
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
                offset: -20,
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
            {/* Dominated points (no connecting line). */}
            <Scatter data={dominatedData} isAnimationActive={false}>
              {dominatedData.map((d) => (
                <Cell key={`d-${d.model}`} {...cellProps(d)} />
              ))}
            </Scatter>
          </ScatterChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
