"use client";

import { Suspense, useCallback, useEffect, useState } from "react";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { AppLayout } from "@/components/AppLayout";
import { EmptyState } from "@/components/ui/LoadingState";
import { useAccessToken } from "@/hooks";
import { apiClient } from "@/lib/api";
import { useSidebarState } from "@/lib/sidebar";

type Tab = "overview" | "jobs";

const TABS: Tab[] = ["overview", "jobs"];

function isTab(value: string | null): value is Tab {
  return !!value && (TABS as string[]).includes(value);
}

type Annotator = {
  uuid: string;
  name: string;
  created_at?: string;
  updated_at?: string;
};

type AnnotatorStats = {
  current_agreement: number | null;
  pair_count: number;
  jobs_count: number;
};

type Bucket = "week" | "month" | "year";

type AgreementSeriesPoint = {
  bucket_start: string;
  bucket_end: string;
  agreement: number | null;
  pair_count: number;
};

type AnnotatorTrend = {
  bucket: Bucket;
  days: number;
  series: AgreementSeriesPoint[];
};

type AnnotatorJob = {
  uuid: string;
  task_id: string;
  task_name: string;
  public_token: string;
  status: "pending" | "in_progress" | "completed";
  created_at: string;
  completed_at: string | null;
  item_count: number;
  completed_item_count: number;
};

type AnnotatorDetailResponse = {
  annotator: Annotator;
  stats: AnnotatorStats;
  trend: AnnotatorTrend;
  jobs: AnnotatorJob[];
};

const DEFAULT_BUCKET: Bucket = "month";
const DEFAULT_DAYS = 365;

function formatBucketLabel(iso: string, bucket: Bucket): string {
  const d = new Date(iso.replace(" ", "T") + "Z");
  if (Number.isNaN(d.getTime())) return iso;
  if (bucket === "year") return d.getUTCFullYear().toString();
  return d.toLocaleString("en-US", { month: "short", timeZone: "UTC" });
}

function parseApiError(err: unknown, fallback: string): string {
  if (!(err instanceof Error)) return fallback;
  const match = err.message.match(/Request failed: \d+ - (.+)$/);
  if (match) {
    try {
      const parsed = JSON.parse(match[1]);
      if (parsed && typeof parsed.detail === "string") return parsed.detail;
    } catch {
      // not JSON
    }
    return match[1];
  }
  return err.message || fallback;
}

export default function AnnotatorDetailPage() {
  return (
    <Suspense fallback={null}>
      <AnnotatorDetailPageInner />
    </Suspense>
  );
}

