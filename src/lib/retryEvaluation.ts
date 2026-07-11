/**
 * Shared retry helper for failed STT / TTS evaluation runs. Both pages
 * reconstruct a new evaluation from the failed run's saved details
 * (dataset_id, providers, language, evaluator uuids) and post to the
 * matching `/{kind}/evaluate` endpoint.
 *
 * A run that fails *before emitting any rows* has empty `provider_results`
 * and empty `evaluator_runs`, so those result-time artifacts can't tell us
 * which providers/evaluators the run was configured with. When that happens
 * we fall back to the run's persisted configuration on the `/jobs` list
 * endpoint (`details.providers` / `details.language` / `details.evaluator_uuids`),
 * which survives regardless of whether the run produced output. Without this
 * fallback such runs can't be retried at all ("Couldn't determine which
 * providers/evaluators to run" — or a backend "Evaluator … not found" when a
 * stale/partial uuid slips through).
 *
 * Returns either the new run's task id or a human-readable error string —
 * the caller is responsible for rendering the error and for
 * `router.push`ing to the new task.
 *
 * Plausible backend failures we surface:
 *   - 404 `Dataset not found`          — dataset deleted since the run
 *   - 404 `Evaluator <uuid> not found` — evaluator deleted
 *   - 400 `Evaluator … has no live version`
 *   - 400 `Evaluator … has evaluator_type='X' …` — rare; type changed
 *   - 400 `Dataset has no items`
 *   - 400 `At least one provider …`    — pre-empted below
 *   - 500 (infra)                       — generic message
 */

import { parseBackendErrorResponse } from "./parseBackendError";

export type EvaluationKind = "stt" | "tts";

/**
 * Structural shape of the page's `evaluationResult` state — we only need a
 * narrow subset of fields, but both auth pages have the full type.
 */
export type RetryableEvaluation = {
  /** The run's own task id — used to look up its persisted config on `/jobs`. */
  task_id?: string | null;
  dataset_id?: string | null;
  language?: string | null;
  evaluator_uuids?: string[] | null;
  provider_results?: Array<{
    provider: string;
    evaluator_runs?: Array<{ evaluator_uuid?: string | null }> | null;
  }> | null;
};

/** The subset of a `/jobs` entry we read to recover a run's configuration. */
type JobConfig = {
  providers: string[];
  evaluatorUuids: string[];
  language?: string | null;
};

/**
 * Recover a run's *configured* providers / evaluators / language from the
 * `/jobs` list endpoint. Unlike the `/{kind}/evaluate/{id}` detail payload —
 * which reconstructs providers from `provider_results` (empty on a run that
 * failed before emitting rows) — `/jobs` persists the original config under
 * `details`, so it survives such a failure. Returns null on any error so the
 * caller can degrade gracefully.
 */
async function fetchJobConfig(
  kind: EvaluationKind,
  taskId: string,
  backendUrl: string,
  accessToken: string,
): Promise<JobConfig | null> {
  try {
    const res = await fetch(`${backendUrl}/jobs?job_type=${kind}`, {
      method: "GET",
      headers: {
        accept: "application/json",
        Authorization: `Bearer ${accessToken}`,
      },
    });
    if (!res.ok) return null;
    const data: {
      jobs?: Array<{
        uuid?: string;
        details?: {
          providers?: string[] | null;
          language?: string | null;
          evaluator_uuids?: string[] | null;
        } | null;
      }>;
    } = await res.json();
    const job = (data.jobs ?? []).find((j) => j.uuid === taskId);
    if (!job?.details) return null;
    return {
      providers: (job.details.providers ?? []).filter(
        (p): p is string => !!p,
      ),
      evaluatorUuids: (job.details.evaluator_uuids ?? []).filter(
        (u): u is string => !!u,
      ),
      language: job.details.language,
    };
  } catch {
    return null;
  }
}

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

  let language = evaluation.language;

  // A run that failed before emitting rows has no result-time providers or
  // evaluator_runs to reconstruct from. Recover the run's original config from
  // `/jobs` so the retry can proceed instead of dead-ending.
  if (
    (providers.length === 0 || evaluatorUuidsSet.size === 0) &&
    evaluation.task_id
  ) {
    const cfg = await fetchJobConfig(
      kind,
      evaluation.task_id,
      backendUrl,
      accessToken,
    );
    if (cfg) {
      if (providers.length === 0) providers.push(...cfg.providers);
      for (const u of cfg.evaluatorUuids) evaluatorUuidsSet.add(u);
      if (!language) language = cfg.language ?? null;
    }
  }

  if (providers.length === 0) {
    // Pre-empt the backend's `At least one provider must be specified` 400.
    return {
      ok: false,
      error:
        "Couldn't determine which providers to run for the retry. Try re-creating the evaluation manually.",
    };
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
        language,
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
    const detail = await parseBackendErrorResponse(
      res,
      `retryEvaluation(${kind})`,
    );
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
