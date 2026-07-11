/**
 * Shared retry helper for failed STT / TTS evaluation runs.
 *
 * Calls `POST /{kind}/evaluate/{task_id}/retry`. The backend re-runs the job
 * in place using its stored configuration (providers, dataset, evaluators),
 * so the caller can reload the same task page and resume polling.
 *
 * Plausible backend failures we surface:
 *   - 404 `Task not found` — job deleted or wrong org
 *   - 400 `Cannot retry a job that is still in progress`
 *   - 400 `Original job is missing provider configuration`
 *   - 500 (infra) — generic message
 */

import { parseBackendErrorResponse } from "./parseBackendError";

export type EvaluationKind = "stt" | "tts";

export type RetryResult =
  | { ok: true; taskId: string; status: string }
  | { ok: false; error: string; status?: number };

export async function retryEvaluation(
  kind: EvaluationKind,
  taskId: string,
  accessToken: string,
): Promise<RetryResult> {
  const backendUrl = process.env.NEXT_PUBLIC_BACKEND_URL;
  if (!backendUrl) {
    return { ok: false, error: "Backend URL is not configured." };
  }
  if (!taskId) {
    return {
      ok: false,
      error: "This run cannot be retried — missing task id.",
    };
  }

  let res: Response;
  try {
    res = await fetch(`${backendUrl}/${kind}/evaluate/${taskId}/retry`, {
      method: "POST",
      headers: {
        accept: "application/json",
        Authorization: `Bearer ${accessToken}`,
      },
    });
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : "Network error.",
    };
  }

  if (res.status === 401) {
    return {
      ok: false,
      error: "Session expired. Please sign in again.",
      status: 401,
    };
  }

  if (!res.ok) {
    const detail = await parseBackendErrorResponse(
      res,
      `retryEvaluation(${kind})`,
    );
    return { ok: false, error: detail, status: res.status };
  }

  let body: { task_id?: string; status?: string } = {};
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
  return {
    ok: true,
    taskId: body.task_id,
    status: body.status ?? "queued",
  };
}
