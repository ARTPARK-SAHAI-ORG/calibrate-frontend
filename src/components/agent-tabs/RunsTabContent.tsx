"use client";

import { useEffect, useState } from "react";
import {
  useAccessToken,
  useAgentRuns,
  useDialogUrlParam,
  usePageSize,
  type AgentRun,
  type RunResultFilter,
} from "@/hooks";
import { getDefaultHeaders } from "@/lib/api";
import { formatRelativeTime } from "@/lib/relativeTime";
import {
  getUnitTestBreakdown,
  isRunErrored,
  isRunInProgress,
} from "@/lib/testTypes";
import { ServerPaginatedListBar } from "@/components/ui";
import { TestRunnerDialog } from "@/components/TestRunnerDialog";
import { BenchmarkResultsDialog } from "@/components/BenchmarkResultsDialog";
import {
  BenchmarkRerunDialog,
  useBenchmarkRerun,
} from "@/components/BenchmarkRerunDialog";

const RESULT_FILTERS: { value: RunResultFilter; label: string }[] = [
  { value: "all", label: "All results" },
  { value: "passed", label: "All passed" },
  { value: "failed", label: "All failed" },
  { value: "error", label: "Error" },
];

/**
 * How many tests the run covered. A run tried against several models holds its
 * tests inside each model's own results, so fall back to the first model's
 * count. Null when the list carries none of these, which shows as a dash
 * rather than a made-up number.
 */
export function runTestCount(run: AgentRun): number | null {
  if (typeof run.total_tests === "number") return run.total_tests;
  if (run.results && run.results.length > 0) return run.results.length;
  const firstModel = run.model_results?.[0];
  if (firstModel?.test_results) return firstModel.test_results.length;
  return null;
}

/** How many models the run tried the tests against. A plain run tries one. */
export function runModelCount(run: AgentRun): number {
  return run.type === "llm-benchmark" ? (run.model_results?.length ?? 0) : 1;
}

const PILL_CLASS =
  "inline-flex items-center whitespace-nowrap px-2 py-0.5 rounded text-xs font-medium";

/** The result pills for one run: running, error, or the per-test tally. */
function RunResult({ run }: { run: AgentRun }) {
  if (isRunInProgress(run)) {
    return (
      <span className={`${PILL_CLASS} bg-yellow-500/20 text-yellow-500`}>
        <svg
          className="w-3 h-3 animate-spin mr-1"
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
        Running
      </span>
    );
  }

  // A run whose tests errored reads better as "N Success / N Fail / N Error"
  // than as a single blanket Error, so prefer the per-test tally when there is
  // one.
  const breakdown =
    run.type === "llm-unit-test" ? getUnitTestBreakdown(run.results) : null;

  if (!breakdown) {
    return isRunErrored(run) ? (
      <span
        className={`${PILL_CLASS} bg-red-100 text-red-700 dark:bg-red-500/20 dark:text-red-500`}
      >
        Error
      </span>
    ) : (
      <span
        className={`${PILL_CLASS} bg-green-100 text-green-700 dark:bg-green-500/20 dark:text-green-500`}
      >
        Complete
      </span>
    );
  }

  return (
    <>
      {breakdown.passed > 0 && (
        <span
          className={`${PILL_CLASS} bg-green-100 text-green-700 dark:bg-green-500/20 dark:text-green-500`}
        >
          {breakdown.passed} Success
        </span>
      )}
      {breakdown.failed > 0 && (
        <span
          className={`${PILL_CLASS} bg-red-100 text-red-700 dark:bg-red-500/20 dark:text-red-500`}
        >
          {breakdown.failed} Fail
        </span>
      )}
      {breakdown.errored > 0 && (
        <span
          className={`${PILL_CLASS} bg-amber-100 text-amber-700 dark:bg-amber-500/20 dark:text-amber-500`}
        >
          {breakdown.errored} Error
        </span>
      )}
    </>
  );
}

/**
 * The Runs tab on the agent page: every past run of this agent's tests, newest
 * first, in one table showing how many tests and how many models each run
 * covered. Clicking a row opens the results it produced.
 */
