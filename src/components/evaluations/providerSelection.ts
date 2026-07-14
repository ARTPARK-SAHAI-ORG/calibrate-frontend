/**
 * Prune a set of selected provider labels down to those still allowed.
 *
 * Used by the STT/TTS eval pages to drop selections that became invalid once
 * the language filter or the enabled-providers set (GET /providers) resolved.
 * Returns the same `prev` reference when nothing changed, so callers can pass
 * it straight to `setSelectedProviders` without triggering a needless re-render.
 */
export function pruneSelectionToAllowed(
  prev: Set<string>,
  allowedLabels: Set<string>,
): Set<string> {
  if ([...prev].every((label) => allowedLabels.has(label))) return prev;
  return new Set([...prev].filter((label) => allowedLabels.has(label)));
}
