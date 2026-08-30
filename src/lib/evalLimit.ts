import { getMaxRowsPerEval } from "@/hooks/useMaxRowsPerEval";
import { exceedsEvalLimit } from "@/constants/limits";

/**
 * The one way to ask "is this run too big to start?".
 *
 * Reads the workspace's limit and checks `count` against it. `count` is the
 * work the run creates, so callers multiply out anything that repeats a row:
 * tests times models in a model comparison, items times evaluators in a
 * labelling run. Shows the limit toast and returns true when it is over.
 *
 * Every place that starts a batch of work goes through this, whether it is the
 * button that opens a picker or the function that finally sends the request.
 */
export async function overEvalLimit(
  accessToken: string | null | undefined,
  count: number,
  noun: string,
): Promise<boolean> {
  const maxRows = await getMaxRowsPerEval(accessToken);
  return exceedsEvalLimit(count, maxRows, noun);
}
