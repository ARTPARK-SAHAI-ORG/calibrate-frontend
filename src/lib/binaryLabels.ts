// Default labels for binary evaluator verdicts. Custom labels live on
// each evaluator version's `output_config.scale` as two entries with
// `value: true` and `value: false`.
export const DEFAULT_BINARY_TRUE_LABEL = "Correct";
export const DEFAULT_BINARY_FALSE_LABEL = "Wrong";

// Default label for a given true/false value. Use this instead of
// inlining the `value ? "Correct" : "Wrong"` ternary so the defaults
// stay in one place.
export function defaultBinaryLabel(value: boolean): string {
  return value ? DEFAULT_BINARY_TRUE_LABEL : DEFAULT_BINARY_FALSE_LABEL;
}

export type BinaryScaleEntryLike = {
  value: boolean | number | string;
  name?: string | null;
};

// Coerce a scale entry's `value` to a boolean for matching. Backend
// types allow boolean | number | string, so older / alternate snapshots
// may encode binary verdicts as 1/0 or "true"/"false" (or "yes"/"no").
// Normalise so the lookup catches them all.
export function coerceBinaryValue(v: unknown): boolean | null {
  if (typeof v === "boolean") return v;
  if (typeof v === "number") {
    if (v === 1) return true;
    if (v === 0) return false;
    return null;
  }
  if (typeof v === "string") {
    const t = v.trim().toLowerCase();
    if (t === "true" || t === "yes" || t === "1") return true;
    if (t === "false" || t === "no" || t === "0") return false;
    return null;
  }
  return null;
}

// Pull the custom label for a true/false verdict out of a scale array.
// Falls back to the default when the entry is missing or the name is blank.
export function getBinaryLabel(
  scale: readonly BinaryScaleEntryLike[] | null | undefined,
  value: boolean,
): string {
  const entry = scale?.find((e) => coerceBinaryValue(e.value) === value);
  const name = entry?.name?.trim();
  if (name) return name;
  return value ? DEFAULT_BINARY_TRUE_LABEL : DEFAULT_BINARY_FALSE_LABEL;
}

// Reshape an `output_config.scale` array into the `ratingScale` prop
// EvaluatorVerdictCard expects: numeric-valued entries with display
// names. Returns null when there's no scale, so callers can pass the
// result straight through without extra null checks.
export function toRatingScale(
  scale: readonly BinaryScaleEntryLike[] | null | undefined,
): { value: number; name: string | null }[] | null {
  if (!scale) return null;
  return scale
    .filter((e) => typeof e.value === "number")
    .map((e) => ({
      value: e.value as number,
      name: e.name ?? null,
    }));
}
