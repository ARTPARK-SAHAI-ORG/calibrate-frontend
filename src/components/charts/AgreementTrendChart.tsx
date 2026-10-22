"use client";

import type { ComponentProps } from "react";
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
import {
  buildTrendChart,
  formatTrendValue,
  type TrendSeries,
} from "@/lib/agreementKappa";

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
  const { data, lines, kappaDomain } = buildTrendChart(series);
  const hasKappa = lines.some((line) => line.kappa);
  return (
    <div className={className}>
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={data}>
          <CartesianGrid
            strokeDasharray="3 3"
            stroke="rgba(125,125,125,0.15)"
          />
          <XAxis dataKey="label" {...xAxisProps} />
          <YAxis yAxisId="agreement" domain={[0, 100]} fontSize={11} unit="%" />
          {hasKappa && (
            <YAxis
              yAxisId="kappa"
              orientation="right"
              domain={kappaDomain}
              fontSize={11}
            />
          )}
          <Tooltip
            contentStyle={{
              background: "var(--background, #fff)",
              border: "1px solid rgba(125,125,125,0.2)",
              borderRadius: 8,
              fontSize: 12,
            }}
            formatter={(value, _name, item) =>
              formatTrendValue(value, item?.dataKey)
            }
          />
          <Legend wrapperStyle={{ fontSize: 12 }} />
          {lines.map((line) => (
            <Line
              key={line.dataKey}
              yAxisId={line.kappa ? "kappa" : "agreement"}
              legendType="plainline"
              type="monotone"
              dataKey={line.dataKey}
              name={line.name}
              stroke={line.color}
              strokeWidth={2}
              strokeDasharray={line.kappa ? "5 4" : undefined}
              dot={{ r: dotRadius }}
              connectNulls={false}
            />
          ))}
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
