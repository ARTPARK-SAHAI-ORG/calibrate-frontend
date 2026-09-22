/**
 * Two rules for loading the Items tab's list, kept out of the page so each
 * has a test.
 */

/**
 * Score filters name evaluators, so the list waits for the task's evaluators
 * before asking, or every filter would be thrown away as unknown. Once the
 * task request has answered, even with an error, it stops waiting so the
 * task's own error shows instead of a list that never loads.
 */
export function waitForTaskEvaluators(
  scoreFilterCount: number,
  hasTask: boolean,
  taskAnswered: boolean,
): boolean {
  return scoreFilterCount > 0 && !hasTask && !taskAnswered;
}

/**
 * Filters change the list on every click, so an older answer can arrive after
 * a newer one. `start()` marks a new request and returns a check that stays
 * true only while no later request has started.
 */
export function latestRequestGuard() {
  let latest = 0;
  return {
    start() {
      const id = ++latest;
      return () => id === latest;
    },
  };
}
