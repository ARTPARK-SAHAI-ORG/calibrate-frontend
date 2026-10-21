"use client";

import { useEffect, useState } from "react";
import { Link } from "@/lib/nav";
import { HOME_PATH } from "@/lib/routes";
import { reportError } from "@/lib/reportError";
import { getErrorStatusCode } from "@/lib/parseBackendError";
import { ErrorState, LoadingState } from "@/components/ui";
import { Select } from "@/components/ui/Select";
import {
  fetchAnalytics,
  type AnalyticsResponse,
} from "@/lib/analyticsApi";
import {
  CARD_GROUPS,
  RANGE_OPTIONS,
  type CardSpec,
  daysAgoStart,
  formatCost,
  formatCount,
  percentChange,
  previousPeriodLabel,
  toDateInput,
  type RangePreset,
} from "./format";
import { ActivityChart } from "./ActivityChart";
import { WorkspacesTable } from "./WorkspacesTable";
import { FailuresList, LimitHitsList } from "./EventLists";
import { SuperadminsSection } from "./SuperadminsSection";

const CARD = "border rounded-xl p-4 bg-muted/10";
const DATE_INPUT =
  "h-10 px-3 rounded-md text-[13px] border border-border bg-background focus:outline-none focus:ring-2 focus:ring-accent focus:border-transparent cursor-pointer";

type Range = { start?: string; end?: string } | { error: string };

/** Turns the date control into the dates to ask for, or the reason it cannot. */
export function resolveRange(
  preset: RangePreset,
  customStart: string,
  customEnd: string,
  today: string,
): Range {
  if (preset === "all") return { end: today };
  if (preset !== "custom") {
    return { start: daysAgoStart(Number(preset), new Date(`${today}T00:00:00`)), end: today };
  }
  if (!customStart || !customEnd) return { error: "Pick a start date and an end date" };
  const end = customEnd > today ? today : customEnd;
  if (end < customStart) return { error: "The end date is before the start date" };
  return { start: customStart, end };
}

