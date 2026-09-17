import type {
  TraceScoringIneligibleReason,
  TraceScoringStatus,
  TraceSummary,
} from "./tracesApi";

/** A run that is still open and should be refetched. */
export function isTraceScoringInProgress(
  status: TraceScoringStatus | null | undefined,
): boolean {
  return status === "pending" || status === "processing";
}

export function pageHasOpenTraceScoring(
  traces: Pick<TraceSummary, "latest_run_status">[],
): boolean {
  return traces.some((trace) =>
    isTraceScoringInProgress(trace.latest_run_status),
  );
}

/** Why a linked evaluator cannot score this agent's traces. */
export function ineligibleReasonCopy(
  reason: TraceScoringIneligibleReason | string,
): string {
  switch (reason) {
    case "wrong_type_for_agent":
      return "Does not match this agent";
    case "no_live_version":
      return "Has no current version to run";
    case "declares_variables":
      return "Needs extra details that are not set for this agent";
    default:
      return "Cannot score traces for this agent";
  }
}

/** Why a scoring run was skipped or failed. */
export function scoringRunErrorCopy(error: string | null | undefined): string {
  switch (error) {
    case "no_usable_evaluators":
      return "No evaluators could score this trace";
    case "trace_deleted":
      return "This trace was deleted before scoring finished";
    case "agent_deleted":
      return "This agent was deleted before scoring finished";
    case "unsupported_interaction_type":
      return "This kind of agent cannot be scored yet";
    case "corrupt_snapshot":
      return "This scoring run could not be completed";
    default:
      return "Scoring did not finish";
  }
}

export function scoringStatusLabel(status: TraceScoringStatus): string {
  switch (status) {
    case "pending":
      return "Waiting";
    case "processing":
      return "Scoring";
    case "completed":
      return "Scored";
    case "failed":
      return "Failed";
    case "skipped":
      return "Skipped";
  }
}

export type ScoringResultCounts = {
  passed: number;
  failed: number;
};

/**
 * Success / Fail counts for a completed run. Pills carry each count themselves.
 */
export function scoringResultCounts(
  nPassed: number | null | undefined,
  nTotal: number | null | undefined,
): ScoringResultCounts | null {
  if (nPassed == null || nTotal == null || nTotal < 1) return null;
  const passed = Math.max(nPassed, 0);
  return { passed, failed: Math.max(nTotal - passed, 0) };
}
