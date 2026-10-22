type KappaType =
  | "fleiss"
  | "linear_weighted_fleiss"
  | "cohen"
  | "linear_weighted_cohen";

export type AnswerKind = "binary" | "rating";

export const ANSWER_KIND_LABELS: Record<AnswerKind, string> = {
  binary: "Binary",
  rating: "Rating",
};

/** One kind of answer's kappa, for a number that covers both kinds. */
export type KappaByKind = KappaFields & { answer_kind: AnswerKind };

/** Rating answers are compared with a linear weighted kappa, pass/fail
 * answers with a plain one. Null when there is no kind to go by. */
export function answerKindOf(
  type: KappaType | null | undefined,
): AnswerKind | null {
  if (!type) return null;
  return type.startsWith("linear_weighted") ? "rating" : "binary";
}

/** Sent beside an agreement number that covers many items. Both are absent
 * on responses from before kappa existed, and null when there is too little
 * overlap to compute one. */
export type KappaFields = {
  kappa?: number | null;
  kappa_type?: KappaType | null;
  /** Why kappa is null although items were compared. Null otherwise. */
  kappa_blank_reason?: KappaBlankReason | null;
  /** Agreement chance alone would produce, 0 to 1. Null when kappa is blank
   * for any reason other than everyone agreeing. */
  chance_agreement?: number | null;
};

type KappaBlankReason = "too_few_items" | "everyone_agreed";

const KAPPA_BLANK_REASONS: Record<
  KappaBlankReason,
  { text: string; help: string }
> = {
  too_few_items: {
    text: "Too few items",
    help: "Kappa needs at least two items, because one item cannot show what chance alone would produce",
  },
  everyone_agreed: {
    text: "Everyone agreed",
    help: "Every answer was the same, so chance alone would also agree every time and kappa cannot be worked out",
  },
};

/** What to show in place of a kappa the server could not work out, or null
 * when there is a kappa or nothing was compared. */
export function kappaBlank(
  fields: KappaFields | null | undefined,
): { text: string; help: string } | null {
  if (fields?.kappa != null || !fields?.kappa_blank_reason) return null;
  return KAPPA_BLANK_REASONS[fields.kappa_blank_reason] ?? null;
}

const KAPPA_LABELS: Record<KappaType, string> = {
  fleiss: "Fleiss' kappa",
  linear_weighted_fleiss: "Linear weighted Fleiss' kappa",
  cohen: "Cohen's kappa",
  linear_weighted_cohen: "Linear weighted Cohen's kappa",
};

export function kappaLabel(type: KappaType | null | undefined): string {
  return (type && KAPPA_LABELS[type]) || "Kappa";
}

export function formatKappa(kappa: number): string {
  const text = kappa.toFixed(2);
  return text === "-0.00" ? "0.00" : text;
}
