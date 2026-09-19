/**
 * The Success / Fail (and optional Not run) tally used on completed runs.
 * Counts live in the pill; a pill with a zero count is omitted.
 */
export const PILL_CLASS =
  "inline-flex items-center whitespace-nowrap px-2 py-0.5 rounded text-xs font-medium";

type PassFailCountPillsProps = {
  passed: number;
  failed: number;
  unanswered?: number;
};

export function PassFailCountPills({
  passed,
  failed,
  unanswered = 0,
}: PassFailCountPillsProps) {
  if (passed <= 0 && failed <= 0 && unanswered <= 0) return null;

  return (
    <span className="inline-flex flex-wrap items-center gap-2">
      {passed > 0 && (
        <span
          className={`${PILL_CLASS} bg-green-100 text-green-700 dark:bg-green-500/20 dark:text-green-500`}
        >
          {passed} Success
        </span>
      )}
      {failed > 0 && (
        <span
          className={`${PILL_CLASS} bg-red-100 text-red-700 dark:bg-red-500/20 dark:text-red-500`}
        >
          {failed} Fail
        </span>
      )}
      {unanswered > 0 && (
        <span
          className={`${PILL_CLASS} bg-amber-100 text-amber-700 dark:bg-amber-500/20 dark:text-amber-500`}
        >
          {unanswered} Not run
        </span>
      )}
    </span>
  );
}
