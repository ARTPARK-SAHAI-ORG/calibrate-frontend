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
// Minimum vertical spacing (px) between two model labels before we nudge them
// apart in the de-overlap pass.
const LABEL_GAP = 15;
// Extra horizontal margin so model-name labels beside edge bubbles aren't clipped.
const LABEL_GUTTER = 72;
// Chart margins must clear the largest (hovered) bubble so points sitting on an
// axis edge (e.g. a model at 100%) aren't clipped.
const EDGE_PAD = Math.ceil(R_MAX * HOVER_SCALE) + 8;
const MARGIN = {
  top: EDGE_PAD,
  right: EDGE_PAD + LABEL_GUTTER,
  bottom: 44,
  left: 12 + Math.floor(LABEL_GUTTER / 2),
};

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

  // Precompute label side + vertical nudge so nearby bubbles don't stack their
  // names on top of each other. Positions are estimated from the known chart
  // height and cost/pass-rate fractions (avoids depending on recharts internals).
  const visiblePoints = showDominated ? allData : frontierData;
  const labelLayout = new Map<string, { side: "left" | "right"; dy: number }>();
  {
    const plotTop = MARGIN.top;
    const plotBottom = height - MARGIN.bottom;
    const plotH = Math.max(1, plotBottom - plotTop);
    const ySpan = Math.max(1e-9, yDomain[1] - yDomain[0]);

    type Entry = {
      model: string;
      py: number;
      side: "left" | "right";
      ly: number;
    };
    const entries: Entry[] = visiblePoints.map((d) => {
      const t = (d.passRate - yDomain[0]) / ySpan;
      const py = plotTop + (1 - t) * plotH;
      const side: "left" | "right" =
        xDomainMax > 0 && d.cost / xDomainMax > 0.68 ? "left" : "right";
      return { model: d.model, py, side, ly: py };
    });

    for (const side of ["left", "right"] as const) {
      const grp = entries.filter((e) => e.side === side).sort((a, b) => a.py - b.py);
      for (let i = 1; i < grp.length; i++) {
        grp[i].ly = Math.max(grp[i].py, grp[i - 1].ly + LABEL_GAP);
      }
      if (grp.length) {
        const last = grp[grp.length - 1];
        if (last.ly > plotBottom - 6) {
          last.ly = plotBottom - 6;
          for (let i = grp.length - 2; i >= 0; i--) {
            grp[i].ly = Math.min(grp[i].ly, grp[i + 1].ly - LABEL_GAP);
          }
        }
        for (const e of grp) e.ly = Math.max(e.ly, plotTop + 6);
      }
    }

    for (const e of entries) {
      labelLayout.set(e.model, { side: e.side, dy: e.ly - e.py });
    }
  }

  // Custom point renderer: bubble + model-name label (with leader line when the
  // de-overlap pass nudged the label). Reads `hoveredModel` so the hovered dot
  // pops (grows, full opacity, dark ring) while the others dim.
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

    const layout = labelLayout.get(d.model) ?? { side: "right" as const, dy: 0 };
    const labelX = layout.side === "left" ? cx - r - 5 : cx + r + 5;
    const labelY = cy + layout.dy;
    const edgeX = layout.side === "left" ? cx - r : cx + r;
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
        {Math.abs(layout.dy) > 1 && (
          <line
            x1={edgeX}
            y1={cy}
            x2={labelX}
            y2={labelY}
            stroke="#94a3b8"
            strokeWidth={1}
            strokeOpacity={labelOpacity * 0.6}
          />
        )}
        <text
          x={labelX}
          y={labelY}
          textAnchor={layout.side === "left" ? "end" : "start"}
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

  // Caption is assembled from three parts so it stays honest: what the axes and
  // bubble size mean, then how to read the result. The result sentence differs
  // when only one model is on the frontier (no dashed line is drawn) vs. several.
  const axisSentence = hasLatency
    ? "Each dot is a model. The higher it sits, the more tests it passes. The further left, the less it costs to run. The smaller it is, the faster it replies. So the best models sit toward the top-left."
    : "Each dot is a model. The higher it sits, the more tests it passes, and the further left, the less it costs to run. So the best models sit toward the top-left.";
  const axesList = hasLatency ? "pass rate, cost, and speed" : "both pass rate and cost";
  const hasFrontierLine = frontierData.length >= 2;
  const winnerLabel = frontierData[0]?.label;
  const resultSentence = hasFrontierLine ? (
    <>
      Stick to the models on the dashed line: they are the best picks. For any
      model not on it, one that is will match or beat it on {axesList}, so there
      is no reason to choose it.
    </>
  ) : (
    <>
      <strong className="font-semibold text-foreground">
        {winnerLabel ?? "One model"}
      </strong>{" "}
      comes out on top: it matches or beats every other model on {axesList}, so
      it is the clear pick.
    </>
  );

  return (
    <div>
      <div className="flex items-start justify-between mb-2 gap-3">
        <div>
          <h3 className="text-[15px] font-semibold">{title}</h3>
          <p className="mt-0.5 text-xs text-muted-foreground">
            {axisSentence} {resultSentence}
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
          <ScatterChart margin={MARGIN}>
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
