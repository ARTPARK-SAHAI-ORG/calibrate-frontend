/**
 * Says a run was stopped before it finished. Amber, not red: a stopped run is
 * not a broken one, and the results it did collect are still worth reading.
 */
export function StoppedRunPill() {
  return (
    <span className="inline-flex items-center whitespace-nowrap px-2 py-0.5 rounded text-xs font-medium bg-amber-100 text-amber-700 dark:bg-amber-500/20 dark:text-amber-400">
      Stopped
    </span>
  );
}
