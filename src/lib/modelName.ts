import { splitServingProvider } from "./modelServingProvider";

/**
 * A model named the way a person says it: the model on its own, without the
 * company that makes it. "anthropic/claude-sonnet-4.6" reads as
 * "claude-sonnet-4.6". Runs carry the company either as "anthropic/claude" or
 * as "anthropic__claude", so both are handled. A name with no company in it is
 * returned unchanged.
 *
 * A model that was pinned to one of the companies serving it on OpenRouter
 * carries that company after an "@", and it is shown in brackets after the
 * name, so a comparison of the same model on two of them reads as two
 * different rows.
 */
export function displayModelName(model: string): string {
  const { model: bare, provider } = splitServingProvider(model);
  const name = bare.replace(/__/g, "/").split("/").filter(Boolean).pop() ?? bare;
  return provider ? `${name} (${provider})` : name;
}
