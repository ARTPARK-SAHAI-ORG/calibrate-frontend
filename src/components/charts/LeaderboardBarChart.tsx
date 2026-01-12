"use client";

import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Cell,
} from "recharts";

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
  colorMap?: Map<string, string>;
};

export function LeaderboardBarChart({
  title,
  data,
  height = 300,
  yDomain,
  formatTooltip,
  colorMap,
}: LeaderboardBarChartProps) {
  // Generate color map from data if not provided
  const colors =
    colorMap ||
    getColorMap(data.map((d) => d.colorKey || d.label));

  const defaultTooltipFormatter = (value: number) =>
    parseFloat(value.toFixed(5)).toString();

  return (
    <div className="border rounded-xl p-4 bg-muted/10">
      <h3 className="text-[15px] font-semibold mb-4">{title}</h3>
      <ResponsiveContainer width="100%" height={height}>
        <BarChart
          data={data.map((d) => ({
            label: d.label,
            value: d.value,
          }))}
          margin={{
            top: 5,
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
          <YAxis tick={{ fontSize: 12 }} domain={yDomain} />
          <Tooltip
            formatter={(value: any) =>
              typeof value === "number"
                ? (formatTooltip || defaultTooltipFormatter)(value)
                : value
            }
          />
          <Bar dataKey="value">
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
  );
}
