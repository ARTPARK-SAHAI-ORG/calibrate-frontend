/**
 * The extra settings a model can be compared under, and how they are turned
 * into what is sent with it.
 *
 * A connection agent's own server is what calls the model, so Calibrate cannot
 * make it think harder or run on a particular host. All it can do is add fields
 * to the request body it already posts to that server, beside `model`, the same
 * way the agent's own custom request fields are added. That server has to read
 * them for them to change anything, which is what the note under the settings
 * says.
 *
 * Every setting writes into one `extra` object, so there is only ever one thing
 * on the wire however many controls sit on top of it.
 *
 * The same model can be compared against itself under different settings, which
 * is the whole point of a thinking level. Every result on a comparison is keyed
 * by the model string, so each row carries its settings inside that string
 * (`openai/gpt-5::thinking-high`) rather than a separate name alongside it. That
 * keeps two rows of one model apart everywhere at once, and `displayModelName`
 * is the single place that turns it back into words.
 */

/** How hard the model should think, when its own server passes this through. */
export const THINKING_LEVELS = [
  { value: "low", label: "Low" },
  { value: "medium", label: "Medium" },
  { value: "high", label: "High" },
] as const;

export type ThinkingLevel = (typeof THINKING_LEVELS)[number]["value"];

/**
 * The companies that host other companies' models on OpenRouter. Only offered
 * when the agent routes through OpenRouter, because it is the only entry in
 * `BENCHMARK_PROVIDERS` that chooses between hosts. The values are OpenRouter's
 * own provider slugs, so they are what its `provider.order` expects.
 */
export const MODEL_HOSTS = [
  { value: "openai", label: "OpenAI" },
  { value: "azure", label: "Azure" },
  { value: "anthropic", label: "Anthropic" },
  { value: "google-vertex", label: "Google Vertex" },
  { value: "amazon-bedrock", label: "AWS Bedrock" },
  { value: "fireworks", label: "Fireworks" },
  { value: "together", label: "Together" },
  { value: "groq", label: "Groq" },
] as const;

/** What the reader picked for one model row. Everything is optional: a row with
 *  nothing picked sends exactly what a comparison sent before these existed. */
export type BenchmarkModelSettings = {
  thinking?: ThinkingLevel;
  /** An OpenRouter provider slug from `MODEL_HOSTS`. */
  hostedBy?: string;
};

/** One model row as a comparison is started with: the string every result is
 *  keyed by, the model to actually call, and the fields to send with it. */
export type BenchmarkModelVariant = {
  id: string;
  model: string;
  extra?: Record<string, unknown>;
};

/** Separates a model from its settings inside a variant id. Two colons, because
 *  no model id contains them and it cannot be mistaken for part of a name. */
export const VARIANT_SEPARATOR = "::";

export function hasModelSettings(
  settings: BenchmarkModelSettings | undefined,
): boolean {
  return Boolean(settings?.thinking || settings?.hostedBy);
}

/**
 * The fields to add to the request body for one model, or undefined when the
 * reader picked nothing. Undefined is what keeps an untouched comparison's
 * request identical to before.
 *
 * A pinned host is sent as `provider.only` with `allow_fallbacks: false`, the
 * same pair the build-agent side of this uses. Without the flag OpenRouter
 * quietly serves a busy host's request from somewhere else, and a comparison
 * that measured another host is worse than one that failed.
 */
export function modelSettingsExtra(
  settings: BenchmarkModelSettings | undefined,
): Record<string, unknown> | undefined {
  if (!hasModelSettings(settings)) return undefined;
  const extra: Record<string, unknown> = {};
  if (settings?.thinking) extra.reasoning = { effort: settings.thinking };
  if (settings?.hostedBy) {
    extra.provider = { only: [settings.hostedBy], allow_fallbacks: false };
  }
  return extra;
}

/**
 * The settings spelled as one slug, in a fixed order so the same choices always
 * produce the same string. Empty when nothing is picked.
 */
