"use client";

import { useState, type ComponentProps, type ReactNode } from "react";
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
import { SegmentedFilter } from "@/components/ui";
import {
  buildTrendChart,
  formatTrendValue,
  type TrendSeries,
} from "@/lib/agreementKappa";

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
    <div className="border border-border rounded-lg px-4 py-3 bg-background min-w-[180px] shadow-sm">
      <div className="text-xs font-medium text-muted-foreground mb-1">
        {label}
      </div>
      {children}
    </div>
  );
}

export function AgreementTrendChart({
  series,
  className = "w-full h-56 md:h-64",
  xAxisProps = { fontSize: 11 },
  dotRadius = 3,
  bothAxes = false,
  renderHover,
}: {
  series: TrendSeries[];
  className?: string;
  xAxisProps?: Omit<ComponentProps<typeof XAxis>, "dataKey">;
  dotRadius?: number;
  /** Draw agreement and kappa together, agreement on the left axis and
   * kappa on its own axis on the right, with no switch between them. */
  bothAxes?: boolean;
  /** Draws the hover box for a point, given the point's `key` and label. */
  renderHover?: (pointKey: string, label: string) => ReactNode;
}) {
  const [view, setView] = useState<"agreement" | "kappa">("agreement");
  const { data, lines, kappaDomain } = buildTrendChart(series);
  const hasKappa = lines.some((line) => line.kappa);
  const showKappa = !bothAxes && hasKappa && view === "kappa";
  return (
    <div>
      {hasKappa && !bothAxes && (
        <SegmentedFilter
          value={view}
          onChange={setView}
          options={[
            { value: "agreement", label: "Agreement" },
            { value: "kappa", label: "Kappa" },
          ]}
          ariaLabel="Show agreement or kappa"
          className="w-fit mb-3"
        />
      )}
      <div className={className}>
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={data}>
            <CartesianGrid
              strokeDasharray="3 3"
              stroke="rgba(125,125,125,0.15)"
            />
            <XAxis dataKey="label" tick={TICK} {...xAxisProps} />
            <YAxis
              yAxisId="main"
              domain={showKappa ? kappaDomain : [0, 100]}
              unit={showKappa ? undefined : "%"}
              fontSize={11}
              tick={TICK}
            />
            {bothAxes && (
              <YAxis
                yAxisId="kappa"
                orientation="right"
                domain={kappaDomain}
                fontSize={11}
                tick={TICK}
              />
            )}
            {renderHover ? (
              <Tooltip
                content={({ active, payload, label }) => {
                  const row = payload?.[0]?.payload as
                    | { key?: string }
                    | undefined;
                  if (!active || !row?.key) return null;
                  return renderHover(row.key, String(label ?? ""));
                }}
              />
            ) : (
              <Tooltip
                contentStyle={{
                  background: "var(--popover)",
                  border: "1px solid var(--border)",
                  borderRadius: 8,
                  fontSize: 12,
                }}
                labelStyle={{ color: "var(--foreground)" }}
                formatter={(value, _name, item) =>
                  formatTrendValue(value, item?.dataKey)
                }
              />
            )}
            <Legend wrapperStyle={{ fontSize: 12 }} />
            {lines
              .filter((line) => bothAxes || line.kappa === showKappa)
              .map((line) => (
                <Line
                  key={line.dataKey}
                  yAxisId={bothAxes && line.kappa ? "kappa" : "main"}
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
    </div>
  );
}
