import { signOut } from "next-auth/react";
import { getBackendUrl, getDefaultHeaders, unwrapList } from "@/lib/api";
import { createRequestCache } from "@/lib/requestCache";
import type { EvaluatorType } from "@/components/EvaluatorPills";

/**
 * The list-level shape of an evaluator, shared by the `/evaluators` page, the
 * create/duplicate flows, and the agent Evaluators tab. Deliberately a subset
 * of the full evaluator record — enough to render cards, pills, and run
 * duplicate-name validation.
 */
export type EvaluatorData = {
  uuid: string;
  name: string;
  description: string;
  created_at: string;
  updated_at: string;
  /**
   * Returned by the list API but no longer meaningful for categorization: it's
   * set on EVERY evaluator now (defaults are per-org forks that carry an owner),
   * so it can't distinguish default from custom — use `is_default` for that.
   */
  owner_user_id?: string | null;
  /** True for org default (forked seed) evaluators. The ONLY default marker. */
  is_default?: boolean;
  data_type?: "text" | "audio";
  kind?: "single" | "side_by_side";
  output_type?: "binary" | "rating";
  evaluator_type?: EvaluatorType;
};

/**
 * Whether this is an org default (a forked seed). `is_default` is the sole
 * discriminator — `owner_user_id` is now set on every evaluator (defaults are
 * per-org forks) so it can't be used. This is the ONE place the default vs
 * custom test lives; every list/picker/pre-select site must call this (or its
 * inverse `isOwnedEvaluator`) rather than re-reading `is_default` inline, so a
 * future change to the marker is a single edit here.
 *
 * Accepts any object exposing `is_default` so the STT/TTS/test pickers can pass
 * their trimmed row shapes, not just the full `EvaluatorData`.
 *
 * NOTE: categorization only — NOT a permissions check. Org defaults are
 * editable/deletable forks, so edit/delete/new-version are allowed on both.
 */
export function isDefaultEvaluator(e: { is_default?: boolean | null }): boolean {
  return !!e.is_default;
}

/** Whether this is a user-created (custom) evaluator — the inverse of default. */
export function isOwnedEvaluator(e: { is_default?: boolean | null }): boolean {
  return !isDefaultEvaluator(e);
}

/**
 * Signs the user out on a 401 and returns true so callers can bail early.
 */
async function handledUnauthorized(response: Response): Promise<boolean> {
  if (response.status === 401) {
    await signOut({ callbackUrl: "/login" });
    return true;
  }
  return false;
}

/** Extract a human-readable error message from a failed evaluator response. */
export async function getEvaluatorErrorMessage(
  response: Response,
  fallback: string,
): Promise<string> {
  const contentType = response.headers.get("content-type");
  if (contentType?.includes("application/json")) {
    const data = await response.json().catch(() => null);
    if (data && typeof data.detail === "string") return data.detail;
  }

  const text = await response.text().catch(() => "");
  return text || fallback;
}

/** True when the failure is specifically a duplicate-name conflict. */
export function isEvaluatorNameConflict(
  response: Response,
  message: string,
): boolean {
  return response.status === 409 && message === "Evaluator name already exists";
}

/**
 * In-flight dedup for the evaluator library. Deliberately dedup-only (no
 * persisted result): the `/evaluators` page, the agent Evaluators tab, and the
 * Tests tab all call `fetchAllEvaluators` and can mount in the same tick, so
 * without this they fire duplicate fetches of a large list. A persisted cache
 * is avoided on purpose — evaluators are created, duplicated, and deleted from
 * many scattered call sites, so a stale cache would be hard to invalidate
 * reliably. Once the shared promise settles, the next call fetches fresh.
 */
const evaluatorLibraryFetch = createRequestCache<EvaluatorData[]>();

/**
 * Fetch the full evaluator library (owner-created + seeded defaults). Used by
 * the create/duplicate name checks and the "add existing" picker.
 */
export async function fetchAllEvaluators(
  accessToken: string,
): Promise<EvaluatorData[]> {
  return evaluatorLibraryFetch.fetch(accessToken, async () => {
    const response = await fetch(
      `${getBackendUrl()}/evaluators?include_defaults=true`,
      { method: "GET", headers: getDefaultHeaders(accessToken) },
    );
    if (await handledUnauthorized(response)) return [];
    if (!response.ok) throw new Error("Failed to fetch evaluators");
    return unwrapList<EvaluatorData>(await response.json());
  });
}

/** Fetch the evaluators currently attached to an agent. */
export async function fetchAgentEvaluators(
  agentUuid: string,
  accessToken: string,
): Promise<EvaluatorData[]> {
  const response = await fetch(
    `${getBackendUrl()}/agents/${agentUuid}/evaluators`,
    { method: "GET", headers: getDefaultHeaders(accessToken) },
  );
  if (await handledUnauthorized(response)) return [];
  if (!response.ok) throw new Error("Failed to fetch agent evaluators");
  return unwrapList<EvaluatorData>(await response.json());
}

/**
 * Add one or more evaluators to an agent in a single call (add-only; never
 * removes). The backend validates every id up front — a bad/foreign id fails
 * the whole request and links nothing — and returns which ids were newly
 * `linked` vs skipped as `already_linked`.
 */
export async function addEvaluatorsToAgent(
  agentUuid: string,
  evaluatorIds: string[],
  accessToken: string,
): Promise<{ linked: string[]; already_linked: string[] }> {
  const response = await fetch(
    `${getBackendUrl()}/agents/${agentUuid}/evaluators`,
    {
      method: "POST",
      headers: {
        ...getDefaultHeaders(accessToken),
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ evaluator_ids: evaluatorIds }),
    },
  );
  if (await handledUnauthorized(response)) {
    return { linked: [], already_linked: [] };
  }
  if (!response.ok) {
    throw new Error(
      await getEvaluatorErrorMessage(response, "Failed to add evaluators"),
    );
  }
  return response.json();
}

/** Detach an evaluator from an agent (the evaluator itself is kept). */
export async function detachEvaluatorFromAgent(
  agentUuid: string,
  evaluatorId: string,
  accessToken: string,
): Promise<void> {
  const response = await fetch(
    `${getBackendUrl()}/agents/${agentUuid}/evaluators/${evaluatorId}`,
    { method: "DELETE", headers: getDefaultHeaders(accessToken) },
  );
  if (await handledUnauthorized(response)) return;
  if (!response.ok) {
    throw new Error(
      await getEvaluatorErrorMessage(response, "Failed to remove evaluator"),
    );
  }
}

/** Permanently delete an evaluator. */
export async function deleteEvaluator(
  evaluatorId: string,
  accessToken: string,
): Promise<void> {
  const response = await fetch(`${getBackendUrl()}/evaluators/${evaluatorId}`, {
    method: "DELETE",
    headers: getDefaultHeaders(accessToken),
  });
  if (await handledUnauthorized(response)) return;
  if (!response.ok) {
    throw new Error(
      await getEvaluatorErrorMessage(response, "Failed to delete evaluator"),
    );
  }
}
