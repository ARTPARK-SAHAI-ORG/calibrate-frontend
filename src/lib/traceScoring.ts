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
      return "Uses variables, which cannot be filled for a trace automatically";
    default:
      return "Cannot score traces for this agent";
  }
}

/**
 * Why an agent with evaluators still cannot score its traces. The usual cause
 * is variables, which have nowhere to be filled in for a trace, so that case
 * says so plainly rather than leaving the reader to guess.
 */
export function nothingCanScoreCopy(
  ineligible: { reason: string }[],
): string {
  if (ineligible.length === 0) {
    return "This agent has no evaluators, so its traces are not scored.";
  }
  if (ineligible.every((item) => item.reason === "declares_variables")) {
    return "Every evaluator added to this agent uses variables, and variables cannot be filled for a trace automatically.";
  }
  return "None of this agent's evaluators can score traces.";
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
    default:
      return "Scoring did not finish";
  }
}