export function modelSettingsSlug(
  settings: BenchmarkModelSettings | undefined,
): string {
  const parts: string[] = [];
  if (settings?.thinking) parts.push(`thinking-${settings.thinking}`);
  if (settings?.hostedBy) parts.push(`host-${settings.hostedBy}`);
  return parts.join("_");
}

/**
 * What every result for this row is keyed by. A row with no settings keeps the
 * plain model id, so an ordinary comparison is unchanged in every respect,
 * including the saved connection checks that are stored against a model id.
 */
export function benchmarkVariantId(
  model: string,
  settings?: BenchmarkModelSettings,
): string {
  const slug = modelSettingsSlug(settings);
  return slug ? `${model}${VARIANT_SEPARATOR}${slug}` : model;
}

/** The model a variant id actually calls, without its settings. */
export function modelOfVariantId(variantId: string): string {
  return variantId.split(VARIANT_SEPARATOR)[0];
}

/**
 * The settings half of a variant id, in words. "thinking-high_host-azure" reads
 * as "high thinking, on Azure". An unrecognised part is passed through as it
 * stands rather than dropped, so a comparison started by a newer version of the
 * app still says what it ran.
 */
export function describeSettingsSlug(slug: string): string {
  return slug
    .split("_")
    .filter(Boolean)
    .map((part) => {
      if (part.startsWith("thinking-")) {
        const value = part.slice("thinking-".length);
        const level = THINKING_LEVELS.find((l) => l.value === value);
        return `${level ? level.label.toLowerCase() : value} thinking`;
      }
      if (part.startsWith("host-")) {
        const value = part.slice("host-".length);
        const host = MODEL_HOSTS.find((h) => h.value === value);
        return `on ${host ? host.label : value}`;
      }
      return part;
    })
    .join(", ");
}

/** What one row's settings read as, for the line under its model name. Empty
 *  when nothing is picked. */
export function describeSettings(
  settings: BenchmarkModelSettings | undefined,
): string {
  return describeSettingsSlug(modelSettingsSlug(settings));
}

/**
 * What to send as `models`. A comparison where nobody touched the settings
 * sends the plain list of model ids it always sent, so every existing
 * comparison and rerun behaves exactly as before and the backend only meets the
 * new shape when there is something new to say.
 */
export function benchmarkModelsPayload(
  rows: { model: string; settings?: BenchmarkModelSettings }[],
): string[] | BenchmarkModelVariant[] {
  if (!rows.some((row) => hasModelSettings(row.settings))) {
    return rows.map((row) => row.model);
  }
  return rows.map((row) => ({
    id: benchmarkVariantId(row.model, row.settings),
    model: row.model,
    ...(modelSettingsExtra(row.settings) && {
      extra: modelSettingsExtra(row.settings),
    }),
  }));
}

/**
 * The rows to reopen the picker with when a comparison is run again. A variant
 * id is read back into the model and the settings that made it, so a rerun
 * opens with the same thinking levels and hosts already chosen.
 */
export function rowsFromModelIds(
  ids: string[],
): { model: string; settings: BenchmarkModelSettings }[] {
  return ids.map((id) => {
    const [model, slug] = id.split(VARIANT_SEPARATOR);
    const settings: BenchmarkModelSettings = {};
    for (const part of (slug ?? "").split("_").filter(Boolean)) {
      if (part.startsWith("thinking-")) {
        const value = part.slice("thinking-".length);
        if (THINKING_LEVELS.some((l) => l.value === value)) {
          settings.thinking = value as ThinkingLevel;
        }
      }
      if (part.startsWith("host-")) settings.hostedBy = part.slice("host-".length);
    }
    return { model, settings };
  });
}

/** Two rows asking for the same thing produce two identical columns, which says
 *  nothing and is never what the reader meant. */
export function duplicateModelRows(
  rows: { model: string; settings?: BenchmarkModelSettings }[],
): boolean {
  const seen = new Set<string>();
  for (const row of rows) {
    const id = benchmarkVariantId(row.model, row.settings);
    if (seen.has(id)) return true;
    seen.add(id);
  }
  return false;
}
