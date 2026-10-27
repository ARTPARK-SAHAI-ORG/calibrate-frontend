type KappaType =
  | "fleiss"
  | "linear_weighted_fleiss"
  | "cohen"
  | "linear_weighted_cohen";

export type AnswerKind = "binary" | "rating";

/** Binary first, as every list of kinds shows them. */
export const ANSWER_KINDS: AnswerKind[] = ["binary", "rating"];

/** An agreement fraction as a whole percent, the number every bar and label
 * shows, so a colour picked from it never contradicts the text. */
export function percentOf(fraction: number): number {
  return Math.round(fraction * 100);
}

export function formatAgreement(fraction: number): string {
  return `${percentOf(fraction)}%`;
}

/** One kind of answer's kappa, for a number that covers both kinds. */
export type KappaByKind = KappaFields & {
  answer_kind: AnswerKind;
  /** Agreement on this kind of answer alone, 0 to 1. */
  agreement?: number | null;
  pair_count?: number;
};

/** An annotator's kappa for each kind of answer they were compared on. */
export type KappaByKindFields = { kappa_by_kind?: KappaByKind[] };

export function kappaForKind(
  kinds: readonly KappaByKind[] | null | undefined,
  kind: AnswerKind,
): KappaByKind | undefined {
  return kinds?.find((k) => k.answer_kind === kind);
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

/** One point on the agreement trend: a version, with its agreement and kappa. */
export type TrendPoint = {
  key: string;
  label: string;
  agreement: number | null;
  /** The live version, marked on the axis. */
  live?: boolean;
} & KappaFields;

/**
 * The chart rows for agreement and kappa over time. Agreement is a whole
 * percent; kappa keeps its own -1 to 1 scale, which drops below 0 only when
 * some kappa does. A point with no kappa has no kappa dot.
 */
export function buildTrendChart(points: readonly TrendPoint[]): {
  data: { key: string; label: string; agreement: number | null; kappa: number | null }[];
  kappaDomain: [number, number];
} {
  const data = points.map((p) => ({
    key: p.key,
    label: p.label,
    agreement: p.agreement == null ? null : percentOf(p.agreement),
    kappa: p.kappa == null ? null : Number(formatKappa(p.kappa)),
  }));
  const negative = data.some((p) => p.kappa != null && p.kappa < 0);
  return { data, kappaDomain: [negative ? -1 : 0, 1] };
}
