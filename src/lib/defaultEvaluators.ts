import { unwrapList } from "./api";

export const DEFAULT_LLM_NEXT_REPLY_SLUG = "default-llm-next-reply";

export type DefaultEvaluatorSummary = {
  uuid: string;
  name: string;
  description?: string | null;
  slug?: string | null;
  // Origin identity of a per-org default fork. Forks null out `slug`, so this
  // carries the built-in seed's slug (e.g. "default-llm-next-reply") and is the
  // reliable way to recognise a specific default across orgs.
  source_default_slug?: string | null;
  evaluator_type?: string;
};

/**
 * Whether this evaluator is the built-in next-reply correctness seed, matching
 * on `source_default_slug` (per-org forks) and falling back to `slug` (legacy
 * unforked seeds). `is_default` alone can't be used — every fork sets it, so it
 * doesn't single out the correctness evaluator.
 */
export function isDefaultLLMNextReplyEvaluator(e: {
  slug?: string | null;
  source_default_slug?: string | null;
}): boolean {
  return (
    e.source_default_slug === DEFAULT_LLM_NEXT_REPLY_SLUG ||
    e.slug === DEFAULT_LLM_NEXT_REPLY_SLUG
  );
}

export async function fetchDefaultLLMNextReplyEvaluator(
  backendUrl: string,
  accessToken: string,
): Promise<DefaultEvaluatorSummary | null> {
  const response = await fetch(`${backendUrl}/evaluators?include_defaults=true`, {
    method: "GET",
    headers: {
      accept: "application/json",
      Authorization: `Bearer ${accessToken}`,
    },
  });

  if (!response.ok) return null;

  const data = unwrapList<DefaultEvaluatorSummary>(await response.json());
  return (
    data.find(
      (e) => isDefaultLLMNextReplyEvaluator(e) && e.evaluator_type === "llm",
    ) ?? null
  );
}