function AnnotatorDetailPageInner() {
  const router = useRouter();
  const params = useParams();
  const searchParams = useSearchParams();
  const accessToken = useAccessToken();
  const [sidebarOpen, setSidebarOpen] = useSidebarState();

  const uuid = typeof params?.uuid === "string" ? params.uuid : "";

  const initialTab = searchParams.get("tab");
  const [activeTab, setActiveTab] = useState<Tab>(
    isTab(initialTab) ? initialTab : "overview",
  );

  const handleTabChange = useCallback(
    (tab: Tab) => {
      setActiveTab(tab);
      window.history.replaceState(
        null,
        "",
        `/human-alignment/annotators/${uuid}?tab=${tab}`,
      );
    },
    [uuid],
  );

  const [detail, setDetail] = useState<AnnotatorDetailResponse | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailError, setDetailError] = useState<string | null>(null);
  /** False until the first detail request for this annotator finishes (avoids agreement empty-state flash). */
  const [detailFetchCompleted, setDetailFetchCompleted] = useState(false);

  useEffect(() => {
    setDetailFetchCompleted(false);
    setDetail(null);
  }, [uuid]);

  const annotator = detail?.annotator ?? null;
  const stats = detail?.stats;
  const trend = detail?.trend;
  const jobs = detail?.jobs ?? [];

  useEffect(() => {
    if (annotator?.name) {
      document.title = `${annotator.name} | Calibrate`;
    }
  }, [annotator?.name]);

  const fetchDetail = useCallback(async () => {
    if (!accessToken || !uuid) return;
    setDetailLoading(true);
    setDetailError(null);
    try {
      const query = `?bucket=${DEFAULT_BUCKET}&days=${DEFAULT_DAYS}`;
      const data = await apiClient<AnnotatorDetailResponse>(
        `/annotators/${uuid}${query}`,
        accessToken,
      );
      setDetail(data);
    } catch (err) {
      setDetailError(parseApiError(err, "Failed to load annotator"));
    } finally {
      setDetailLoading(false);
      setDetailFetchCompleted(true);
    }
  }, [accessToken, uuid]);

  useEffect(() => {
    fetchDetail();
  }, [fetchDetail]);

  const formatPercent = (value: number | null | undefined): string => {
    if (value == null) return "—";
    return `${Math.round(value * 100)}%`;
  };

  const agreementColor = (value: number | null | undefined): string => {
    if (value == null) return "";
    const pct = value * 100;
    if (pct >= 75) return "text-green-600 dark:text-green-400";
    if (pct <= 50) return "text-red-600 dark:text-red-400";
    return "text-yellow-600 dark:text-yellow-400";
  };

  const jobsCount = stats?.jobs_count ?? jobs.length;

  return (
    <AppLayout
      activeItem="human-alignment"
      onItemChange={(id) => router.push(`/${id}`)}
      sidebarOpen={sidebarOpen}
      onSidebarToggle={() => setSidebarOpen(!sidebarOpen)}
    >
      <div className="py-4 md:py-6 space-y-6">
        <button
          onClick={() => router.push("/human-alignment?tab=annotators")}
          className="text-sm text-muted-foreground hover:text-foreground transition-colors cursor-pointer flex items-center gap-1.5"
        >
          <svg
            className="w-4 h-4"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={2}
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M15.75 19.5L8.25 12l7.5-7.5"
            />
          </svg>
          All annotators
        </button>

        {/* Header */}
        <div>
          <h1 className="text-2xl font-semibold">{annotator?.name ?? "—"}</h1>
        </div>

        {/* Tabs */}
        <div className="border-b border-border flex items-center gap-1">
          {[
            { id: "overview" as Tab, label: "Overview" },
            {
              id: "jobs" as Tab,
              label: jobsCount > 0 ? `Jobs (${jobsCount})` : "Jobs",
            },
          ].map((t) => (
            <button
              key={t.id}
              onClick={() => handleTabChange(t.id)}
              className={`px-3 py-2 text-sm font-medium -mb-px border-b-2 transition-colors cursor-pointer ${
                activeTab === t.id
                  ? "border-foreground text-foreground"
                  : "border-transparent text-muted-foreground hover:text-foreground"
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>

        {activeTab === "overview" && (
          <div className="space-y-4 md:space-y-6">
            {detailError && (
              <div className="rounded-md border border-border bg-muted/20 p-4 text-sm text-red-500">
                {detailError}
              </div>
            )}

            {/* Stat cards */}
            <div className="flex flex-wrap items-stretch gap-3">
              <StatCard
                label="Latest agreement"
                value={
                  detailLoading ? "—" : formatPercent(stats?.current_agreement)
                }
                valueClassName={agreementColor(stats?.current_agreement)}
              />
              <StatCard
                label="Jobs"
                value={detailLoading ? "—" : String(jobsCount)}
              />
            </div>

            {/* Trend chart */}
            {(() => {
              const series = trend?.series ?? [];
              const hasTrend =
                !detailLoading &&
                detailFetchCompleted &&
                series.length > 0 &&
                series.some((p) => p.agreement != null);
              return (
                <div className="border border-border rounded-xl bg-background p-4 md:p-5">
                  <div className="mb-4">
                    <h3 className="text-sm font-semibold">
                      Agreement with other annotators
                    </h3>
                    <p className="text-xs text-muted-foreground">
                      Monthly % of overlapping rows where this annotator agreed
                      with the others.
                    </p>
                  </div>

                  {detailLoading || !detailFetchCompleted ? (
                    <div className="flex items-center justify-center gap-2 h-56 md:h-64 text-sm text-muted-foreground">
                      <svg
                        className="w-4 h-4 animate-spin"
                        fill="none"
                        viewBox="0 0 24 24"
                      >
                        <circle
                          className="opacity-25"
                          cx="12"
                          cy="12"
                          r="10"
                          stroke="currentColor"
                          strokeWidth="4"
                        />
                        <path
                          className="opacity-75"
                          fill="currentColor"
                          d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                        />
                      </svg>
                      Loading trend
                    </div>
                  ) : !hasTrend ? (
                    <EmptyState
                      icon={
                        <svg
                          className="w-7 h-7 text-muted-foreground"
                          fill="none"
                          viewBox="0 0 24 24"
                          stroke="currentColor"
                          strokeWidth={1.5}
                        >
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            d="M3 13.125C3 12.504 3.504 12 4.125 12h2.25c.621 0 1.125.504 1.125 1.125v6.75C7.5 20.496 6.996 21 6.375 21h-2.25A1.125 1.125 0 013 19.875v-6.75zM9.75 8.625c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125v11.25c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V8.625zM16.5 4.125c0-.621.504-1.125 1.125-1.125h2.25C20.496 3 21 3.504 21 4.125v15.75c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V4.125z"
                          />
                        </svg>
                      }
                      title="Not enough overlap yet"
                      description={
                        <>
                          This chart will populate once this annotator and at
                          <br />
                          least one other annotator label one or more of the
                          same items
                        </>
                      }
                    />
                  ) : (
                    <div className="w-full h-56 md:h-64">
                      <ResponsiveContainer width="100%" height="100%">
                        <LineChart
                          data={series.map((p) => ({
                            month: formatBucketLabel(
                              p.bucket_end,
                              trend?.bucket ?? DEFAULT_BUCKET,
                            ),
                            agreement:
                              p.agreement == null
                                ? null
                                : Math.round(p.agreement * 100),
                          }))}
                        >
                          <CartesianGrid
                            strokeDasharray="3 3"
                            stroke="rgba(125,125,125,0.15)"
                          />
                          <XAxis dataKey="month" fontSize={11} />
                          <YAxis domain={[0, 100]} fontSize={11} unit="%" />
                          <Tooltip
                            contentStyle={{
                              background: "var(--background, #fff)",
                              border: "1px solid rgba(125,125,125,0.2)",
                              borderRadius: 8,
                              fontSize: 12,
                            }}
                          />
                          <Line
                            type="monotone"
                            dataKey="agreement"
                            name="Agreement %"
                            stroke="#10b981"
                            strokeWidth={2}
                            dot={{ r: 3 }}
                            connectNulls={false}
                          />
                        </LineChart>
                      </ResponsiveContainer>
                    </div>
                  )}
                </div>
              );
            })()}
          </div>
        )}

        {activeTab === "jobs" &&
          (detailLoading || !detailFetchCompleted ? (
            <div className="flex items-center justify-center gap-2 py-8 text-sm text-muted-foreground">
              <svg
                className="w-4 h-4 animate-spin"
                fill="none"
                viewBox="0 0 24 24"
              >
                <circle
                  className="opacity-25"
                  cx="12"
                  cy="12"
                  r="10"
                  stroke="currentColor"
                  strokeWidth="4"
                />
                <path
                  className="opacity-75"
                  fill="currentColor"
                  d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                />
              </svg>
              Loading jobs
            </div>
          ) : jobs.length === 0 ? (
            <EmptyState
              icon={
                <svg
                  className="w-7 h-7 text-muted-foreground"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                  strokeWidth={1.5}
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M20.25 14.15v4.25c0 1.094-.787 2.036-1.872 2.18-2.087.277-4.216.42-6.378.42s-4.291-.143-6.378-.42c-1.085-.144-1.872-1.086-1.872-2.18v-4.25m16.5 0a2.18 2.18 0 00.75-1.661V8.706c0-1.081-.768-2.015-1.837-2.175a48.114 48.114 0 00-3.413-.387m4.5 8.006c-.194.165-.42.295-.673.38A23.978 23.978 0 0112 15.75c-2.648 0-5.195-.429-7.577-1.22a2.16 2.16 0 01-.673-.38m0 0A2.18 2.18 0 013 12.489V8.706c0-1.081.768-2.015 1.837-2.175a48.111 48.111 0 013.413-.387m7.5 0V5.25A2.25 2.25 0 0013.5 3h-3a2.25 2.25 0 00-2.25 2.25v.894m7.5 0a48.667 48.667 0 00-7.5 0M12 12.75h.008v.008H12v-.008z"
                  />
                </svg>
              }
              title="No jobs assigned yet"
              description="Jobs will appear here once this annotator is assigned to a labelling task"
            />
          ) : (
            <AnnotatorJobsList jobs={jobs} />
          ))}
      </div>
    </AppLayout>
  );
}

function buildAnnotateUrl(token: string): string {
  if (typeof window === "undefined") return `/annotate-job/${token}`;
  return `${window.location.origin}/annotate-job/${token}`;
}

function statusPillClass(status: AnnotatorJob["status"]): string {
  switch (status) {
    case "completed":
      return "border-green-200 bg-green-100 text-green-700 dark:border-green-500/30 dark:bg-green-500/20 dark:text-green-400";
    case "in_progress":
      return "border-yellow-200 bg-yellow-100 text-yellow-700 dark:border-yellow-500/30 dark:bg-yellow-500/20 dark:text-yellow-400";
    default:
      return "border-gray-200 bg-gray-100 text-gray-700 dark:border-gray-500/30 dark:bg-gray-500/20 dark:text-gray-300";
  }
}

function statusLabel(status: AnnotatorJob["status"]): string {
  if (status === "in_progress") return "In progress";
  if (status === "completed") return "Completed";
  return "Pending";
}

function AnnotatorJobsList({ jobs }: { jobs: AnnotatorJob[] }) {
  const router = useRouter();
  const [copiedToken, setCopiedToken] = useState<string | null>(null);

  useEffect(() => {
    if (!copiedToken) return;
    const t = setTimeout(() => setCopiedToken(null), 1500);
    return () => clearTimeout(t);
  }, [copiedToken]);

  const handleCopy = async (token: string) => {
    try {
      await navigator.clipboard.writeText(buildAnnotateUrl(token));
      setCopiedToken(token);
    } catch {
      // ignore
    }
  };

  return (
    <div className="border border-border rounded-xl overflow-hidden">
      <div className="grid grid-cols-[180px_minmax(0,1fr)_120px_120px] gap-4 [&>*:nth-child(3)]:pl-6 px-4 py-2 border-b border-border bg-muted/30 items-center">
        <div className="text-sm font-medium text-muted-foreground">
          Labelling task
        </div>
        <div className="text-sm font-medium text-muted-foreground">Link</div>
        <div className="text-sm font-medium text-muted-foreground">Status</div>
        <div className="text-sm font-medium text-muted-foreground">
          Progress
        </div>
      </div>
      {jobs.map((job) => {
        const isImported = job.public_token.startsWith("import:");
        const copied = copiedToken === job.public_token;
        const url = buildAnnotateUrl(job.public_token);
        return (
          <div
            key={job.uuid}
            onClick={() => {
              if (!isImported)
                router.push(`/human-alignment/jobs/${job.public_token}`);
            }}
            className={`grid grid-cols-[180px_minmax(0,1fr)_120px_120px] gap-4 [&>*:nth-child(3)]:pl-6 px-4 py-3 border-b border-border last:border-b-0 items-center hover:bg-muted/20 transition-colors ${
              isImported ? "" : "cursor-pointer"
            }`}
          >
            <div className="text-sm font-medium truncate" title={job.task_name}>
              {job.task_name}
            </div>
            <div className="flex items-center gap-2 min-w-0">
              {isImported ? (
                <span className="text-xs text-muted-foreground">Imported</span>
              ) : (
                <>
                  <span className="text-xs font-mono text-muted-foreground truncate">
                    {url}
                  </span>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      handleCopy(job.public_token);
                    }}
                    aria-label={copied ? "Copied" : "Copy link"}
                    title={copied ? "Copied" : "Copy link"}
                    className={`shrink-0 w-7 h-7 flex items-center justify-center rounded-md border transition-colors cursor-pointer ${
                      copied
                        ? "border-green-200 bg-green-100 text-green-700 dark:border-green-500/40 dark:bg-green-500/20 dark:text-green-400"
                        : "border-border bg-background text-muted-foreground hover:bg-muted/50 hover:text-foreground"
                    }`}
                  >
                    {copied ? (
                      <svg
                        className="w-3.5 h-3.5"
                        fill="none"
                        viewBox="0 0 24 24"
                        stroke="currentColor"
                        strokeWidth={2.5}
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          d="M5 13l4 4L19 7"
                        />
                      </svg>
                    ) : (
                      <svg
                        className="w-3.5 h-3.5"
                        fill="none"
                        viewBox="0 0 24 24"
                        stroke="currentColor"
                        strokeWidth={1.8}
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2"
                        />
                      </svg>
                    )}
                  </button>
                </>
              )}
            </div>
            <div>
              <span
                className={`inline-block px-2 py-0.5 rounded-md text-xs font-medium border ${statusPillClass(
                  job.status,
                )}`}
              >
                {statusLabel(job.status)}
              </span>
            </div>
            <div className="text-sm text-muted-foreground tabular-nums">
              {job.completed_item_count} / {job.item_count}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function StatCard({
  label,
  value,
  valueClassName = "",
}: {
  label: string;
  value: string;
  valueClassName?: string;
}) {
  return (
    <div className="border border-border rounded-lg px-4 py-3 bg-background min-w-[160px]">
      <div className="text-[10px] uppercase tracking-wide text-muted-foreground">
        {label}
      </div>
      <div className={`text-2xl font-semibold tabular-nums ${valueClassName}`}>
        {value}
      </div>
    </div>
  );
}
