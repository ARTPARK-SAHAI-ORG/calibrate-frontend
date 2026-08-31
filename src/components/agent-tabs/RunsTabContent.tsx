"use client";

import React, { useEffect, useState } from "react";
import { toast } from "sonner";
import {
  useAccessToken,
  useAgentRuns,
  useDialogUrlParam,
  usePageSize,
  useResizableWidth,
  type AgentRun,
  type RunResultFilter,
  type RunTypeFilter,
} from "@/hooks";
import {
  getRunBreakdown,
  isRunErrored,
  isRunInProgress,
  isRunStopped,
  runDisplayName,
  runStateOf,
} from "@/lib/testTypes";
import { RunStateMark, ServerPaginatedListBar } from "@/components/ui";
import { DeleteIconButton } from "@/components/ui/DeleteIconButton";
import { Tooltip } from "@/components/Tooltip";
import { DeleteConfirmationDialog } from "@/components/DeleteConfirmationDialog";
import { deleteRunOrNotify } from "@/lib/testRunApi";
import {
  EvaluatorPillList,
  NamePillList,
} from "@/components/EvaluatorPillList";
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

// A run that tried the tests against several models at once is rare next to
// ordinary runs, so it gets pushed off the first page. This asks the backend
// for those runs only.
const TYPE_FILTERS: { value: RunTypeFilter; label: string }[] = [
  { value: "all", label: "All runs" },
  { value: "llm-benchmark", label: "Model comparisons" },
];

/**
 * How many tests the run covered. A run tried against several models counts
 * its tests inside each model's own results, so fall back to the first
 * model's own count, and then to the cases behind it (the runs list carries
 * the count but not the cases; the run-detail endpoints carry both). Null when
 * the run carries none of these, which shows as a dash rather than a made-up
 * number.
 */
export function runTestCount(run: AgentRun): number | null {
  if (typeof run.total_tests === "number") return run.total_tests;
  const firstModel = run.model_results?.[0];
  if (typeof firstModel?.total_tests === "number") return firstModel.total_tests;
  if (firstModel?.test_results) return firstModel.test_results.length;
  return null;
}

/**
 * The models a run tried the tests against, named the way a person says them:
 * the model on its own, without the company that makes it.
 */
export function runModels(run: AgentRun): string[] {
  return (run.model_results ?? [])
    .map((m) => m.model?.replace(/__/g, "/").split("/").pop() ?? "")
    .filter(Boolean);
}

/** One run's name, with the mark for how the run itself went. */
function RunName({ run }: { run: AgentRun }) {
  const state = runStateOf(run);
  return (
    <span className="flex min-w-0 items-center gap-1.5">
      {state && <RunStateMark state={state} />}
      <span className="truncate text-sm font-medium text-foreground">
        {runDisplayName(run.type, run.name)}
      </span>
    </span>
  );
}

/** What the results cell says when the run has no results to show. */
function RunResultPlaceholder() {
  return <span className="text-sm text-muted-foreground/70">No results</span>;
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

  // A run where some tests produced no answer reads better as
  // "N Success / N Fail / N Not run" than as a single blanket Error, so prefer
  // the tally when the run reports one.
  const breakdown =
    run.type === "llm-unit-test" ? getRunBreakdown(run) : null;

  if (!breakdown) {
    // A stopped run has nothing to tally: it never got to a test, or it is a
    // model comparison, which carries no counts either way. Say so in the same
    // words the models cell says "Default", rather than calling it complete or
    // leaving the reader with a blank.
    if (isRunStopped(run)) return <RunResultPlaceholder />;
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
      {breakdown.unanswered > 0 && (
        <span
          className={`${PILL_CLASS} bg-amber-100 text-amber-700 dark:bg-amber-500/20 dark:text-amber-500`}
        >
          {breakdown.unanswered} Not run
        </span>
      )}
    </>
  );
}

