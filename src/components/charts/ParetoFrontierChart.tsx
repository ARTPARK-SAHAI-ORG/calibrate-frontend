"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
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
  isValidParetoPoint,
  orderFrontierByCost,
  type ParetoPoint,
} from "@/lib/paretoFrontier";
import { layoutParetoLabels } from "@/lib/paretoLabelLayout";
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
  subtitle?: string;
  passRateLabel?: string;
  filename?: string;
  height?: number;
};

// Bright solid green for the frontier line + best-value highlights — the hero
// colour. design.md uses text-green-500 for success, whose hex is #22c55e.
const FRONTIER_GREEN = "#22c55e";

// Bubble radius range (px) mapped from latency (fastest → big, slowest → small).
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
// Fallback plot width before the container has been measured (jsdom / first paint).
const DEFAULT_CHART_WIDTH = 560;
// Chart margins must clear the largest (hovered) bubble so points sitting on an
// axis edge (e.g. a model at 100%) aren't clipped.
const EDGE_PAD = Math.ceil(R_MAX * HOVER_SCALE) + 8;
const MARGIN = {
  top: EDGE_PAD,
  // A small right pad, not a full label gutter: only frontier dots are labeled
  // and they cluster top-left, so a wide right margin was just empty space
  // between the plot and the table beside it.
  right: EDGE_PAD + 24,
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
            Best pick
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
          Speed: <span className="text-foreground">{formatLatencyMs(d.latency)}</span>
        </div>
      )}
    </div>
  );
}

/**
 * Cost / quality / speed tradeoff scatter beside a compact table of the models.
 * Cost on X (lower better), pass rate on Y (higher better), latency as bubble
 * size (faster is bigger). The Pareto frontier is computed across all three
 * objectives, so a model that looks dominated on the 2-D plane can still make
 * the frontier by being fastest. A bright green line joins the frontier (best)
 * models in cost order; only frontier dots are labeled in-plot. The table lists
 * every model (or only the best ones when "Show the best models only" is on),
 * highlights the winning value in each column, and shares one hover state with
 * the plot. Renders nothing when no model has a finite cost and pass rate.
 */
