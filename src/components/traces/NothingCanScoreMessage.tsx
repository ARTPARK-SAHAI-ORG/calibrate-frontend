"use client";

import { nothingCanScoreCopy } from "@/lib/traceScoring";

/** The words "Evaluators tab", as a button that opens that tab. */
export function EvaluatorsTabLink({
  onGoToEvaluators,
}: {
  onGoToEvaluators: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onGoToEvaluators}
      className="font-semibold cursor-pointer hover:opacity-80"
    >
      Evaluators tab
    </button>
  );
}

/**
 * Why this agent's traces are not being scored, and where to fix it. The same
 * words wherever it is said: the banner above the table and the switch in
 * Settings. Each caller draws its own box around it.
 */
export function NothingCanScoreMessage({
  ineligible,
  onGoToEvaluators,
}: {
  ineligible: { reason: string }[];
  onGoToEvaluators: () => void;
}) {
  return (
    <>
      {nothingCanScoreCopy(ineligible)}{" "}
      <EvaluatorsTabLink onGoToEvaluators={onGoToEvaluators} />.
    </>
  );
}