/** One row of filter buttons, the chosen one filled in. */
function FilterChips<T extends string>({
  options,
  value,
  onChange,
}: {
  options: { value: T; label: string }[];
  value: T;
  onChange: (value: T) => void;
}) {
  return (
    <>
      {options.map((option) => (
        <button
          key={option.value}
          onClick={() => onChange(option.value)}
          className={`px-3 py-1.5 text-xs font-medium rounded-md border transition-colors cursor-pointer ${
            value === option.value
              ? "bg-foreground text-background border-foreground"
              : "border-border text-muted-foreground hover:text-foreground"
          }`}
        >
          {option.label}
        </button>
      ))}
    </>
  );
}

/**
 * The models a run tried the tests against, as plain chips. A run that was not
 * a model comparison used the agent's own model, which reads as "Default".
 */
function RunModels({ run }: { run: AgentRun }) {
  const models = runModels(run);
  if (models.length === 0)
    return <span className="text-sm text-muted-foreground/70">Default</span>;
  return <NamePillList names={models} maxVisible={1} />;
}

/**
 * The evaluators that judged a run, in the same fixed-width pills the human
 * alignment tasks list uses, so one row with many evaluators does not push
 * every other row's columns out of line. A pill opens how that evaluator
 * judges, except for "Tool call" and for runs read from an older backend that
 * sends names with no id.
 */
function RunEvaluators({ run }: { run: AgentRun }) {
  const evaluators = (run.evaluators ?? []).flatMap((ev) => {
    if (typeof ev === "string") return [{ name: ev }];
    return ev.name ? [{ uuid: ev.uuid, name: ev.name }] : [];
  });
  return <EvaluatorPillList evaluators={evaluators} />;
}

/**
 * The delete button for one run. A run that is still going cannot be deleted:
 * the button is greyed out until it has finished, since deleting it would only
 * remove the record while the run itself kept going.
 */
