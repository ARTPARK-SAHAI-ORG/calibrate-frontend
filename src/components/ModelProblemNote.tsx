import { ErrorNote } from "@/components/ui";
import { formatRemovalDate, type ModelProblem } from "@/lib/modelAvailability";

/** What the reader can do about it, which differs by page: a saved evaluator
 *  version cannot change its model, and a comparison can drop one. */
const NEXT_STEP = {
  pick: "Pick another one.",
  newVersion: "Pick another model.",
  comparison: "Remove it or pick another one.",
} as const;

/**
 * The line under a saved model that cannot be used: red when it cannot be
 * used now, amber when it will be removed on a date still to come.
 */
export function ModelProblemNote({
  problem,
  nextStep,
  className = "",
}: {
  problem: ModelProblem | null;
  nextStep: keyof typeof NEXT_STEP;
  className?: string;
}) {
  if (!problem) return null;
  if (problem.kind === "soon") {
    return (
      <div
        className={`rounded-md border border-amber-500/40 bg-amber-500/10 p-3 text-xs md:text-sm leading-relaxed text-amber-700 dark:text-amber-300 ${className}`}
      >
        This model will be removed on {formatRemovalDate(problem.expiresOn)}.{" "}
        {nextStep === "pick"
          ? "Pick another one before then."
          : NEXT_STEP[nextStep]}
      </div>
    );
  }
  return (
    <ErrorNote className={className}>
      {problem.kind === "privacy"
        ? "This model cannot be used."
        : "This model is no longer available."}{" "}
      {NEXT_STEP[nextStep]}
    </ErrorNote>
  );
}
