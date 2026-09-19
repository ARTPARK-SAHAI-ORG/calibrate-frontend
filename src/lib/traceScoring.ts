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

/** Why a linked evaluator cannot score this agent's traces. */
export function ineligibleReasonCopy(
  reason: TraceScoringIneligibleReason | string,
): string {
  switch (reason) {
    case "wrong_type_for_agent":
      return "Is not the kind of evaluator this agent uses";
    case "no_live_version":
      return "Has no live version";
    case "declares_variables":
      return "Uses variables, which cannot be filled in for a trace";
    default:
      return "Cannot score traces for this agent";
  }
}

/** Why a scoring run was skipped or failed. */
export function scoringRunErrorCopy(error: string | null | undefined): string {
  switch (error) {
    case "over_limit":
      return "This workspace has scored as many traces as its limit allows";
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
