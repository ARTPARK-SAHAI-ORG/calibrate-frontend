import { getMaxRowsPerEval } from "@/hooks/useMaxRowsPerEval";
import { overEvalLimit } from "@/lib/evalLimit";

/**
 * The size check both ways of running evaluators over labelling items go
 * through: the Run button on a task, and Re-run on a finished run.
 *
 * Every item is scored once per evaluator, so the work is items times
 * evaluators. Returns null when the run may start, or the line to show next to
 * the button when it is too big (the limit toast has already been shown).
 */
export async function evaluatorRunLimitMessage(
  accessToken: string | null | undefined,
  itemCount: number,
  evaluatorCount: number,
): Promise<string | null> {
  const total = itemCount * evaluatorCount;
  if (
    !(await overEvalLimit(
      accessToken,
      total,
      "items",
      "labelling_evaluator_run",
    ))
  )
    return null;
  const maxRows = await getMaxRowsPerEval(accessToken);
  return `This run would score ${total} items, which is over your limit of ${maxRows}. Pick fewer items or fewer evaluators.`;
}
