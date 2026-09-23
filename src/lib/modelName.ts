import {
  VARIANT_SEPARATOR,
  describeSettingsSlug,
} from "./benchmarkModelSettings";

/**
 * A model named the way a person says it: the model on its own, without the
 * company that makes it. "anthropic/claude-sonnet-4.6" reads as
 * "claude-sonnet-4.6". Runs carry the company either as "anthropic/claude" or
 * as "anthropic__claude", so both are handled. A name with no company in it is
 * returned unchanged.
 *
 * A comparison can run one model twice under different settings, so a row's
 * settings are carried inside the model string after two colons
 * ("openai/gpt-5::thinking-high"). Two rows of one model have to read apart
 * wherever they are shown, so the settings are added in brackets after the
 * name: "gpt-5 (high thinking)". A model with no settings is the plain name it
 * always was.
 */
export function displayModelName(model: string): string {
  const [base, ...slug] = model.split(VARIANT_SEPARATOR);
  const name =
    base.replace(/__/g, "/").split("/").filter(Boolean).pop() ?? base;
  const settings = describeSettingsSlug(slug.join(VARIANT_SEPARATOR));
  return settings ? `${name} (${settings})` : name;
}
