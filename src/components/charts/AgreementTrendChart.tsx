"use client";

import { useState, type ComponentProps } from "react";
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

export function AgreementTrendChart({
  series,
  className = "w-full h-56 md:h-64",
  xAxisProps = { fontSize: 11 },
  dotRadius = 3,
}: {
  series: TrendSeries[];
  className?: string;
  xAxisProps?: Omit<ComponentProps<typeof XAxis>, "dataKey">;
  dotRadius?: number;
}) {
  const [view, setView] = useState<"agreement" | "kappa">("agreement");
  const { data, lines, kappaDomain } = buildTrendChart(series);
  const hasKappa = lines.some((line) => line.kappa);
  const showKappa = hasKappa && view === "kappa";
  return (
    <div>
      {hasKappa && (
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
              domain={showKappa ? kappaDomain : [0, 100]}
              unit={showKappa ? undefined : "%"}
              fontSize={11}
              tick={TICK}
            />
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
            <Legend wrapperStyle={{ fontSize: 12 }} />
            {lines
              .filter((line) => line.kappa === showKappa)
              .map((line) => (
                <Line
                  key={line.dataKey}
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
