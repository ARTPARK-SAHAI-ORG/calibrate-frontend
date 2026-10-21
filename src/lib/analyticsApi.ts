import { apiGet } from "@/lib/api";

/** Every kind of work the analytics page counts or lists. */
export type AnalyticsKind =
  | "test_run"
  | "model_comparison"
  | "simulation"
  | "stt"
  | "tts"
  | "labelling_evaluator_run"
  | "trace_scoring"
  | "trace";

export type AnalyticsActivity = {
  new_users: number;
  active_workspaces: number;
  evaluations: number;
  failed_evaluations: number;
  test_runs: number;
  model_comparisons: number;
  simulations: number;
  stt: number;
  tts: number;
  labelling_evaluator_runs: number;
  /** US dollars, or null when nothing in the dates has a cost. */
  cost: number | null;
  traces_received: number;
  traces_scored: number;
  labelling_jobs_finished: number;
  labels_collected: number;
  items_labelled: number;
  limit_hits: number;
};

export type AnalyticsDay = {
  date: string;
  new_users: number;
  active_workspaces: number;
  test_runs: number;
  model_comparisons: number;
  simulations: number;
  stt: number;
  tts: number;
  labelling_evaluator_runs: number;
  failed_evaluations: number;
  traces_received: number;
  traces_scored: number;
  labels_collected: number;
  labelling_jobs_finished: number;
};

export type AnalyticsWorkspaceRow = Omit<
  AnalyticsActivity,
  "new_users" | "active_workspaces"
> & {
  org_uuid: string;
  name: string;
  is_personal: boolean;
  members: number;
  last_active_at: string | null;
};

export type AnalyticsFailure = {
  id: string;
  created_at: string;
  org_uuid: string;
  org_name: string;
  kind: AnalyticsKind;
  error: string | null;
};

export type AnalyticsLimitName =
  | "max_rows_per_eval"
  | "max_traces"
  | "max_scored_traces";

export type AnalyticsLimitHit = {
  created_at: string;
  org_uuid: string;
  org_name: string;
  limit_name: AnalyticsLimitName;
  kind: AnalyticsKind | null;
  requested: number | null;
  cap: number | null;
};

export type AnalyticsResponse = {
  totals: { users: number; workspaces: number; evaluations_running: number };
  activity: AnalyticsActivity;
  /** The same number of days just before `start`; null for all time. */
  previous: AnalyticsActivity | null;
  per_day: AnalyticsDay[];
  workspaces: AnalyticsWorkspaceRow[];
  failures: AnalyticsFailure[];
  failures_total: number;
  limit_hits: AnalyticsLimitHit[];
  limit_hits_total: number;
};

export type AnalyticsQuery = {
  /** `YYYY-MM-DD`, left out for all time. */
  start?: string;
  /** `YYYY-MM-DD`, inclusive. */
  end?: string;
  tzOffsetMinutes: number;
};

export async function fetchAnalytics(
  accessToken: string,
  { start, end, tzOffsetMinutes }: AnalyticsQuery,
): Promise<AnalyticsResponse> {
  const params = new URLSearchParams();
  if (start) params.set("start", start);
  if (end) params.set("end", end);
  params.set("tz_offset_minutes", String(tzOffsetMinutes));
  return apiGet<AnalyticsResponse>(`/admin/analytics?${params}`, accessToken);
}
