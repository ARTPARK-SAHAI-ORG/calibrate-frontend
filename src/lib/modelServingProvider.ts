/**
 * OpenRouter serves most models from several companies at once (DeepInfra,
 * Novita, SambaNova and so on), each at its own price. The choice of which
 * company serves a model rides inside the model string itself, as
 * `model@companySlug`, e.g. `deepseek/deepseek-chat-v3.1@deepinfra`.
 *
 * It rides in the string because every result, leaderboard row, rerun and
 * shared link is already keyed by the model string. Putting the choice there
 * means the same model served by two companies is just two ordinary rows, and
 * nothing downstream needs a second field to carry the choice around.
 *
 * This file is the one place that format is written and read.
 */

/** Add the serving company to a model id. A blank slug leaves the id alone. */
export function withServingProvider(
  modelId: string,
  slug: string | null | undefined,
): string {
  if (!slug || !slug.trim()) return modelId;
  return `${modelId}@${slug.trim()}`;
}

/**
 * Split a model string back into the model and the serving company.
 * Splits on the LAST `@`, so a model id that contains one of its own keeps it.
 */
export function splitServingProvider(model: string): {
  model: string;
  provider: string | null;
} {
  const at = model.lastIndexOf("@");
  if (at <= 0 || at === model.length - 1) return { model, provider: null };
  return { model: model.slice(0, at), provider: model.slice(at + 1) };
}
