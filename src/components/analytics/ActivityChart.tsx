"use client";

import { useState } from "react";
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
import { pastelColors } from "@/components/charts/LeaderboardBarChart";

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
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis dataKey="date" tickFormatter={shortDay} tick={{ fontSize: 12 }} />
            <YAxis allowDecimals={false} tick={{ fontSize: 12 }} />
            <Tooltip labelFormatter={(label) => shortDay(String(label))} />
            <Legend wrapperStyle={{ fontSize: 12 }} />
            {spec.series.map(([key, label], i) => (
              <Bar
                key={key}
                dataKey={key}
                name={label}
                stackId={spec.stacked ? "all" : undefined}
                fill={pastelColors[i % pastelColors.length]}
              />
            ))}
          </BarChart>
        </ResponsiveContainer>
      )}
    </div>
  );
}
