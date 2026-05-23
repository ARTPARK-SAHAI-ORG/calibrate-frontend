// Default labels for binary evaluator verdicts. Custom labels live on
// each evaluator version's `output_config.scale` as two entries with
// `value: true` and `value: false`.
export const DEFAULT_BINARY_TRUE_LABEL = "Correct";
export const DEFAULT_BINARY_FALSE_LABEL = "Wrong";

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
