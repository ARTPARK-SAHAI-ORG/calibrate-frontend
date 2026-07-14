/**
 * After React paints red borders on invalid fields, scroll the first one
 * into view — but only if it isn't already visible (`block: "nearest"`).
 * Returns a cancel function for use in `useEffect` cleanup.
 */
export function scheduleScrollToFirstFieldError(
  container: HTMLElement | null | undefined,
): () => void {
  const timer = window.setTimeout(() => {
    const firstError = container?.querySelector(".border-red-500");
    if (
      firstError instanceof HTMLElement &&
      typeof firstError.scrollIntoView === "function"
    ) {
      firstError.scrollIntoView({
        behavior: "smooth",
        block: "nearest",
        inline: "nearest",
      });
    }
  }, 60);
  return () => window.clearTimeout(timer);
}
