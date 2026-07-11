import { signOut } from "next-auth/react";
import { getBackendUrl, getDefaultHeaders, unwrapList } from "@/lib/api";
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
   * Present on the top-level `/evaluators` list (null for built-in defaults).
   * NOT returned by `GET /agents/{uuid}/evaluators`, which sends `is_default`
   * instead — use `isOwnedEvaluator()` to decide ownership across both shapes.
   */
  owner_user_id?: string | null;
  /** True for built-in default evaluators. Returned by the agent list. */
  is_default?: boolean;
  data_type?: "text" | "audio";
  kind?: "single" | "side_by_side";
  output_type?: "binary" | "rating";
  evaluator_type?: EvaluatorType;
};

/**
 * Whether the current user owns this evaluator (i.e. can delete/edit it),
 * tolerating both list shapes: the agent list exposes `is_default`, the
 * top-level `/evaluators` list exposes `owner_user_id` (null = built-in).
 */
export function isOwnedEvaluator(e: EvaluatorData): boolean {
  if (typeof e.is_default === "boolean") return !e.is_default;
  return !!e.owner_user_id;
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
 * Fetch the full evaluator library (owner-created + seeded defaults). Used by
 * the create/duplicate name checks and the "add existing" picker.
 */
export async function fetchAllEvaluators(
  accessToken: string,
): Promise<EvaluatorData[]> {
  const response = await fetch(
    `${getBackendUrl()}/evaluators?include_defaults=true`,
    { method: "GET", headers: getDefaultHeaders(accessToken) },
  );
  if (await handledUnauthorized(response)) return [];
  if (!response.ok) throw new Error("Failed to fetch evaluators");
  return unwrapList<EvaluatorData>(await response.json());
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
 * Set the agent's complete evaluator set in one atomic call (recommended over
 * per-item attach/detach). The backend reconciles: ids not yet linked are
 * linked, currently-linked ids missing from the list are unlinked. Passing
 * `[]` clears all links. Duplicate ids are rejected (400), so callers must
 * de-dupe.
 */
export async function setAgentEvaluators(
  agentUuid: string,
  evaluatorIds: string[],
  accessToken: string,
): Promise<{ evaluator_ids: string[]; linked: string[]; unlinked: string[] }> {
  const response = await fetch(
    `${getBackendUrl()}/agents/${agentUuid}/evaluators`,
    {
      method: "PUT",
      headers: {
        ...getDefaultHeaders(accessToken),
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ evaluator_ids: evaluatorIds }),
    },
  );
  if (await handledUnauthorized(response)) {
    return { evaluator_ids: [], linked: [], unlinked: [] };
  }
  if (!response.ok) {
    throw new Error(
      await getEvaluatorErrorMessage(response, "Failed to update evaluators"),
    );
  }
  return response.json();
}

/** Attach an evaluator to an agent. */
export async function attachEvaluatorToAgent(
  agentUuid: string,
  evaluatorId: string,
  accessToken: string,
): Promise<void> {
  const response = await fetch(
    `${getBackendUrl()}/agents/${agentUuid}/evaluators`,
    {
      method: "POST",
      headers: {
        ...getDefaultHeaders(accessToken),
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ evaluator_id: evaluatorId }),
    },
  );
  if (await handledUnauthorized(response)) return;
  if (!response.ok) {
    throw new Error(
      await getEvaluatorErrorMessage(response, "Failed to add evaluator"),
    );
  }
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
