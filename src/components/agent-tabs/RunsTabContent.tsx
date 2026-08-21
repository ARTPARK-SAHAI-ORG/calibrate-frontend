"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import {
  useAccessToken,
  useAgentRuns,
  useDialogUrlParam,
  usePageSize,
  type AgentRun,
  type RunResultFilter,
} from "@/hooks";
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
import { readUrlParam, writeUrlParam } from "@/components/human-labelling/valueFilterUrl";

// Which page of results is open, so a reload reopens on the same one instead
// of resetting to the first. Written with `replaceState` like the other
// address-bar view settings: it's where you're looking, not somewhere you
// navigated to, so the Back button shouldn't have to undo it one page at a
// time.
const PAGE_PARAM = "page";

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

/** The evaluators that judged a run, as plain chips. A dash when there are none. */
function RunEvaluators({ run }: { run: AgentRun }) {
  const names = run.evaluators ?? [];
  if (names.length === 0)
    return <span className="text-sm text-muted-foreground">—</span>;
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {names.map((name) => (
        <span key={name} className={`${PILL_CLASS} bg-muted text-muted-foreground`}>
          {name}
        </span>
      ))}
    </div>
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

  // The page a reload should reopen on, read once from `?page=` at start-up.
  // A `?runId=` link is more specific about where to land (it names the run,
  // not just a page number), so it takes over below regardless of this.
  const [initialOffset] = useState(() => {
    const page = Number(readUrlParam(PAGE_PARAM));
    return Number.isInteger(page) && page > 1 ? (page - 1) * pageSize : 0;
  });

  // A `?runId=` in the URL — from a shared link, a reload, or the Back/
  // Forward buttons — names a run whose type (plain run vs. multi-model
  // benchmark) isn't known yet, so it's held here until the list (landed on
  // that run's actual page via `around`) resolves it to the right dialog.
  //
  // Read straight from the address on the very first render, rather than
  // waiting for `useDialogUrlParam`'s effect to report it a moment later —
  // otherwise the list's own first fetch would already have gone out for
  // plain page one before anyone told it which run to land on, wasting that
  // request.
  const [pendingRunId, setPendingRunId] = useState<string | null>(() =>
    typeof window === "undefined"
      ? null
      : new URLSearchParams(window.location.search).get("runId"),
  );
  const [openTestRunId, setOpenTestRunId] = useState<string | null>(null);
  const [openBenchmarkRun, setOpenBenchmarkRun] = useState<AgentRun | null>(
    null,
  );
  const { setParam: setRunIdParam } = useDialogUrlParam({
    param: "runId",
    onOpen: (uuid) => setPendingRunId(uuid),
    onClose: () => {
      setPendingRunId(null);
      setOpenTestRunId(null);
      setOpenBenchmarkRun(null);
    },
  });

  const {
    items,
    total,
    offset,
    isLoading,
    error,
    aroundNotFound,
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
    aroundRunId: pendingRunId,
    initialOffset,
  });

  // Keep `?page=` in step with whichever page is actually showing — paging,
  // a filter change resetting to page one, or a run link landing somewhere
  // else — so the next reload reopens on it. Page one is the default, so
  // it's left out of the address rather than written as `page=1`.
  useEffect(() => {
    const page = Math.floor(offset / pageSize) + 1;
    writeUrlParam(PAGE_PARAM, page > 1 ? String(page) : null);
  }, [offset, pageSize]);

  const openTestRun = (uuid: string) => {
    // A row click always wins over a `?runId=` link that's still being
    // looked up — otherwise that lookup could resolve later and reopen the
    // run the link named, snapping the reader back out of the one they just
    // picked.
    setPendingRunId(null);
    setOpenBenchmarkRun(null);
    setOpenTestRunId(uuid);
    setRunIdParam(uuid);
  };
  const closeTestRun = () => {
    setOpenTestRunId(null);
    setRunIdParam(null);
  };
  const closeBenchmarkRun = () => {
    setOpenBenchmarkRun(null);
    setRunIdParam(null);
  };

  const openRun = (run: AgentRun) => {
    if (run.type === "llm-unit-test") {
      openTestRun(run.uuid);
      return;
    }
    setPendingRunId(null);
    setOpenTestRunId(null);
    setOpenBenchmarkRun(run);
    setRunIdParam(run.uuid);
  };

  const benchmarkRerun = useBenchmarkRerun();

  // Whichever run is open asks for itself, so the list stops asking for it.
  useEffect(() => {
    setPollSkip(openTestRunId ?? openBenchmarkRun?.uuid ?? null);
  }, [openTestRunId, openBenchmarkRun, setPollSkip]);

  // Once the list (possibly landed on a different page via `around`) has
  // loaded, resolve the pending `?runId=` to the run it names and open the
  // dialog that matches its actual type. If it isn't there — wrong filter,
  // or the run doesn't exist — the hook has already fallen back to page one.
  useEffect(() => {
    if (!pendingRunId || isLoading) return;
    const match = items.find((run) => run.uuid === pendingRunId);
    if (match) {
      setPendingRunId(null);
      openRun(match);
      return;
    }
    if (aroundNotFound) {
      setPendingRunId(null);
      setRunIdParam(null);
      toast.error("That run could not be found.");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pendingRunId, isLoading, items, aroundNotFound]);

  const pageCount = Math.max(1, Math.ceil(total / pageSize));
  const currentPage = Math.floor(offset / pageSize) + 1;
  const countCell = (value: number | null) =>
    value === null ? "—" : String(value);
  // The day and time it started, not "3 min ago": a run is a record, and two
  // runs minutes apart need telling apart. Only `created_at` will do here;
  // `updated_at` moves as the run progresses, so it would be a different
  // answer every few seconds under a heading that says Created at.
  const whenText = (run: AgentRun) => {
    const raw = run.created_at;
    if (!raw) return "—";
    const date = new Date(
      raw.endsWith("Z") || raw.includes("+")
        ? raw
        : raw.replace(" ", "T") + "Z",
    );
    if (Number.isNaN(date.getTime())) return raw;
    return date.toLocaleString(undefined, {
      day: "2-digit",
      month: "short",
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  return (
    <div className="flex flex-col space-y-4 md:space-y-6">
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
            {filter === "all"
              ? "No evaluations yet"
              : "No evaluations match this filter"}
          </h3>
          <p className="text-sm md:text-base text-muted-foreground text-center">
            {filter === "all"
              ? "Run this agent's tests from the Tests tab. Every evaluation appears here with what it covered and how it went."
              : "Choose another result to see more runs"}
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
            itemNoun="evaluation"
          />

          {/* Desktop table */}
          <div className="hidden md:block border border-border rounded-xl overflow-hidden">
            <table className="w-full">
              <thead className="bg-muted/30">
                <tr>
                  <th className="text-left px-4 py-3 text-sm font-medium text-muted-foreground w-32">
                    Run
                  </th>
                  <th className="text-left px-4 py-3 text-sm font-medium text-muted-foreground">
                    Result
                  </th>
                  <th className="text-left px-4 py-3 text-sm font-medium text-muted-foreground w-24">
                    Tests
                  </th>
                  <th className="text-left px-4 py-3 text-sm font-medium text-muted-foreground w-24">
                    Models
                  </th>
                  <th className="text-left px-4 py-3 text-sm font-medium text-muted-foreground">
                    Evaluators
                  </th>
                  <th className="text-left px-4 py-3 text-sm font-medium text-muted-foreground w-28">
                    Created at
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
                    <td className="px-4 py-3">
                      <span
                        className="block truncate font-mono text-xs text-foreground"
                        title={run.uuid}
                      >
                        {run.uuid}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex flex-wrap items-center gap-2">
                        <RunResult run={run} />
                      </div>
                    </td>
                    <td className="px-4 py-3 text-sm text-muted-foreground tabular-nums">
                      {countCell(runTestCount(run))}
                    </td>
                    <td className="px-4 py-3 text-sm text-muted-foreground tabular-nums">
                      {countCell(runModelCount(run))}
                    </td>
                    <td className="px-4 py-3">
                      <RunEvaluators run={run} />
                    </td>
                    <td className="px-4 py-3 text-xs text-muted-foreground whitespace-nowrap">
                      {whenText(run)}
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
                  <span
                    className="min-w-0 truncate font-mono text-xs text-foreground"
                    title={run.uuid}
                  >
                    {run.uuid}
                  </span>
                  <span className="text-xs text-muted-foreground tabular-nums shrink-0">
                    {countCell(runTestCount(run))} tests,{" "}
                    {countCell(runModelCount(run))} models
                  </span>
                </div>
                <div className="flex flex-wrap items-center gap-2 mt-2">
                  <RunResult run={run} />
                </div>
                <div className="mt-2">
                  <RunEvaluators run={run} />
                </div>
                <p className="text-xs text-muted-foreground mt-2">
                  {whenText(run)}
                </p>
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
          onClose={closeBenchmarkRun}
          agentUuid={agentUuid}
          agentName={agentName}
          testUuids={[]}
          testNames={[]}
          models={[]}
          taskId={openBenchmarkRun.uuid}
          onRerun={(models, testUuids, testNames) => {
            closeBenchmarkRun();
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
