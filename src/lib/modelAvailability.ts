import type {
  LLMModel,
  LLMProvider,
} from "@/components/agent-tabs/constants/providers";

/**
 * What OpenRouter says about every model it serves, read once with the model
 * list. `models` holds every model OpenRouter lists, whichever providers this
 * deployment allows, so a saved model can be told apart from one OpenRouter
 * has dropped. `privacyAllowed` is the set of models with a provider that
 * keeps no copy of the data; null when this deployment does not require that,
 * or the workspace uses its own OpenRouter key.
 */
export type ModelAvailability = {
  models: Map<string, { expiresOn: string | null }>;
  privacyAllowed: Set<string> | null;
};

export type ModelProblem =
  | { kind: "retired" }
  | { kind: "privacy" }
  | { kind: "soon"; expiresOn: string };

/** Why a model cannot be used, or will not be soon. Null when it is fine, or
 *  while the model list is not known, so a slow OpenRouter never blocks
 *  anything. */
export function modelProblem(
  id: string,
  availability: ModelAvailability | null,
  now: number = Date.now(),
): ModelProblem | null {
  if (!availability || !id) return null;
  const model = availability.models.get(id);
  if (!model) return { kind: "retired" };
  const expires = model.expiresOn ? Date.parse(model.expiresOn) : NaN;
  if (!Number.isNaN(expires) && expires < now) return { kind: "retired" };
  if (availability.privacyAllowed && !availability.privacyAllowed.has(id)) {
    return { kind: "privacy" };
  }
  if (!Number.isNaN(expires)) {
    return { kind: "soon", expiresOn: model.expiresOn as string };
  }
  return null;
}

/** A problem that stops the model from being used now, rather than a
 *  warning about a date still to come. */
export function blocksUse(problem: ModelProblem | null): boolean {
  return problem !== null && problem.kind !== "soon";
}

/** "11 December 2026", or "11 Dec" when `short`. Read as a calendar date, so
 *  no time zone moves it a day. */
export function formatRemovalDate(isoDate: string, short = false): string {
  const [y, m, d] = isoDate.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString("en-GB", {
    day: "numeric",
    month: short ? "short" : "long",
    ...(short ? {} : { year: "numeric" }),
    timeZone: "UTC",
  });
}

/** The saved model as the picker shows it: its name from the list when the
 *  list has it, else its id, so a model that has gone still has a row. */
export function resolveSavedModel(
  id: string,
  providers: LLMProvider[],
): LLMModel {
  for (const provider of providers) {
    const found = provider.models.find((m) => m.id === id);
    if (found) return found;
  }
  return { id, name: id };
}
