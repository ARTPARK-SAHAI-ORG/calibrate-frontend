"use client";

import { nothingCanScoreCopy } from "@/lib/traceScoring";

const TAB_NAME = "Evaluators tab";

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
  // One reason already says what to do in the tab; the others still need it said.
  const copy = nothingCanScoreCopy(ineligible);
  const [before, after] = (
    copy.includes(TAB_NAME)
      ? copy
      : `${copy} Choose evaluators that can score traces in the ${TAB_NAME}.`
  ).split(TAB_NAME);

  return (
    <>
      {before}
      <button
        type="button"
        onClick={onGoToEvaluators}
        className="font-semibold cursor-pointer hover:opacity-80"
      >
        {TAB_NAME}
      </button>
      {after}
    </>
  );
}
