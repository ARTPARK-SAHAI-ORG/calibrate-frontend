"use client";

import { useCallback, useMemo, useRef, useState } from "react";
import {
  ScatterChart,
  Scatter,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
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
  /** Pass-rate objective (0–100) — Y axis, higher is better. */
  passRate: number;
  /** Latency (ms) — bubble size AND third frontier objective (lower is better). Optional. */
  latency?: number;
};

type ParetoFrontierChartProps = {
  points: ParetoModelPoint[];
  colorMap: Map<string, string>;
  title?: string;
  passRateLabel?: string;
  filename?: string;
  height?: number;
};

// Bubble radius range (px) mapped from latency (min latency → small, max → big).
const R_MIN = 7;
const R_MAX = 18;
// Radius when a model has no latency (uniform mid-size bubble).
const R_FIXED = 9;
// Hovered bubbles grow by this factor for focus.
const HOVER_SCALE = 1.25;
// Chart margins must clear the largest (hovered) bubble so points sitting on an
// axis edge (e.g. a model at 100%) aren't clipped.
const EDGE_PAD = Math.ceil(R_MAX * HOVER_SCALE) + 8;

type ChartDatum = ParetoModelPoint & { onFrontier: boolean };

function ParetoTooltip({
  active,
  payload,
  passRateLabel,
}: {
  active?: boolean;
  payload?: Array<{ payload: ChartDatum }>;
  passRateLabel: string;
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
        {passRateLabel}: <span className="text-foreground">{formatPercent(d.passRate)}</span>
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
 * pass rate on Y (higher better), latency as bubble size. The frontier itself is
 * computed across all three objectives (cost, pass rate AND latency), so a model
 * that looks dominated on the 2-D cost/pass-rate plane can still be on the
 * frontier by being the fastest. The dashed line connects the frontier models in
 * cost order. Dominated models are faded (and can be hidden entirely via the
 * "Frontier only" toggle). Renders nothing when no model has a finite cost and
 * pass rate.
 */
export function ParetoFrontierChart({
  points,
  colorMap,
  title = "Pass rate vs cost vs latency tradeoff",
  passRateLabel = "Pass rate",
  filename = "pareto-frontier",
  height = 400,
}: ParetoFrontierChartProps) {
  const chartRef = useRef<HTMLDivElement>(null);
  const [frontierOnly, setFrontierOnly] = useState(false);
  const [hoveredModel, setHoveredModel] = useState<string | null>(null);

  const { allData, frontierData, dominatedData, hasLatency } = useMemo(() => {
    const valid = points.filter(
      (p) => Number.isFinite(p.cost) && Number.isFinite(p.passRate),
    );
    const paretoInput: ParetoPoint[] = valid.map((p) => ({
      model: p.model,
      cost: p.cost,
      passRate: p.passRate,
      latency: p.latency,
    }));
    const frontier = computeParetoFrontier(paretoInput);
    const anyLatency = valid.some(
      (p) => typeof p.latency === "number" && Number.isFinite(p.latency),
    );

    const enrich = (p: ParetoModelPoint): ChartDatum => ({
      ...p,
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

  if (allData.length === 0) {
    return (
      <div className="flex flex-col min-h-[160px]">
        <h3 className="text-[15px] font-semibold mb-2">{title}</h3>
        <p className="text-xs text-muted-foreground mt-auto mb-auto text-center py-8">
          No chart data (models are missing cost or pass-rate values).
        </p>
      </div>
    );
  }

  // Domains are derived from ALL models (not just the visible ones) so points
  // keep their exact position when the "Frontier only" toggle hides dominated
  // models — toggling filters points, it never rescales the axes.
  const costMax = Math.max(...allData.map((d) => d.cost));
  const xDomainMax = costMax * 1.1;
  const prVals = allData.map((d) => d.passRate);
  const prMin = Math.min(...prVals);
  const prMax = Math.max(...prVals);
  const prPad = Math.max(2, (prMax - prMin) * 0.15);
  const yDomain: [number, number] = [
    Math.max(0, Math.floor(prMin - prPad)),
    Math.min(100, Math.ceil(prMax + prPad)),
  ];

  // Map latency → bubble radius ourselves (independent of recharts internals) so
  // the custom dot shape can size and grow bubbles deterministically.
  const latencies = allData
    .map((d) => d.latency)
    .filter((v): v is number => typeof v === "number" && Number.isFinite(v));
  const zMin = latencies.length ? Math.min(...latencies) : 0;
  const zMax = latencies.length ? Math.max(...latencies) : 0;
  const radiusFor = (d: ChartDatum): number => {
    if (!hasLatency || typeof d.latency !== "number" || !Number.isFinite(d.latency)) {
      return R_FIXED;
    }
    if (zMax === zMin) return (R_MIN + R_MAX) / 2;
    const t = (d.latency - zMin) / (zMax - zMin);
    return R_MIN + t * (R_MAX - R_MIN);
  };

  // Custom point renderer: the bubble plus its always-on model-name label. Reads
  // `hoveredModel` so the hovered dot pops (grows, full opacity, dark ring) while
  // the others dim — the "in focus" affordance.
  const renderDot = (props: { cx?: number; cy?: number; payload?: ChartDatum }) => {
    const { cx, cy, payload } = props;
    if (cx == null || cy == null || !payload) return <g />;
    const d = payload;
    const isHovered = hoveredModel === d.model;
    const someHovered = hoveredModel !== null;
    const r = radiusFor(d) * (isHovered ? HOVER_SCALE : 1);
    const fillOpacity = isHovered
      ? 1
      : someHovered
        ? d.onFrontier
          ? 0.45
          : 0.15
        : d.onFrontier
          ? 0.9
          : 0.4;
    const stroke = isHovered || d.onFrontier ? "#0f172a" : "#94a3b8";
    const strokeWidth = isHovered ? 2.5 : d.onFrontier ? 1.5 : 1;

    // Label sits to the right of the dot, or to the left when the dot is near
    // the right edge so the text never runs off the chart.
    const labelLeft = xDomainMax > 0 && d.cost / xDomainMax > 0.68;
    const labelX = labelLeft ? cx - r - 5 : cx + r + 5;
    const labelOpacity = isHovered ? 1 : someHovered ? 0.25 : 0.85;

    return (
      <g
        onMouseEnter={() => setHoveredModel(d.model)}
        onMouseLeave={() => setHoveredModel(null)}
        style={{ cursor: "pointer" }}
      >
        <circle
          cx={cx}
          cy={cy}
          r={r}
          fill={colorMap.get(d.model) || "#A8D5E2"}
          fillOpacity={fillOpacity}
          stroke={stroke}
          strokeWidth={strokeWidth}
          style={{
            transition:
              "r 120ms ease, fill-opacity 120ms ease, stroke-width 120ms ease",
          }}
        />
        <text
          x={labelX}
          y={cy}
          textAnchor={labelLeft ? "end" : "start"}
          dominantBaseline="central"
          fontSize={11}
          fontWeight={isHovered ? 600 : 500}
          fill="currentColor"
          fillOpacity={labelOpacity}
          style={{
            paintOrder: "stroke",
            stroke: "var(--background)",
            strokeWidth: 3,
            strokeLinejoin: "round",
          }}
        >
          {d.label}
        </text>
      </g>
    );
  };

  return (
    <div>
      <div className="flex items-start justify-between mb-2 gap-3">
        <div>
          <h3 className="text-[15px] font-semibold">{title}</h3>
          <p className="mt-0.5 text-xs text-muted-foreground">
            {hasLatency
              ? "Each dot is a model. The higher it sits, the more tests it passes. The further left, the less it costs to run. The smaller it is, the faster it replies. So the best models sit toward the top-left. Stick to the models on the dashed line: they are the best picks. For any model not on it, one that is will match or beat it on pass rate, cost, and speed, so there is no reason to choose it."
              : "Each dot is a model. The higher it sits, the more tests it passes, and the further left, the less it costs to run. So the best models sit toward the top-left. Stick to the models on the dashed line: they are the best picks. For any model not on it, one that is will match or beat it on both pass rate and cost, so there is no reason to choose it."}
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
              domain={[0, xDomainMax || "auto"]}
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
              dataKey="passRate"
              name={passRateLabel}
              domain={yDomain}
              tick={{ fontSize: 12 }}
              tickFormatter={(v) => `${v}%`}
              label={{
                value: `${passRateLabel} (%)`,
                angle: -90,
                position: "insideLeft",
                style: { fontSize: 12, fill: "currentColor", textAnchor: "middle" },
              }}
            />
            <Tooltip
              cursor={{ strokeDasharray: "3 3" }}
              content={<ParetoTooltip passRateLabel={passRateLabel} />}
            />
            {/* Frontier points, connected by a dashed line in cost order — but
                only when there are 2+ of them (a single point has no line). */}
            <Scatter
              data={frontierData}
              line={
                frontierData.length >= 2
                  ? { stroke: "#64748b", strokeWidth: 2, strokeDasharray: "6 4" }
                  : false
              }
              lineType="joint"
              isAnimationActive={false}
              shape={renderDot}
            />
            {/* Dominated points (no connecting line) — hidden in "Frontier only". */}
            {showDominated && (
              <Scatter
                data={dominatedData}
                isAnimationActive={false}
                shape={renderDot}
              />
            )}
          </ScatterChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
