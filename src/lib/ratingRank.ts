export type RatingRank = "best" | "middle" | "worst";

// On a rating scale the highest number is the best and the lowest the worst.
// No rank when the highest and lowest are the same number.
export function ratingRank(
  value: number,
  lowest: number | undefined,
  highest: number | undefined,
): RatingRank | null {
  if (lowest !== undefined && lowest === highest) return null;
  if (value === highest) return "best";
  if (value === lowest) return "worst";
  return "middle";
}

export function scaleBounds(values: number[]) {
  return { lowest: Math.min(...values), highest: Math.max(...values) };
}
