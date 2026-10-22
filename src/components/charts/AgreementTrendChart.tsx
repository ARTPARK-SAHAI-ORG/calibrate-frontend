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
import { Switch } from "@/components/ui/Switch";
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
  const [overallOn, setOverallOn] = useState(true);
  const hasOverall = !showKappa && lines.some((line) => line.overall);
  const showOverall = hasOverall && overallOn;
  return (
    <div>
      {(hasKappa || hasOverall) && (
        <div className="flex items-center justify-between gap-3 flex-wrap mb-3">
          {hasKappa ? (
            <SegmentedFilter
              value={view}
              onChange={setView}
              options={[
                { value: "agreement", label: "Agreement" },
                { value: "kappa", label: "Kappa" },
              ]}
              ariaLabel="Show agreement or kappa"
              className="w-fit"
            />
          ) : (
            <span />
          )}
          {hasOverall && (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Switch
                checked={overallOn}
                onChange={setOverallOn}
                label="Show overall"
              />
              Show overall
            </div>
          )}
        </div>
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
              .filter(
                (line) =>
                  line.kappa === showKappa && (!line.overall || showOverall),
              )
              .map((line) => {
                // Evaluator lines fade while the overall lines are drawn.
                const opacity = showOverall && !line.overall ? 0.35 : 1;
                return (
                  <Line
                    key={line.dataKey}
                    legendType="plainline"
                    type="monotone"
                    dataKey={line.dataKey}
                    name={line.name}
                    stroke={line.color}
                    strokeWidth={line.overall ? 3.5 : 2}
                    strokeDasharray={line.dashed ? "6 4" : undefined}
                    strokeOpacity={opacity}
                    dot={{
                      r: dotRadius,
                      fill: "var(--background)",
                      strokeOpacity: opacity,
                    }}
                  />
                );
              })}
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
