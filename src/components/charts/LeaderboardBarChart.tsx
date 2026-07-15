"use client";

import { useRef, useCallback } from "react";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Cell,
  LabelList,
} from "recharts";
import { downloadChartPng } from "./downloadChart";

// Pastel color palette for chart bars
export const pastelColors = [
  "#A8D5E2", // Light blue
  "#F4A5AE", // Light pink
  "#B5E5CF", // Light green
  "#FFD3A5", // Light orange
  "#C7B9FF", // Light purple
  "#FFE5B4", // Light peach
  "#B8E6B8", // Light mint
  "#E6B8E6", // Light lavender
  "#B8D4E6", // Light sky blue
  "#FFB8D4", // Light rose
];

// Generate color mapping for items
export const getColorMap = (items: string[]): Map<string, string> => {
  const colorMap = new Map<string, string>();
  items.forEach((item, index) => {
    colorMap.set(item, pastelColors[index % pastelColors.length]);
  });
  return colorMap;
};

type ChartDataItem = {
  label: string;
  value: number;
  colorKey?: string;
};

type LeaderboardBarChartProps = {
  title: string;
  data: ChartDataItem[];
  height?: number;
  yDomain?: [number, number];
  formatTooltip?: (value: number) => string;
  yTickFormatter?: (value: number) => string;
  colorMap?: Map<string, string>;
  filename?: string;
};

export function LeaderboardBarChart({
  title,
  data,
  height = 300,
  yDomain,
  formatTooltip,
  yTickFormatter,
  colorMap,
  filename,
}: LeaderboardBarChartProps) {
  const chartRef = useRef<HTMLDivElement>(null);

  // Generate color map from data if not provided
  const colors =
    colorMap || getColorMap(data.map((d) => d.colorKey || d.label));

  const defaultTooltipFormatter = (value: number) =>
    parseFloat(value.toFixed(5)).toString();

  // Value labels reuse the tooltip formatter so 0 (a perfect error rate) and
  // small differences stay readable even when the bars are tiny or identical —
  // a zero bar would otherwise draw nothing and the chart would look empty.
  const formatBarLabel = (value: unknown) =>
    typeof value === "number"
      ? (formatTooltip || defaultTooltipFormatter)(value)
      : "";

  const downloadChart = useCallback(() => {
    downloadChartPng(chartRef.current, title, filename);
  }, [title, filename]);

  return (
    <div className="border rounded-xl p-4 bg-muted/10">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-[15px] font-semibold">{title}</h3>
        <button
          onClick={downloadChart}
          className="flex items-center gap-1.5 px-2 py-1 text-xs font-medium text-muted-foreground hover:text-foreground border border-border rounded-md hover:bg-muted/50 transition-colors cursor-pointer"
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
      <div ref={chartRef}>
        <ResponsiveContainer width="100%" height={height}>
          <BarChart
            data={data.map((d) => ({
              label: d.label,
              value: d.value,
            }))}
            margin={{
              top: 24,
              right: 30,
              left: 20,
              bottom: 40,
            }}
          >
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis
              dataKey="label"
              tick={{
                fontSize: 13,
                fill: "currentColor",
                fontWeight: 500,
              }}
              angle={-45}
              textAnchor="end"
              height={60}
            />
            <YAxis tick={{ fontSize: 12 }} domain={yDomain} tickFormatter={yTickFormatter} />
            <Tooltip
              formatter={(value: any) =>
                typeof value === "number"
                  ? (formatTooltip || defaultTooltipFormatter)(value)
                  : value
              }
            />
            {/* `minPointSize` keeps a thin sliver visible for zero / near-zero
                values (e.g. a perfect 0 error rate) so the chart never looks
                empty; the label prints the exact value above each bar. */}
            <Bar dataKey="value" minPointSize={3}>
              <LabelList
                dataKey="value"
                position="top"
                formatter={formatBarLabel}
                style={{ fontSize: 11, fill: "currentColor" }}
              />
              {data.map((entry, index) => (
                <Cell
                  key={`cell-${index}`}
                  fill={colors.get(entry.colorKey || entry.label) || "#A8D5E2"}
                />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
