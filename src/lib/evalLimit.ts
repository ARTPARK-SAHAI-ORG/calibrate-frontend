import { getMaxRowsPerEval } from "@/hooks/useMaxRowsPerEval";
import { exceedsEvalLimit } from "@/constants/limits";
import { apiPost } from "@/lib/api";
import { reportError } from "@/lib/reportError";

/** What kind of run hit the limit, as `POST /org-limits/hits` names it. */
export type EvalKind =
  | "test_run"
  | "model_comparison"
  | "stt"
  | "tts"
  | "labelling_evaluator_run";

/**
 * The one way to ask "is this run too big to start?".
 *
 * Reads the workspace's limit and checks `count` against it. `count` is the
 * work the run creates, so callers multiply out anything that repeats a row:
 * tests times models in a model comparison, items times evaluators in a
 * labelling run. Shows the limit toast and returns true when it is over, and
 * records the refusal with the backend without waiting for it.
 *
 * Every place that starts a batch of work goes through this, whether it is the
 * button that opens a picker or the function that finally sends the request.
 */
export async function overEvalLimit(
  accessToken: string | null | undefined,
  count: number,
  noun: string,
  kind: EvalKind,
): Promise<boolean> {
  const maxRows = await getMaxRowsPerEval(accessToken);
  if (!exceedsEvalLimit(count, maxRows, noun)) return false;
  if (accessToken) {
    apiPost("/org-limits/hits", accessToken, {
      limit_name: "max_rows_per_eval",
      kind,
      requested: count,
    }).catch((error) => reportError("Failed to record limit hit", error));
  }
  return true;
}
