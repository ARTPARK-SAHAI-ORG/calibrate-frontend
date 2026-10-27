"use client";

import {
  useEffect,
  useRef,
  useState,
  type ComponentProps,
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
import { buildTrendChart, type TrendSeries } from "@/lib/agreementKappa";

const TICK = { fill: "var(--muted-foreground)" };

/** The hover box for one point: its label as a small heading over whatever
 * the page draws for that point, in the same box as the agreement cards. */
export function TrendHoverBox({
  label,
  children,
}: {
  label: ReactNode;
  children: ReactNode;
}) {
  return (
    <div className="border border-border rounded-lg p-4 bg-background min-w-[260px] shadow-sm">
      <div className="text-xs font-medium text-muted-foreground mb-2.5">
        {label}
      </div>
      {children}
    </div>
  );
}

type HoveredPoint = {
  key: string;
  label: string;
  x: number;
  y: number;
  /** The box goes on the right of the point unless that runs out of room. */
  onRight: boolean;
};

type DotProps = {
  cx?: number;
  cy?: number;
  index?: number;
  payload?: { key?: string; label?: string };
};

/** How long the hover box waits after the mouse leaves the point and the
 * box before closing, so the mouse can cross from one to the other. */
const CLOSE_DELAY_MS = 200;
const HIT_RADIUS = 10;

/**
 * Agreement and kappa over time on one chart: agreement on the left axis as
 * a percentage, kappa on its own axis on the right. Hovering a point opens
 * the page's box for it beside the point; the box takes the mouse, so its
 * own hover text can be read, and clicking a point keeps it open until a
 * click elsewhere or Escape.
 */
export function AgreementTrendChart({
  series,
  className = "w-full h-56 md:h-64",
  xAxisProps = { fontSize: 11 },
  dotRadius = 3,
  renderHover,
}: {
  series: TrendSeries[];
  className?: string;
  xAxisProps?: Omit<ComponentProps<typeof XAxis>, "dataKey">;
  dotRadius?: number;
  /** Draws the hover box for a point, given the point's `key` and label. */
  renderHover: (pointKey: string, label: string) => ReactNode;
}) {
  const { data, lines, kappaDomain } = buildTrendChart(series);
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

  const renderDot = (color: string, { cx, cy, index, payload }: DotProps) => {
    if (cx == null || cy == null || !payload?.key) return <g key={index} />;
    const key = payload.key;
    const point = () => ({
      key,
      label: String(payload.label ?? ""),
      x: cx,
      y: cy,
      onRight: cx < (containerRef.current?.offsetWidth ?? 0) / 2,
    });
    return (
      <g
        key={index}
        data-trend-dot=""
        data-testid="trend-dot"
        style={{ cursor: "pointer" }}
        onMouseEnter={() => {
          cancelClose();
          if (!pinned) setHovered(point());
        }}
        onMouseLeave={scheduleClose}
        onClick={() => {
          cancelClose();
          setHovered(point());
          setPinned(true);
        }}
      >
        <circle
          cx={cx}
          cy={cy}
          r={dotRadius}
          fill="var(--background)"
          stroke={color}
          strokeWidth={2}
        />
        <circle cx={cx} cy={cy} r={HIT_RADIUS} fill="transparent" />
      </g>
    );
  };

  return (
    <div ref={containerRef} className={`relative ${className}`}>
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={data}>
          <CartesianGrid strokeDasharray="3 3" stroke="rgba(125,125,125,0.15)" />
          <XAxis dataKey="label" tick={TICK} {...xAxisProps} />
          <YAxis
            yAxisId="main"
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
          {lines.map((line) => (
            <Line
              key={line.dataKey}
              yAxisId={line.kappa ? "kappa" : "main"}
              legendType="plainline"
              type="monotone"
              dataKey={line.dataKey}
              name={line.name}
              stroke={line.color}
              strokeWidth={2}
              dot={(props: DotProps) => renderDot(line.color, props)}
              activeDot={false}
              isAnimationActive={false}
            />
          ))}
        </LineChart>
      </ResponsiveContainer>
      {hovered && (
        <div
          ref={boxRef}
          data-testid="trend-hover"
          className="absolute z-10"
          style={{
            left: hovered.onRight
              ? hovered.x + HIT_RADIUS + 4
              : hovered.x - HIT_RADIUS - 4,
            top: hovered.y,
            transform: hovered.onRight
              ? "translateY(-50%)"
              : "translate(-100%, -50%)",
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
