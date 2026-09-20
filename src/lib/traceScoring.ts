import type {
  TraceScoringIneligibleReason,
  TraceScoringStatus,
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
export function nothingCanScoreCopy(ineligible: { reason: string }[]): string {
  if (ineligible.length === 0) {
    return "This agent has no evaluators, so its traces are not scored.";
  }
  if (ineligible.every((item) => item.reason === "declares_variables")) {
    return "Every evaluator added to this agent uses variables, and variables cannot be filled for a trace automatically.";
  }
  return "None of this agent's evaluators can score traces.";
}

/**
 * Why a scoring run was skipped or failed.
 *
 * The backend also has `trace_deleted` and `agent_deleted`, which no reader
 * can reach: a run abandoned because its trace or its agent went away has no
 * row left to show it on. They fall through to the general line.
 */
export function scoringRunErrorCopy(error: string | null | undefined): string {
  switch (error) {
    case "over_limit":
      return "This workspace has reached its limit for scoring traces";
    case "no_usable_evaluators":
      return "No evaluators could score this trace";
    case "scoring_disabled":
      return "Monitoring was turned off before this trace was scored";
    case "unsupported_interaction_type":
      return "This kind of agent cannot be scored yet";
    default:
      return "Scoring did not finish";
  }
}