export function AnalyticsView({ accessToken }: { accessToken: string | null }) {
  const today = toDateInput(new Date());
  const [preset, setPreset] = useState<RangePreset>("30");
  const [customStart, setCustomStart] = useState(() =>
    daysAgoStart(30, new Date()),
  );
  const [customEnd, setCustomEnd] = useState(today);
  const [data, setData] = useState<AnalyticsResponse | null>(null);
  // Which request last answered, and how. Loading is read off it rather than
  // set, so a new request never has to clear the old answer first.
  const [settled, setSettled] = useState<{ key: string; error: string | null } | null>(
    null,
  );
  const [forbidden, setForbidden] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);

  const range = resolveRange(preset, customStart, customEnd, today);
  const rangeError = "error" in range ? range.error : null;
  const start = "error" in range ? undefined : range.start;
  const end = "error" in range ? undefined : range.end;
  const requestKey = `${start}|${end}|${reloadKey}`;
  const loading = !rangeError && settled?.key !== requestKey;
  const error = loading ? null : (settled?.error ?? null);

  useEffect(() => {
    if (!accessToken || rangeError) return;
    let cancelled = false;
    fetchAnalytics(accessToken, {
      start,
      end,
      tzOffsetMinutes: -new Date().getTimezoneOffset(),
    })
      .then((result) => {
        if (cancelled) return;
        setData(result);
        setSettled({ key: requestKey, error: null });
      })
      .catch((err) => {
        if (cancelled) return;
        if (getErrorStatusCode(err) === 403) {
          setForbidden(true);
          return;
        }
        reportError("Failed to load analytics", err);
        setSettled({ key: requestKey, error: "The analytics could not be loaded" });
      });
    return () => {
      cancelled = true;
    };
  }, [accessToken, start, end, rangeError, requestKey]);

  const changeLabel = data?.previous ? previousPeriodLabel(preset) : null;

  if (forbidden) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-center px-4">
        <h1 className="text-xl md:text-2xl font-semibold text-foreground">
          This page is only for the Calibrate admin
        </h1>
        <Link
          href={HOME_PATH}
          className="mt-6 h-10 px-4 rounded-md text-base font-medium bg-foreground text-background hover:opacity-90 transition-opacity cursor-pointer inline-flex items-center"
        >
          Go to home
        </Link>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <h1 className="text-xl md:text-2xl font-semibold">Analytics</h1>

      {!data && loading ? (
        <LoadingState />
      ) : !data && error ? (
        <ErrorState message={error} onRetry={() => setReloadKey((k) => k + 1)} />
      ) : data ? (
        <>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <StatCard label="Total users" value={formatCount(data.totals.users)} />
            <StatCard label="Total workspaces" value={formatCount(data.totals.workspaces)} />
            <StatCard
              label="Evaluations running now"
              value={formatCount(data.totals.evaluations_running)}
            />
          </div>

          <hr className="border-border" />

          <section className="space-y-6">
            <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-3">
              <h2 className="text-lg font-semibold">Activity</h2>
              <div className="space-y-2">
                <div className="flex flex-wrap items-center gap-2">
                  <Select
                    aria-label="Dates"
                    value={preset}
                    onChange={(e) => setPreset(e.target.value as RangePreset)}
                    className="cursor-pointer"
                    wrapperClassName="min-w-[160px]"
                  >
                    {RANGE_OPTIONS.map((o) => (
                      <option key={o.value} value={o.value}>
                        {o.label}
                      </option>
                    ))}
                  </Select>
                  {preset === "custom" && (
                    <>
                      <input
                        type="date"
                        aria-label="Start date"
                        value={customStart}
                        max={today}
                        onChange={(e) => setCustomStart(e.target.value)}
                        className={DATE_INPUT}
                      />
                      <input
                        type="date"
                        aria-label="End date"
                        value={customEnd}
                        max={today}
                        onChange={(e) =>
                          setCustomEnd(e.target.value > today ? today : e.target.value)
                        }
                        className={DATE_INPUT}
                      />
                    </>
                  )}
                </div>
                {rangeError && <p className="text-[13px] text-red-500">{rangeError}</p>}
              </div>
            </div>

            {rangeError ? null : error ? (
              <ErrorState message={error} onRetry={() => setReloadKey((k) => k + 1)} />
            ) : (
              <div
                className={`space-y-6 transition-opacity ${loading ? "opacity-60" : ""}`}
                aria-busy={loading}
              >
                {CARD_GROUPS.map((group) => (
                  <div key={group.label} className="space-y-2">
                    <p className="text-[12px] text-muted-foreground">{group.label}</p>
                    <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3">
                      {group.cards.map((card) => (
                        <ActivityCard
                          key={card.key}
                          spec={card}
                          current={data.activity[card.key]}
                          previous={data.previous?.[card.key] ?? null}
                          changeLabel={changeLabel}
                        />
                      ))}
                    </div>
                  </div>
                ))}

                <ActivityChart days={data.per_day} />
                <WorkspacesTable rows={data.workspaces} />
                <FailuresList failures={data.failures} total={data.failures_total} />
                <LimitHitsList hits={data.limit_hits} total={data.limit_hits_total} />
              </div>
            )}
          </section>

          {accessToken && (
            <>
              <hr className="border-border" />
              <SuperadminsSection accessToken={accessToken} />
            </>
          )}
        </>
      ) : null}
    </div>
  );
}

function StatCard({ label, value }: { label: string; value: string }) {
  return (
    <div className={CARD}>
      <p className="text-[12px] text-muted-foreground mb-1">{label}</p>
      <p className="text-[18px] font-semibold text-foreground">{value}</p>
    </div>
  );
}

function ActivityCard({
  spec,
  current,
  previous,
  changeLabel,
}: {
  spec: CardSpec;
  current: number | null;
  previous: number | null;
  changeLabel: string | null;
}) {
  const isCost = spec.key === "cost";
  const value = isCost ? formatCost(current) : formatCount(current ?? 0);
  const change = changeLabel ? percentChange(current ?? 0, previous ?? 0) : null;
  const good = change !== null && (spec.higherIsWorse ? change < 0 : change > 0);
  return (
    <div className={CARD}>
      <p className="text-[12px] text-muted-foreground mb-1">{spec.label}</p>
      <p
        className={`text-[18px] font-semibold ${
          spec.key === "failed_evaluations" && current ? "text-red-600 dark:text-red-400" : "text-foreground"
        }`}
      >
        {value}
      </p>
      {spec.note && <p className="text-[12px] text-muted-foreground mt-1">{spec.note}</p>}
      {change !== null && (
        <p
          className={`text-[12px] mt-1 ${
            change === 0 ? "text-muted-foreground" : good ? "text-green-600 dark:text-green-400" : "text-red-600 dark:text-red-400"
          }`}
        >
          {change === 0 ? "No change" : `${change > 0 ? "+" : ""}${change}%`} {changeLabel}
        </p>
      )}
    </div>
  );
}
