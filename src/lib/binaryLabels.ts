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

// Pull the custom label for a true/false verdict out of a scale array.
// Falls back to the default when the entry is missing or the name is blank.
export function getBinaryLabel(
  scale: readonly BinaryScaleEntryLike[] | null | undefined,
  value: boolean,
): string {
  const entry = scale?.find((e) => e.value === value);
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
