import * as Sentry from "@sentry/nextjs";

/**
 * Report an error to Sentry — the single place catch blocks should funnel
 * failures through instead of `console.error`.
 *
 * Drop-in for `console.error(...)`: the call shape is identical (a message
 * string followed by the caught error and/or extra context), but the failure
 * is captured by Sentry rather than vanishing into the browser console. The
 * console output is preserved in development for local debugging.
 *
 * @param message  Short human description of where/what failed.
 * @param details  The caught error plus any extra context (status, ids, …).
 */
export function reportError(message: string, ...details: unknown[]): void {
  // Keep the familiar console output while developing locally.
  if (process.env.NODE_ENV !== "production") {
    console.error(message, ...details);
  }

  // Prefer a real Error from the args as the captured exception so Sentry
  // keeps the original stack trace; otherwise synthesize one from the message.
  const error = details.find((d) => d instanceof Error);
  Sentry.captureException(error ?? new Error(message), {
    extra: { message, details },
  });
}
