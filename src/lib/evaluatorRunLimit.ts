import { getMaxRowsPerEval } from "@/hooks/useMaxRowsPerEval";
import { exceedsEvalLimit } from "@/constants/limits";

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
  const maxRows = await getMaxRowsPerEval(accessToken);
  const total = itemCount * evaluatorCount;
  if (!exceedsEvalLimit(total, maxRows, "items")) return null;
  return `This run would score ${total} items, which is over your limit of ${maxRows}. Pick fewer items or fewer evaluators.`;
}
