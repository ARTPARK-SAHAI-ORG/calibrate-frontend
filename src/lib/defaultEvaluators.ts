export const DEFAULT_LLM_NEXT_REPLY_SLUG = "default-llm-next-reply";

export type DefaultEvaluatorSummary = {
  uuid: string;
  name: string;
  description?: string | null;
  slug?: string | null;
  evaluator_type?: string;
};

export async function fetchDefaultLLMNextReplyEvaluator(
  backendUrl: string,
  accessToken: string,
): Promise<DefaultEvaluatorSummary | null> {
  const response = await fetch(`${backendUrl}/evaluators?include_defaults=true`, {
    method: "GET",
    headers: {
      accept: "application/json",
      "ngrok-skip-browser-warning": "true",
      Authorization: `Bearer ${accessToken}`,
    },
  });

  if (!response.ok) return null;

  const data: DefaultEvaluatorSummary[] = await response.json();
  return (
    data.find(
      (e) =>
        e.slug === DEFAULT_LLM_NEXT_REPLY_SLUG &&
        e.evaluator_type === "llm",
    ) ?? null
  );
}
