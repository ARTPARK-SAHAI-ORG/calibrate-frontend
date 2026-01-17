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
  filename?: string;
};

export function LeaderboardBarChart({
  title,
  data,
  height = 300,
  yDomain,
  formatTooltip,
  colorMap,
  filename,
}: LeaderboardBarChartProps) {
  const chartRef = useRef<HTMLDivElement>(null);

  // Generate color map from data if not provided
  const colors =
    colorMap || getColorMap(data.map((d) => d.colorKey || d.label));

  const defaultTooltipFormatter = (value: number) =>
    parseFloat(value.toFixed(5)).toString();

  const downloadChart = useCallback(async () => {
    if (!chartRef.current) return;

    const svgElement = chartRef.current.querySelector("svg");
    if (!svgElement) return;

    // Clone the SVG to avoid modifying the original
    const clonedSvg = svgElement.cloneNode(true) as SVGElement;

    // Get computed styles and dimensions
    const svgRect = svgElement.getBoundingClientRect();
    clonedSvg.setAttribute("width", String(svgRect.width));
    clonedSvg.setAttribute("height", String(svgRect.height));

    // Add white background
    const bgRect = document.createElementNS(
      "http://www.w3.org/2000/svg",
      "rect"
    );
    bgRect.setAttribute("width", "100%");
    bgRect.setAttribute("height", "100%");
    bgRect.setAttribute("fill", "white");
    clonedSvg.insertBefore(bgRect, clonedSvg.firstChild);

    // Convert SVG to data URL
    const svgData = new XMLSerializer().serializeToString(clonedSvg);
    const svgBlob = new Blob([svgData], {
      type: "image/svg+xml;charset=utf-8",
    });
    const svgUrl = URL.createObjectURL(svgBlob);

    // Create canvas and draw image
    const canvas = document.createElement("canvas");
    const ctx = canvas.getContext("2d");
    const img = new Image();

    img.onload = () => {
      canvas.width = svgRect.width * 2; // 2x for better quality
      canvas.height = svgRect.height * 2;
      ctx?.scale(2, 2);
      ctx?.drawImage(img, 0, 0);
      URL.revokeObjectURL(svgUrl);

      // Download as PNG
      const pngUrl = canvas.toDataURL("image/png");
      const downloadLink = document.createElement("a");
      downloadLink.href = pngUrl;
      downloadLink.download = `${
        filename || title.toLowerCase().replace(/\s+/g, "-")
      }.png`;
      document.body.appendChild(downloadLink);
      downloadLink.click();
      document.body.removeChild(downloadLink);
    };

    img.src = svgUrl;
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
    </div>
  );
}
