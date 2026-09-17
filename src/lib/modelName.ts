/**
 * A model named the way a person says it: the model on its own, without the
 * company that makes it. "anthropic/claude-sonnet-4.6" reads as
 * "claude-sonnet-4.6". Runs carry the company either as "anthropic/claude" or
 * as "anthropic__claude", so both are handled. A name with no company in it is
 * returned unchanged.
 */
export function displayModelName(model: string): string {
  return model.replace(/__/g, "/").split("/").filter(Boolean).pop() ?? model;
}