export function ParetoFrontierChart({
  points,
  colorMap,
  title,
  subtitle,
  passRateLabel = "Pass rate",
  filename = "pareto-frontier",
  height = 460,
}: ParetoFrontierChartProps) {
  const chartRef = useRef<HTMLDivElement>(null);
  // Default to the best models only; toggling off reveals every model.
  const [frontierOnly, setFrontierOnly] = useState(true);
  const [hoveredModel, setHoveredModel] = useState<string | null>(null);
  const [chartWidth, setChartWidth] = useState(DEFAULT_CHART_WIDTH);

  const { allData, frontierData, dominatedData, hasLatency } = useMemo(() => {
    const valid = points.filter(isValidParetoPoint);
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

  // Title varies with whether speed is a factor, unless the caller overrides it.
  const resolvedTitle =
    title ??
    (hasLatency
      ? "Cost, quality and speed tradeoff"
      : "Cost and quality tradeoff");

  useEffect(() => {
    const el = chartRef.current;
    if (!el || typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver((entries) => {
      const w = entries[0]?.contentRect.width;
      if (typeof w === "number" && w > 0) setChartWidth(w);
    });
    ro.observe(el);
    return () => ro.disconnect();
    // Re-bind when the chart surface mounts (empty state has no ref target).
  }, [allData.length]);

  const download = useCallback(() => {
    downloadChartPng(chartRef.current, resolvedTitle, filename);
  }, [resolvedTitle, filename]);

  const hasDominated = dominatedData.length > 0;
  const showDominated = !frontierOnly;

  if (allData.length === 0) {
    return (
      <div className="flex flex-col min-h-[160px]">
        <h3 className="text-[15px] font-semibold mb-2">{resolvedTitle}</h3>
        <p className="text-xs text-muted-foreground mt-auto mb-auto text-center py-8">
          No chart data (models are missing cost or pass-rate values).
        </p>
      </div>
    );
  }

  // Plain-language explanation of the frontier, honest about whether speed is a
  // factor. This is the simple Pareto explanation: the line joins the models
  // that nothing else beats on every measure at once.
  const resolvedSubtitle =
    subtitle ??
    (hasLatency
      ? "Each model is placed by how many tests it passes, what it costs, and how fast it replies (faster models are bigger). The green line joins the best models: the ones that nothing else beats on quality, cost and speed all at once. Any model below the line is beaten by one on it, so there is no reason to choose it."
      : "Each model is placed by how many tests it passes and what it costs. The green line joins the best models: the ones that nothing else beats on both quality and cost at once. Any model below the line is beaten by one on it, so there is no reason to choose it.");

  // Domains are derived from ALL models (not just the visible ones) so points
  // keep their exact position when the toggle hides dominated models —
  // toggling filters points, it never rescales the axes.
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
    // Faster (lower latency) → bigger bubble, so the quickest models stand out.
    const t = (d.latency - zMin) / (zMax - zMin);
    return R_MIN + (1 - t) * (R_MAX - R_MIN);
  };

  // Best value per column (over ALL models) so the table can highlight the
  // winner in each dimension.
  const bestPassRate = Math.max(...prVals);
  const bestCost = Math.min(...allData.map((d) => d.cost));
  const bestLatency = latencies.length ? Math.min(...latencies) : null;
  // Table rows: honour the toggle. When every model is shown, the best
  // (frontier) models come first as a group, then the rest — each block sorted
  // by quality.
  const rankedRows = [...(showDominated ? allData : frontierData)].sort(
    (a, b) =>
      a.onFrontier === b.onFrontier
        ? b.passRate - a.passRate
        : a.onFrontier
          ? -1
          : 1,
  );

  // Only FRONTIER points get an in-plot name label — lay those out (with side +
  // vertical nudge) over the frontier alone. Dominated dots stay unlabeled.
  const labelLayout = layoutParetoLabels(
    frontierData.map((d) => ({
      model: d.model,
      label: d.label,
      cost: d.cost,
      passRate: d.passRate,
      radius: radiusFor(d),
    })),
    {
      width: chartWidth,
      height,
      margin: MARGIN,
      xDomainMax: xDomainMax || 1,
      yDomain,
      labelGap: LABEL_GAP,
    },
  );

  // Custom point renderer: bubble + (frontier-only) model-name label with a
  // leader line when the de-overlap pass nudged the label. Reads `hoveredModel`
  // so the hovered dot pops (grows, full opacity, green ring) while others dim.
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
    const stroke = isHovered
      ? FRONTIER_GREEN
      : d.onFrontier
        ? "#0f172a"
        : "#94a3b8";
    const strokeWidth = isHovered ? 2.5 : d.onFrontier ? 1.5 : 1;

    const layout = labelLayout.get(d.model);
    const showLabel = d.onFrontier && !!layout;
    const side = layout?.side ?? "right";
    const dy = layout?.dy ?? 0;
    const labelX = side === "left" ? cx - r - 5 : cx + r + 5;
    const labelY = cy + dy;
    const edgeX = side === "left" ? cx - r : cx + r;
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
        {showLabel && Math.abs(dy) > 1 && (
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
        {showLabel && (
          <text
            x={labelX}
            y={labelY}
            textAnchor={side === "left" ? "end" : "start"}
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
        )}
      </g>
    );
  };

  return (
    <div>
      <div className="flex items-start justify-between mb-3 gap-3">
        <div>
          <h3 className="text-[15px] font-semibold">{resolvedTitle}</h3>
          <p className="mt-0.5 max-w-3xl text-xs text-muted-foreground">
            {resolvedSubtitle}
          </p>
        </div>
        <div className="flex flex-shrink-0 items-center gap-2">
          {hasDominated && (
            <button
              onClick={() => setFrontierOnly((v) => !v)}
              className={`rounded-md border px-3 py-1.5 text-xs font-semibold transition-colors cursor-pointer ${
                frontierOnly
                  ? "border-green-500 bg-green-500 text-white hover:bg-green-600"
                  : "border-green-500 text-green-700 hover:bg-green-500/10 dark:text-green-400"
              }`}
              title="Show only the best models (the ones on the green line)"
            >
              Show the best models only
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
      <div className="flex flex-col gap-4 md:flex-row">
        <div ref={chartRef} className="flex-1 min-w-0">
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
                  value: "Average cost (USD)",
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
              {/* Frontier points, connected by the bright solid green hero line in
                  cost order — but only when there are 2+ of them. */}
              <Scatter
                data={frontierData}
                line={
                  frontierData.length >= 2
                    ? { stroke: FRONTIER_GREEN, strokeWidth: 2.5 }
                    : false
                }
                lineType="joint"
                isAnimationActive={false}
                shape={renderDot}
              />
              {/* Dominated points (no connecting line) — hidden when the toggle is on. */}
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
        <div className="md:w-80 lg:w-[26rem] flex-shrink-0">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border text-xs text-muted-foreground">
                <th className="py-1.5 text-left font-medium">Model</th>
                <th className="py-1.5 text-right font-medium">Quality</th>
                <th className="py-1.5 text-right font-medium">Cost</th>
                {hasLatency && (
                  <th className="py-1.5 pl-3 text-right font-medium">Speed</th>
                )}
              </tr>
            </thead>
            <tbody>
              {rankedRows.map((d) => {
                const isHovered = hoveredModel === d.model;
                const hasLat =
                  typeof d.latency === "number" && Number.isFinite(d.latency);
                return (
                  <tr
                    key={d.model}
                    onMouseEnter={() => setHoveredModel(d.model)}
                    onMouseLeave={() => setHoveredModel(null)}
                    className={`cursor-pointer border-b border-border/40 transition-colors ${
                      isHovered ? "bg-muted" : "hover:bg-muted/50"
                    } ${d.onFrontier ? "" : "opacity-55"}`}
                  >
                    <td className="py-1 pr-2">
                      <div className="flex items-center gap-2">
                        <span
                          className="h-2.5 w-2.5 flex-shrink-0 rounded-full"
                          style={{
                            backgroundColor: colorMap.get(d.model) || "#A8D5E2",
                          }}
                        />
                        <span
                          className={`block max-w-[13rem] overflow-x-auto whitespace-nowrap pb-0.5 [scrollbar-width:thin] ${
                            d.onFrontier
                              ? "font-medium text-foreground"
                              : "text-muted-foreground"
                          }`}
                          title={d.label}
                        >
                          {d.label}
                        </span>
                      </div>
                    </td>
                    <td
                      className={`py-1 text-right tabular-nums ${
                        d.passRate === bestPassRate
                          ? "font-bold text-green-600 dark:text-green-400"
                          : "text-foreground"
                      }`}
                    >
                      {formatPercent(d.passRate)}
                    </td>
                    <td
                      className={`py-1 text-right tabular-nums ${
                        d.cost === bestCost
                          ? "font-bold text-green-600 dark:text-green-400"
                          : "text-foreground"
                      }`}
                    >
                      {formatCostUsd(d.cost)}
                    </td>
                    {hasLatency && (
                      <td
                        className={`py-1 pl-3 text-right tabular-nums ${
                          hasLat && d.latency === bestLatency
                            ? "font-bold text-green-600 dark:text-green-400"
                            : "text-muted-foreground"
                        }`}
                      >
                        {hasLat ? formatLatencyMs(d.latency as number) : "—"}
                      </td>
                    )}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
