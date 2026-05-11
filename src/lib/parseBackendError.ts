/**
 * Shared backend-error parsing for surfaces that POST to the calibrate API
 * and need to render the failure to a user.
 *
 * Handles the three response shapes the API emits:
 *
 *   1. Application errors: `{ detail: "Human-readable string" }`
 *      → return the string verbatim. Backend messages on 400/404 are
 *      explicitly user-facing per the API docs.
 *
 *   2. FastAPI validation errors (422): `{ detail: [{ msg, loc }, …] }`
 *      → join the `msg`s. Should be rare for our hand-rolled payloads, but
 *      worth catching so we don't render `Request failed (422)`.
 *
 *   3. Server errors (5xx): per the API docs, the detail message may
 *      include infra info. Replace with a generic toast string; log the
 *      backend detail to console for ops.
 */

const GENERIC_5XX_MESSAGE =
  "Something went wrong on our end. Please try again in a moment.";

type DetailObject = { detail?: unknown; message?: unknown };

/**
 * Extracts a user-renderable error string from a `fetch` Response that
 * wasn't 2xx. Reads the body and returns:
 *
 *   - the `detail` string, when present;
 *   - a joined FastAPI validation message, for 422 array shapes;
 *   - a generic message for 5xx, with the detail logged to console;
 *   - a fallback `Request failed (N)` otherwise.
 */
export async function parseBackendErrorResponse(
  res: Response,
  logPrefix?: string,
): Promise<string> {
  let body: DetailObject = {};
  try {
    body = (await res.json()) as DetailObject;
  } catch {
    // Empty / non-JSON body — fall through to status-based message.
  }

  if (res.status >= 500) {
    if (logPrefix && body?.detail) {
      console.error(`${logPrefix}: server error`, res.status, body.detail);
    }
    return GENERIC_5XX_MESSAGE;
  }

  return readDetail(body) ?? `Request failed (${res.status})`;
}

/**
 * For callers that already have an Error thrown by `apiClient` (whose
 * message follows `"Request failed: <status> - <body>"`). Falls through to
 * the provided fallback if nothing useful can be extracted.
 */
export function parseBackendErrorMessage(
  err: unknown,
  fallback: string,
): string {
  if (!(err instanceof Error)) return fallback;
  const match = err.message.match(/Request failed:\s*(\d+)\s*-\s*(.+)$/);
  if (!match) return err.message || fallback;
  const status = Number(match[1]);
  const rawBody = match[2];
  if (status >= 500) {
    console.error("Server error from apiClient:", status, rawBody);
    return GENERIC_5XX_MESSAGE;
  }
  let parsed: DetailObject;
  try {
    parsed = JSON.parse(rawBody) as DetailObject;
  } catch {
    return rawBody;
  }
  return readDetail(parsed) ?? rawBody;
}

function readDetail(body: DetailObject): string | undefined {
  const detail = body?.detail;
  if (typeof detail === "string" && detail.trim().length > 0) {
    return detail;
  }
  // FastAPI 422 validation shape: detail is an array of { loc, msg, type }.
  if (Array.isArray(detail)) {
    const messages = detail
      .map((entry) => {
        if (entry && typeof entry === "object" && "msg" in entry) {
          const msg = (entry as { msg?: unknown }).msg;
          return typeof msg === "string" ? msg : "";
        }
        return "";
      })
      .filter((s) => s.length > 0);
    if (messages.length > 0) {
      // Validation errors are usually 1-2 entries; join with " — " for
      // readability when there are more.
      return messages.join(" — ");
    }
  }
  if (typeof body?.message === "string" && body.message.length > 0) {
    return body.message;
  }
  return undefined;
}