export function RunsTabContent({
  agentUuid,
  agentName,
}: {
  agentUuid: string;
  agentName: string;
}) {
  const backendAccessToken = useAccessToken();
  const [pageSize, setPageSize] = usePageSize();
  const [filter, setFilter] = useState<RunResultFilter>("all");

  const {
    items,
    total,
    offset,
    isLoading,
    error,
    refetch,
    setPollSkip,
    hasPrev,
    hasNext,
    prevPage,
    nextPage,
  } = useAgentRuns({
    agentUuid,
    accessToken: backendAccessToken,
    pageSize,
    filter,
  });

  // The one open test run window, deep-linked to `?runId=` so a reload
  // re-opens it and the address can be shared.
  const [openTestRunId, setOpenTestRunId] = useState<string | null>(null);
  const { setParam: setRunIdParam } = useDialogUrlParam({
    param: "runId",
    onOpen: (uuid) => setOpenTestRunId(uuid),
    onClose: () => setOpenTestRunId(null),
  });
  const openTestRun = (uuid: string) => {
    setOpenTestRunId(uuid);
    setRunIdParam(uuid);
  };
  const closeTestRun = () => {
    setOpenTestRunId(null);
    setRunIdParam(null);
  };

  // A run tried against several models opens its own results window.
  const [openBenchmarkRun, setOpenBenchmarkRun] = useState<AgentRun | null>(
    null,
  );
  const benchmarkRerun = useBenchmarkRerun();

  // Whichever run is open asks for itself, so the list stops asking for it.
  useEffect(() => {
    setPollSkip(openTestRunId ?? openBenchmarkRun?.uuid ?? null);
  }, [openTestRunId, openBenchmarkRun, setPollSkip]);

  // A `?runId=` this agent has no run for (a deleted run, or a link from
  // another agent) would leave a window open that keeps asking for a run that
  // is not there. The list only holds one page, so the run is checked directly
  // rather than by looking through the rows on screen.
  useEffect(() => {
    if (!openTestRunId) return;
    if (items.some((run) => run.uuid === openTestRunId)) return;
    const backendUrl = process.env.NEXT_PUBLIC_BACKEND_URL;
    if (!backendUrl || !backendAccessToken) return;
    let cancelled = false;
    void (async () => {
      try {
        const response = await fetch(
          `${backendUrl}/agent-tests/run/${openTestRunId}`,
          { method: "GET", headers: getDefaultHeaders(backendAccessToken) },
        );
        // Only a plain "there is no such run" closes it. A server or network
        // problem is not proof the run is gone.
        if (!cancelled && response.status === 404) closeTestRun();
      } catch {
        // Left open on purpose: see above.
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [openTestRunId, items, backendAccessToken]);

  const openRun = (run: AgentRun) => {
    if (run.type === "llm-unit-test") {
      openTestRun(run.uuid);
      return;
    }
    setOpenBenchmarkRun(run);
  };

  const pageCount = Math.max(1, Math.ceil(total / pageSize));
  const currentPage = Math.floor(offset / pageSize) + 1;
  const countCell = (value: number | null) =>
    value === null ? "—" : String(value);

  return (
    <div className="space-y-3 py-4 md:py-6">
      <div className="flex flex-wrap gap-1.5">
        {RESULT_FILTERS.map((f) => (
          <button
            key={f.value}
            onClick={() => setFilter(f.value)}
            className={`px-3 py-1.5 text-xs font-medium rounded-md border transition-colors cursor-pointer ${
              filter === f.value
                ? "bg-foreground text-background border-foreground"
                : "border-border text-muted-foreground hover:text-foreground"
            }`}
          >
            {f.label}
          </button>
        ))}
      </div>

      {error && (
        <div className="border border-red-500/40 bg-red-500/10 rounded-xl px-4 py-3 text-sm text-red-600 dark:text-red-400">
          {error}
        </div>
      )}

      {isLoading && items.length === 0 ? (
        <div className="flex items-center justify-center py-10">
          <svg
            className="w-5 h-5 animate-spin text-muted-foreground"
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
        </div>
      ) : items.length === 0 ? (
        <div className="border border-border rounded-xl p-8 md:p-12 flex flex-col items-center justify-center bg-muted/20">
          <h3 className="text-base md:text-lg font-semibold text-foreground mb-1">
            {filter === "all" ? "No runs yet" : "No runs match this filter"}
          </h3>
          <p className="text-sm md:text-base text-muted-foreground text-center">
            {filter === "all"
              ? "Run this agent's tests from the Tests tab. Every run appears here with what it covered and how it went."
              : "Choose another result to see more runs."}
          </p>
        </div>
      ) : (
        <div className="space-y-1 pt-4">
          <ServerPaginatedListBar
            total={total}
            offset={offset}
            loadedCount={items.length}
            pageSize={pageSize}
            onPageSizeChange={setPageSize}
            currentPage={currentPage}
            pageCount={pageCount}
            onPrev={prevPage}
            onNext={nextPage}
            prevDisabled={!hasPrev || isLoading}
            nextDisabled={!hasNext || isLoading}
            itemNoun="run"
          />

          {/* Desktop table */}
          <div className="hidden md:block border border-border rounded-xl overflow-hidden">
            <table className="w-full">
              <thead className="bg-muted/30">
                <tr>
                  <th className="text-left px-4 py-3 text-sm font-medium text-muted-foreground">
                    When
                  </th>
                  <th className="text-left px-4 py-3 text-sm font-medium text-muted-foreground w-28">
                    Tests
                  </th>
                  <th className="text-left px-4 py-3 text-sm font-medium text-muted-foreground w-28">
                    Models
                  </th>
                  <th className="text-right px-4 py-3 text-sm font-medium text-muted-foreground">
                    Result
                  </th>
                </tr>
              </thead>
              <tbody>
                {items.map((run) => (
                  <tr
                    key={run.uuid}
                    onClick={() => openRun(run)}
                    className="border-t border-border hover:bg-muted/20 transition-colors cursor-pointer"
                  >
                    <td className="px-4 py-3 text-sm text-foreground">
                      {formatRelativeTime(run.updated_at)}
                    </td>
                    <td className="px-4 py-3 text-sm text-muted-foreground tabular-nums">
                      {countCell(runTestCount(run))}
                    </td>
                    <td className="px-4 py-3 text-sm text-muted-foreground tabular-nums">
                      {countCell(runModelCount(run))}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex flex-wrap items-center justify-end gap-2">
                        <RunResult run={run} />
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Mobile cards */}
          <div className="md:hidden space-y-2">
            {items.map((run) => (
              <div
                key={run.uuid}
                onClick={() => openRun(run)}
                className="border border-border rounded-xl p-3 cursor-pointer hover:bg-muted/20 transition-colors"
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="text-sm font-medium text-foreground">
                    {formatRelativeTime(run.updated_at)}
                  </span>
                  <span className="text-xs text-muted-foreground tabular-nums">
                    {countCell(runTestCount(run))} tests,{" "}
                    {countCell(runModelCount(run))} models
                  </span>
                </div>
                <div className="flex flex-wrap items-center gap-2 mt-2">
                  <RunResult run={run} />
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {openTestRunId && (
        <TestRunnerDialog
          isOpen
          onClose={closeTestRun}
          agentUuid={agentUuid}
          agentName={agentName}
          taskId={openTestRunId}
          onNewRun={(taskId) => {
            void refetch();
            openTestRun(taskId);
          }}
        />
      )}

      {openBenchmarkRun && (
        <BenchmarkResultsDialog
          isOpen
          onClose={() => setOpenBenchmarkRun(null)}
          agentUuid={agentUuid}
          agentName={agentName}
          testUuids={[]}
          testNames={[]}
          models={[]}
          taskId={openBenchmarkRun.uuid}
          onRerun={(models, testUuids, testNames) => {
            setOpenBenchmarkRun(null);
            benchmarkRerun.start({
              agentUuid,
              agentName,
              models,
              testUuids,
              testNames,
            });
          }}
        />
      )}

      <BenchmarkRerunDialog
        config={benchmarkRerun.config}
        rerunKey={benchmarkRerun.key}
        onClose={benchmarkRerun.clear}
        onBenchmarkCreated={() => void refetch()}
        onRerun={benchmarkRerun.start}
      />
    </div>
  );
}
