"use client";

import type { ComponentProps, ReactNode } from "react";
import {
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
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

/**
 * Agreement and kappa over time on one chart: agreement on the left axis as
 * a percentage, kappa on its own axis on the right. The page draws the hover
 * box for each point.
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
  return (
    <div className={className}>
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
          <Tooltip
            content={({ active, payload, label }) => {
              const row = payload?.[0]?.payload as { key?: string } | undefined;
              if (!active || !row?.key) return null;
              return renderHover(row.key, String(label ?? ""));
            }}
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
              dot={{ r: dotRadius, fill: "var(--background)" }}
            />
          ))}
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