function RunDeleteButton({
  run,
  onDelete,
}: {
  run: AgentRun;
  onDelete: () => void;
}) {
  const running = isRunInProgress(run);
  const button = (
    <DeleteIconButton
      onClick={onDelete}
      title="Delete evaluation"
      disabled={running}
    />
  );
  if (!running) return button;
  return (
    <Tooltip
      content="You can delete this evaluation once it has finished."
      position="left"
    >
      {button}
    </Tooltip>
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
  isActive = true,
}: {
  agentUuid: string;
  agentName: string;
  /**
   * Whether this tab is the one showing. Only the tab on screen acts on
   * `?runId=`: the Tests tab names its own open run the same way, and a run
   * opened there must not also open a hidden window here.
   */
  isActive?: boolean;
}) {
  const backendAccessToken = useAccessToken();
  const [pageSize, setPageSize] = usePageSize();
  const [filter, setFilter] = useState<RunResultFilter>("all");
  const [typeFilter, setTypeFilter] = useState<RunTypeFilter>("all");

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
    typeof window === "undefined" || !isActive
      ? null
      : new URLSearchParams(window.location.search).get("runId"),
  );
  const [openTestRunId, setOpenTestRunId] = useState<string | null>(null);
  const [openBenchmarkRun, setOpenBenchmarkRun] = useState<AgentRun | null>(
    null,
  );
  const { setParam: setRunIdParam } = useDialogUrlParam({
    param: "runId",
    enabled: isActive,
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
    handleDeleted,
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
    typeFilter,
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

  // The Run column starts at the width that fits the longest automatic name
  // ("Model comparison 999"), and can be dragged wider for runs people have
  // renamed to something longer.
  const runColumn = useResizableWidth(240, 140, 560);

  // The run the reader asked to delete, held while they confirm.
  const [runToDelete, setRunToDelete] = useState<AgentRun | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  const confirmDelete = async () => {
    const backendUrl = process.env.NEXT_PUBLIC_BACKEND_URL;
    if (!runToDelete || !backendUrl) return;
    setIsDeleting(true);
    const deleted = await deleteRunOrNotify(
      backendUrl,
      backendAccessToken,
      runToDelete.uuid,
    );
    setIsDeleting(false);
    if (!deleted) return;
    setRunToDelete(null);
    handleDeleted();
  };

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
      <div className="flex flex-wrap items-center gap-1.5">
        <FilterChips
          options={RESULT_FILTERS}
          value={filter}
          onChange={setFilter}
        />
        <span className="w-px h-5 bg-border mx-1" aria-hidden="true" />
        <FilterChips
          options={TYPE_FILTERS}
          value={typeFilter}
          onChange={setTypeFilter}
        />
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
            {filter === "all" && typeFilter === "all"
              ? "No evaluations yet"
              : "No evaluations match this filter"}
          </h3>
          <p className="text-sm md:text-base text-muted-foreground text-center">
            {filter === "all" && typeFilter === "all"
              ? "Run this agent's tests from the Tests tab. Every evaluation appears here with what it covered and how it went."
              : "Choose another filter to see more runs"}
          </p>
        </div>
      ) : (
        <div className="space-y-1 pt-1">
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
            <table className="w-full table-fixed">
              <thead className="bg-muted/30">
                <tr>
                  <th
                    style={{ width: runColumn.width }}
                    className="relative text-left px-4 py-3 text-sm font-medium text-muted-foreground"
                  >
                    Run
                    {/* Nothing to see until you reach for it: the edge takes
                        a drag, and only then does it show. A visible line
                        here read as a border the table did not need. */}
                    {/* Hidden from a screen reader, which reads a heading's
                        whole contents: a label here made the column announce
                        itself as "Run Resize the Run column". */}
                    <div
                      aria-hidden="true"
                      data-testid="run-column-resize"
                      onMouseDown={runColumn.startDrag}
                      className="hidden md:block absolute right-0 top-0 h-full w-2 cursor-col-resize hover:bg-accent active:bg-accent transition-colors"
                    />
                  </th>
                  <th className="text-left px-4 py-3 text-sm font-medium text-muted-foreground">
                    Result
                  </th>
                  <th className="text-left px-4 py-3 text-sm font-medium text-muted-foreground w-24">
                    Tests
                  </th>
                  <th className="text-left px-4 py-3 text-sm font-medium text-muted-foreground w-56">
                    Models
                  </th>
                  <th className="text-left px-4 py-3 text-sm font-medium text-muted-foreground w-64">
                    Evaluators
                  </th>
                  <th className="text-left px-4 py-3 text-sm font-medium text-muted-foreground w-28">
                    Created at
                  </th>
                  <th className="px-4 py-3 w-16">
                    <span className="sr-only">Delete</span>
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
                      <RunName run={run} />
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex flex-wrap items-center gap-2">
                        <RunResult run={run} />
                      </div>
                    </td>
                    <td className="px-4 py-3 text-sm text-muted-foreground tabular-nums">
                      {countCell(runTestCount(run))}
                    </td>
                    <td className="px-4 py-3">
                      <RunModels run={run} />
                    </td>
                    <td className="px-4 py-3">
                      <RunEvaluators run={run} />
                    </td>
                    <td className="px-4 py-3 text-xs text-muted-foreground whitespace-nowrap">
                      {whenText(run)}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center justify-end">
                        <RunDeleteButton
                          run={run}
                          onDelete={() => setRunToDelete(run)}
                        />
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
                  <RunName run={run} />
                  <span className="text-xs text-muted-foreground tabular-nums shrink-0">
                    {countCell(runTestCount(run))} tests
                  </span>
                </div>
                <div className="mt-2">
                  <RunModels run={run} />
                </div>
                <div className="flex flex-wrap items-center gap-2 mt-2">
                  <RunResult run={run} />
                </div>
                <div className="mt-2">
                  <RunEvaluators run={run} />
                </div>
                <div className="flex items-center justify-between gap-2 mt-2">
                  <p className="text-xs text-muted-foreground">
                    {whenText(run)}
                  </p>
                  <RunDeleteButton
                    run={run}
                    onDelete={() => setRunToDelete(run)}
                  />
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
          onRenamed={() => void refetch()}
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
          onRenamed={() => void refetch()}
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

      {runToDelete && (
        <DeleteConfirmationDialog
          isOpen
          onClose={() => setRunToDelete(null)}
          onConfirm={confirmDelete}
          title="Delete evaluation"
          message={`Are you sure you want to delete "${runDisplayName(
            runToDelete.type,
            runToDelete.name,
          )}"? Its results are deleted too, and this cannot be undone.`}
          confirmText="Delete"
          isDeleting={isDeleting}
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
