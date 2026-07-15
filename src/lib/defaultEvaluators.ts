import { unwrapList } from "./api";

export const DEFAULT_LLM_NEXT_REPLY_SLUG = "default-llm-next-reply";

/**
 * Anything carrying a default evaluator's origin identity. Forks null out
 * `slug` and put the seed slug in `source_default_slug`; legacy unforked seeds
 * only have `slug`.
 */
export type DefaultSlugSource = {
  slug?: string | null;
  source_default_slug?: string | null;
};

export type DefaultEvaluatorSummary = DefaultSlugSource & {
  uuid: string;
  name: string;
  description?: string | null;
  evaluator_type?: string;
};

/**
 * The stable origin slug identifying WHICH built-in default an evaluator is.
 *
 * This is the ONE place the `source_default_slug` vs `slug` resolution lives —
 * every "is this the default X" check routes through here (via
 * `matchesDefaultSlug`), so if the backend ever changes how a fork records its
 * origin, this is the single line to update. `is_default` can't do this job: it
 * marks an evaluator as *a* default but doesn't say *which* one.
 */
export function defaultOriginSlug(e: DefaultSlugSource): string | null {
  return e.source_default_slug ?? e.slug ?? null;
}

/** Whether `e` is the built-in default identified by `slug`. */
export function matchesDefaultSlug(
  e: DefaultSlugSource,
  slug: string,
): boolean {
  return defaultOriginSlug(e) === slug;
}

/** Whether `e` is the built-in next-reply correctness default. */
export function isDefaultLLMNextReplyEvaluator(e: DefaultSlugSource): boolean {
  return matchesDefaultSlug(e, DEFAULT_LLM_NEXT_REPLY_SLUG);
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
