/**
 * Shared retry helper for failed STT / TTS evaluation runs. Both pages
 * reconstruct a new evaluation from the failed run's saved details
 * (dataset_id, providers, language, evaluator uuids) and post to the
 * matching `/{kind}/evaluate` endpoint.
 *
 * Returns either the new run's task id or a human-readable error string —
 * the caller is responsible for rendering the error and for
 * `router.push`ing to the new task.
 */

export type EvaluationKind = "stt" | "tts";

/**
 * Structural shape of the page's `evaluationResult` state — we only need a
 * narrow subset of fields, but both auth pages have the full type.
 */
export type RetryableEvaluation = {
  dataset_id?: string | null;
  language?: string | null;
  evaluator_uuids?: string[] | null;
  provider_results?: Array<{
    provider: string;
    evaluator_runs?: Array<{ evaluator_uuid?: string | null }> | null;
  }> | null;
};

export type RetryResult =
  | { ok: true; taskId: string }
  | { ok: false; error: string; status?: number };

export async function retryEvaluation(
  kind: EvaluationKind,
  evaluation: RetryableEvaluation,
  accessToken: string,
): Promise<RetryResult> {
  const backendUrl = process.env.NEXT_PUBLIC_BACKEND_URL;
  if (!backendUrl) {
    return { ok: false, error: "Backend URL is not configured." };
  }
  const datasetId = evaluation.dataset_id;
  if (!datasetId) {
    return {
      ok: false,
      error:
        "This run cannot be retried — no saved dataset is associated with it.",
    };
  }

  const providers = (evaluation.provider_results ?? [])
    .map((p) => p.provider)
    .filter((p): p is string => !!p);

  // Union the canonical new-format `evaluator_runs[].evaluator_uuid` with
  // the legacy top-level `evaluator_uuids`, so a payload that only carries
  // one of the two still produces a complete uuid set.
  const evaluatorUuidsSet = new Set<string>();
  for (const pr of evaluation.provider_results ?? []) {
    for (const run of pr.evaluator_runs ?? []) {
      if (run.evaluator_uuid) evaluatorUuidsSet.add(run.evaluator_uuid);
    }
  }
  for (const u of evaluation.evaluator_uuids ?? []) {
    if (u) evaluatorUuidsSet.add(u);
  }
  const evaluatorUuids = Array.from(evaluatorUuidsSet);

  if (evaluatorUuids.length === 0) {
    return {
      ok: false,
      error:
        "Couldn't determine which evaluators to run for the retry. Try re-creating the evaluation manually from the dataset page.",
    };
  }

  let res: Response;
  try {
    res = await fetch(`${backendUrl}/${kind}/evaluate`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        accept: "application/json",
        Authorization: `Bearer ${accessToken}`,
      },
      body: JSON.stringify({
        dataset_id: datasetId,
        providers,
        language: evaluation.language,
        evaluator_uuids: evaluatorUuids,
      }),
    });
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : "Network error.",
    };
  }

  if (res.status === 401) {
    // Caller handles the redirect to /login; surface the status so it can.
    return { ok: false, error: "Session expired. Please sign in again.", status: 401 };
  }

  if (!res.ok) {
    let detail = `Retry failed (${res.status})`;
    try {
      const body = (await res.json()) as { detail?: string; message?: string };
      if (typeof body?.detail === "string" && body.detail.length > 0) {
        detail = body.detail;
      } else if (
        typeof body?.message === "string" &&
        body.message.length > 0
      ) {
        detail = body.message;
      }
    } catch {
      // ignore — keep the status-based fallback message
    }
    return { ok: false, error: detail, status: res.status };
  }

  let body: { task_id?: string } = {};
  try {
    body = await res.json();
  } catch {
    // fall through
  }
  if (!body.task_id) {
    return {
      ok: false,
      error: "Retry succeeded but no task id was returned.",
    };
  }
  return { ok: true, taskId: body.task_id };
}
