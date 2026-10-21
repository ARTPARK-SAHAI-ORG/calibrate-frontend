/**
 * A backend timestamp as a Date. The backend writes UTC either with no zone
 * ("2026-01-18 09:30:00") or with one ("2026-01-18T09:30:00.000Z",
 * "...+00:00"); a time with no zone is read as UTC, not as local time.
 */
export function parseBackendTime(value: string): Date {
  const hasZone = /(Z|[+-]\d{2}:?\d{2})$/.test(value);
  return new Date(hasZone ? value : `${value.replace(" ", "T")}Z`);
}

/**
 * How long ago a backend timestamp was, in a few characters ("3 min ago").
 * Shared by every list that shows when something last changed.
 *
 * Accepts both shapes the backend sends: "2026-01-18 09:30:00" (UTC with no
 * marker) and "2026-01-18T09:30:00.000Z".
 */
export function formatRelativeTime(dateString: string): string {
  const date = parseBackendTime(dateString);

  const diffInSeconds = Math.floor((Date.now() - date.getTime()) / 1000);
  if (diffInSeconds < 60) return "now";

  const diffInMinutes = Math.floor(diffInSeconds / 60);
  if (diffInMinutes < 60) return `${diffInMinutes} min ago`;

  const diffInHours = Math.floor(diffInMinutes / 60);
  if (diffInHours < 24) return `${diffInHours}h ago`;

  const diffInDays = Math.floor(diffInHours / 24);
  if (diffInDays < 7)
    return diffInDays === 1 ? "yesterday" : `${diffInDays}d ago`;

  const diffInWeeks = Math.floor(diffInDays / 7);
  if (diffInWeeks < 4) return `${diffInWeeks}w ago`;

  const diffInMonths = Math.floor(diffInDays / 30);
  if (diffInMonths < 12) return `${diffInMonths}m ago`;

  return `${Math.floor(diffInDays / 365)}y ago`;
}
