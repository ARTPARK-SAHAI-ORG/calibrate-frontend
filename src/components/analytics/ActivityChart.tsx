"use client";

import { useEffect, useState } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { AnalyticsDay } from "@/lib/analyticsApi";

type View = "evaluations" | "traces" | "labelling" | "users";

const VIEWS: Record<
  View,
  { button: string; title: string; stacked: boolean; series: [keyof AnalyticsDay, string][] }
> = {
  evaluations: {
    button: "Evaluations",
    title: "Evaluations per day",
    stacked: true,
    series: [
      ["test_runs", "Test runs"],
      ["model_comparisons", "Model comparisons"],
      ["simulations", "Simulations"],
      ["stt", "Speech to text"],
      ["tts", "Text to speech"],
      ["labelling_evaluator_runs", "Evaluator runs on labelling items"],
    ],
  },
  traces: {
    button: "Traces",
    title: "Traces per day",
    stacked: false,
    series: [
      ["traces_received", "Traces received"],
      ["traces_scored", "Traces scored"],
    ],
  },
  labelling: {
    button: "Labelling",
    title: "Labelling per day",
    stacked: false,
    series: [
      ["labels_collected", "Labels collected"],
      ["labelling_jobs_finished", "Labelling jobs finished"],
    ],
  },
  users: {
    button: "Users",
    title: "Workspaces and users per day",
    stacked: false,
    series: [
      ["new_users", "New users"],
      ["active_workspaces", "Active workspaces"],
    ],
  },
};

// Series colours in order, one set per theme. Checked to stay apart for
// colour-blind readers in both.
// The chart is drawn in SVG, whose colour attributes cannot read the app's
// CSS colour names, so the axis and grid colours repeat them here.
const THEMES = {
  light: {
    series: ["#2a78d6", "#eb6834", "#1baf7a", "#eda100", "#e87ba4", "#008300"],
    axis: "#737373",
    grid: "#e5e5e5",
    hover: "#f5f5f5",
  },
  dark: {
    series: ["#3987e5", "#d95926", "#199e70", "#c98500", "#d55181", "#008300"],
    axis: "#a3a3a3",
    grid: "#262626",
    hover: "#1a1a1a",
  },
};

/** True while the app is in dark mode, following theme changes. */
export function useIsDarkTheme(): boolean {
  const [dark, setDark] = useState(false);
  useEffect(() => {
    const root = document.documentElement;
    const read = () => setDark(root.classList.contains("dark"));
    read();
    const observer = new MutationObserver(read);
    observer.observe(root, { attributes: true, attributeFilter: ["class"] });
    return () => observer.disconnect();
  }, []);
  return dark;
}

/** "2026-10-01" as "Oct 1", read as a local calendar day. */
export function shortDay(date: string): string {
  const [y, m, d] = date.split("-").map(Number);
  return new Date(y, m - 1, d).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
  });
}

export function ActivityChart({ days }: { days: AnalyticsDay[] }) {
  const [view, setView] = useState<View>("evaluations");
  const spec = VIEWS[view];
  const theme = THEMES[useIsDarkTheme() ? "dark" : "light"];
  const empty = !days.some((day) =>
    spec.series.some(([key]) => Number(day[key]) > 0),
  );

  return (
    <div className="border rounded-xl p-4 bg-muted/10 space-y-4">
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
        <h3 className="text-[15px] font-semibold">{spec.title}</h3>
        <div role="group" aria-label="What the chart shows" className="flex flex-wrap gap-1">
          {(Object.keys(VIEWS) as View[]).map((key) => (
            <button
              key={key}
              type="button"
              aria-pressed={view === key}
              onClick={() => setView(key)}
              className={`h-8 px-3 rounded-md text-[13px] font-medium transition-colors cursor-pointer ${
                view === key
                  ? "bg-foreground text-background"
                  : "border border-border bg-background text-muted-foreground hover:text-foreground hover:bg-accent"
              }`}
            >
              {VIEWS[key].button}
            </button>
          ))}
        </div>
      </div>
      {empty ? (
        <p className="py-16 text-center text-[13px] text-muted-foreground">
          Nothing happened in these dates
        </p>
      ) : (
        <ResponsiveContainer width="100%" height={300}>
          <BarChart data={days} margin={{ top: 8, right: 16, left: 0, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke={theme.grid} vertical={false} />
            <XAxis
              dataKey="date"
              tickFormatter={shortDay}
              tick={{ fontSize: 12, fill: theme.axis }}
              stroke={theme.grid}
            />
            <YAxis
              allowDecimals={false}
              tick={{ fontSize: 12, fill: theme.axis }}
              stroke={theme.grid}
            />
            <Tooltip
              labelFormatter={(label) => shortDay(String(label))}
              cursor={{ fill: theme.hover }}
              contentStyle={{
                background: "var(--popover)",
                border: "1px solid var(--border)",
                borderRadius: 8,
                fontSize: 13,
              }}
              labelStyle={{ color: "var(--foreground)", fontWeight: 600 }}
              itemStyle={{ color: "var(--foreground)" }}
            />
            {/* The swatch carries the colour; the words stay in the text colour. */}
            <Legend
              wrapperStyle={{ fontSize: 13 }}
              formatter={(value) => (
                <span style={{ color: "var(--foreground)" }}>{value}</span>
              )}
            />
            {spec.series.map(([key, label], i) => (
              <Bar
                key={key}
                dataKey={key}
                name={label}
                stackId={spec.stacked ? "all" : undefined}
                fill={theme.series[i]}
              />
            ))}
          </BarChart>
        </ResponsiveContainer>
      )}
    </div>
  );
}
