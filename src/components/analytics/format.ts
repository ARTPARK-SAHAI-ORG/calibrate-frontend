import type { AnalyticsActivity, AnalyticsKind, AnalyticsLimitName } from "@/lib/analyticsApi";

export const KIND_LABELS: Record<AnalyticsKind, string> = {
  test_run: "Test run",
  model_comparison: "Model comparison",
  simulation: "Simulation",
  stt: "Speech to text",
  tts: "Text to speech",
  labelling_evaluator_run: "Evaluator run on labelling items",
  trace_scoring: "Trace scoring",
  trace: "Trace",
};

export function kindLabel(kind: AnalyticsKind | null): string {
  return kind ? (KIND_LABELS[kind] ?? kind) : "Not known";
}

export const LIMIT_LABELS: Record<AnalyticsLimitName, string> = {
  max_rows_per_eval: "Too many rows in one evaluation",
  max_traces: "Trace cap reached",
  max_scored_traces: "Trace scoring limit reached",
};

export function formatCount(value: number): string {
  return value.toLocaleString("en-US");
}

export function formatCost(value: number | null): string {
  if (value === null) return "None";
  // A fraction of a cent would round to $0.00 and read as nothing spent.
  const small = value > 0 && value < 0.01;
  return value.toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
    ...(small ? { maximumSignificantDigits: 2 } : {}),
  });
}

/**
 * The backend writes times without a time zone when it means UTC
 * ("2026-10-01 12:00:00"). Read those as UTC so the reader sees their own
 * local time, not UTC labelled as local.
 */
export function formatWhen(value: string | null): string {
  if (!value) return "Never";
  const hasZone = /(Z|[+-]\d{2}:?\d{2})$/.test(value);
  const date = new Date(hasZone ? value : `${value.replace(" ", "T")}Z`);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

/** A local calendar day as `YYYY-MM-DD`. */
export function toDateInput(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

export type RangePreset = "7" | "30" | "90" | "all" | "custom";

export const RANGE_OPTIONS: { value: RangePreset; label: string }[] = [
  { value: "7", label: "Last 7 days" },
  { value: "30", label: "Last 30 days" },
  { value: "90", label: "Last 90 days" },
  { value: "all", label: "All time" },
  { value: "custom", label: "Custom dates" },
];

/** The first day of the last `days` days, today included. */
export function daysAgoStart(days: number, today: Date): string {
  const start = new Date(today);
  start.setDate(start.getDate() - (days - 1));
  return toDateInput(start);
}

/**
 * The words after the change percentage, or null when there is nothing to
 * compare against.
 */
export function previousPeriodLabel(preset: RangePreset): string | null {
  if (preset === "all") return null;
  if (preset === "custom") return "vs previous period";
  return `vs previous ${preset} days`;
}

/**
 * The change against the previous period, or null when it cannot be worked
 * out (no previous period, or nothing happened in it).
 */
export function percentChange(current: number, previous: number): number | null {
  if (!previous) return null;
  return Math.round(((current - previous) / previous) * 100);
}

export type CardSpec = {
  key: keyof AnalyticsActivity;
  label: string;
  /** More of this is bad news, so a rise reads red. */
  higherIsWorse?: boolean;
  note?: string;
};

export const CARD_GROUPS: { label: string; cards: CardSpec[] }[] = [
  {
    label: "Users",
    cards: [
      { key: "new_users", label: "New users" },
      { key: "active_workspaces", label: "Active workspaces" },
    ],
  },
  {
    label: "Evaluations",
    cards: [
      { key: "evaluations", label: "All evaluations" },
      { key: "failed_evaluations", label: "Failed evaluations", higherIsWorse: true },
      { key: "test_runs", label: "Test runs" },
      { key: "model_comparisons", label: "Model comparisons" },
      { key: "simulations", label: "Simulations" },
      { key: "stt", label: "Speech to text" },
      { key: "tts", label: "Text to speech" },
      { key: "labelling_evaluator_runs", label: "Evaluator runs on labelling items" },
      { key: "cost", label: "Cost", note: "Test runs and model comparisons only" },
    ],
  },
  {
    label: "Traces and labelling",
    cards: [
      { key: "traces_received", label: "Traces received" },
      { key: "traces_scored", label: "Traces scored" },
      { key: "labelling_jobs_finished", label: "Labelling jobs finished" },
      { key: "labels_collected", label: "Labels collected" },
      { key: "items_labelled", label: "Items labelled" },
    ],
  },
  { label: "Limits", cards: [{ key: "limit_hits", label: "Limit hits", higherIsWorse: true }] },
];
