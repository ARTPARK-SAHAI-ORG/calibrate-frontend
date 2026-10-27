"use client";

import {
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import {
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  XAxis,
  YAxis,
} from "recharts";
import { buildTrendChart, type TrendPoint } from "@/lib/agreementKappa";

const TICK = { fill: "var(--muted-foreground)" };
const AGREEMENT_COLOR = "var(--chart-2)";
const KAPPA_COLOR = "var(--chart-1)";
const DOT_RADIUS = 4;
const HIT_RADIUS = 10;
/** How long the hover box waits after the mouse leaves the point and the
 * box before closing, so the mouse can cross from one to the other. */
const CLOSE_DELAY_MS = 200;

/** The hover box for one point: its label as a small heading over whatever
 * the page draws for that point, in the same box as the agreement cards.
 * On a chart narrower than the box, the box shrinks to fit. */
export function TrendHoverBox({
  label,
  children,
}: {
  label: ReactNode;
  children: ReactNode;
}) {
  return (
    <div className="border border-border rounded-lg p-4 bg-background min-w-[min(260px,100%)] shadow-sm">
      <div className="text-xs font-medium text-muted-foreground mb-2.5">
        {label}
      </div>
      {children}
    </div>
  );
}

/** A version on the x axis. The live one reads "v1 Live" on one line: the
 * version ends just left of the tick and the Live mark starts just right. */
export function VersionAxisTick({
  x,
  y,
  payload,
  liveLabels,
}: {
  x?: number;
  y?: number;
  payload?: { value: string };
  liveLabels: Set<string>;
}) {
  const label = payload?.value ?? "";
  const isLive = liveLabels.has(label);
  return (
    <g transform={`translate(${x ?? 0},${y ?? 0})`}>
      <text
        x={isLive ? -2 : 0}
        y={0}
        dy={12}
        textAnchor={isLive ? "end" : "middle"}
        fontSize={11}
        fill="currentColor"
      >
        {label}
      </text>
      {isLive && (
        <>
          <rect
            x={2}
            y={2}
            width={30}
            height={14}
            rx={3}
            className="fill-green-500/10"
          />
          <text
            x={17}
            y={12}
            textAnchor="middle"
            fontSize={9}
            fontWeight={600}
            className="fill-green-600 dark:fill-green-400"
          >
            Live
          </text>
        </>
      )}
    </g>
  );
}

type HoveredPoint = { key: string; label: string; x: number; y: number };

type DotProps = {
  cx?: number;
  cy?: number;
  index?: number;
  payload?: { key?: string; label?: string };
};

/**
 * An evaluator's agreement with humans and its kappa across versions:
 * agreement on the left axis as a percentage, kappa on its own axis on the
 * right. Hovering a point opens the page's box for it beside the point; the
 * box takes the mouse, so its own hover text can be read, and clicking a
 * point keeps it open until a click elsewhere or Escape.
 */
export function AgreementTrendChart({
  points,
  renderHover,
}: {
  points: readonly TrendPoint[];
  /** Draws the hover box for a point, given the point's `key` and label. */
  renderHover: (pointKey: string, label: string) => ReactNode;
}) {
  const { data, kappaDomain } = buildTrendChart(points);
  const liveLabels = new Set(points.filter((p) => p.live).map((p) => p.label));
  const [hovered, setHovered] = useState<HoveredPoint | null>(null);
  const [pinned, setPinned] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const boxRef = useRef<HTMLDivElement>(null);
  const closeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const cancelClose = () => {
    if (closeTimer.current) clearTimeout(closeTimer.current);
    closeTimer.current = null;
  };
  const scheduleClose = () => {
    if (pinned) return;
    cancelClose();
    closeTimer.current = setTimeout(() => setHovered(null), CLOSE_DELAY_MS);
  };

  useEffect(() => cancelClose, []);
  useEffect(() => {
    if (!pinned) return;
    const unpin = () => {
      setPinned(false);
      setHovered(null);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") unpin();
    };
    const onDown = (e: MouseEvent) => {
      const target = e.target as Element;
      if (boxRef.current?.contains(target) || target.closest("[data-trend-dot]"))
        return;
      unpin();
    };
    document.addEventListener("keydown", onKey);
    document.addEventListener("mousedown", onDown);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("mousedown", onDown);
    };
  }, [pinned]);

  // Beside the point, on whichever side has room, and never past either edge
  // of the chart, so a narrow screen does not push it off the page. Placed
  // once the box is on the page, since that is when its width is known.
  const placeBox = (el: HTMLDivElement | null) => {
    boxRef.current = el;
    if (!el || !hovered) return;
    const width = containerRef.current?.offsetWidth ?? 0;
    const boxWidth = el.offsetWidth;
    const gap = HIT_RADIUS + 4;
    const right = hovered.x + gap;
    const left =
      right + boxWidth <= width ? right : hovered.x - gap - boxWidth;
    el.style.left = `${Math.max(0, Math.min(left, width - boxWidth))}px`;
    el.style.visibility = "visible";
  };

  const renderDot = (color: string, { cx, cy, index, payload }: DotProps) => {
    if (cx == null || cy == null || !payload?.key) return <g key={index} />;
    const point = {
      key: payload.key,
      label: String(payload.label ?? ""),
      x: cx,
      y: cy,
    };
    return (
      <g
        key={index}
        data-trend-dot=""
        data-testid="trend-dot"
        style={{ cursor: "pointer" }}
        onMouseEnter={() => {
          cancelClose();
          if (!pinned) setHovered(point);
        }}
        onMouseLeave={scheduleClose}
        onClick={() => {
          cancelClose();
          setHovered(point);
          setPinned(true);
        }}
      >
        <circle
          cx={cx}
          cy={cy}
          r={DOT_RADIUS}
          fill="var(--background)"
          stroke={color}
          strokeWidth={2}
        />
        <circle cx={cx} cy={cy} r={HIT_RADIUS} fill="transparent" />
      </g>
    );
  };

  const line = (dataKey: "agreement" | "kappa", name: string, color: string) => (
    <Line
      yAxisId={dataKey}
      legendType="plainline"
      type="monotone"
      dataKey={dataKey}
      name={name}
      stroke={color}
      strokeWidth={2}
      dot={(props: DotProps) => renderDot(color, props)}
      activeDot={false}
      isAnimationActive={false}
    />
  );

  return (
    <div ref={containerRef} className="relative w-full h-64 md:h-72">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={data}>
          <CartesianGrid strokeDasharray="3 3" stroke="rgba(125,125,125,0.15)" />
          <XAxis
            dataKey="label"
            tick={(props) => <VersionAxisTick {...props} liveLabels={liveLabels} />}
            padding={{ left: 40, right: 40 }}
            height={30}
          />
          <YAxis
            yAxisId="agreement"
            domain={[0, 100]}
            unit="%"
            fontSize={11}
            tick={TICK}
          />
          <YAxis
            yAxisId="kappa"
            orientation="right"
            domain={kappaDomain}
            fontSize={11}
            tick={TICK}
          />
          <Legend wrapperStyle={{ fontSize: 12 }} />
          {line("agreement", "Agreement", AGREEMENT_COLOR)}
          {line("kappa", "Kappa", KAPPA_COLOR)}
        </LineChart>
      </ResponsiveContainer>
      {hovered && (
        <div
          key={hovered.key}
          ref={placeBox}
          data-testid="trend-hover"
          className="absolute z-10 max-w-full"
          style={{
            top: hovered.y,
            transform: "translateY(-50%)",
            visibility: "hidden",
          }}
          onMouseEnter={cancelClose}
          onMouseLeave={scheduleClose}
        >
          {renderHover(hovered.key, hovered.label)}
        </div>
      )}
    </div>
  );
}
