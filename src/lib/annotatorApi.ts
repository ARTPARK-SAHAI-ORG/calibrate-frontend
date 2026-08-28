import { apiClient } from "@/lib/api";

export type NewAnnotator = { uuid: string; name: string };

// Same shape as the copies in the labelling dialogs — the backend wraps its
// own message inside the thrown request error.
function parseApiError(err: unknown, fallback: string): string {
  if (!(err instanceof Error)) return fallback;
  const match = err.message.match(/Request failed: \d+ - (.+)$/);
  if (match) {
    try {
      const parsed = JSON.parse(match[1]);
      if (parsed && typeof parsed.detail === "string") return parsed.detail;
    } catch {
      // not JSON
    }
    return match[1];
  }
  return err.message || fallback;
}

/** Creates an annotator, raising the backend's own message when it fails. */
export async function createAnnotator(
  accessToken: string,
  name: string,
): Promise<NewAnnotator> {
  try {
    const { uuid } = await apiClient<{ uuid: string; message: string }>(
      "/annotators",
      accessToken,
      { method: "POST", body: { name } },
    );
    return { uuid, name };
  } catch (err) {
    throw new Error(parseApiError(err, "Failed to add annotator"));
  }
}

/** Renames an annotator, raising the backend's own message when it fails. */
export async function renameAnnotator(
  accessToken: string,
  uuid: string,
  name: string,
): Promise<void> {
  try {
    await apiClient<{ message: string }>(`/annotators/${uuid}`, accessToken, {
      method: "PUT",
      body: { name },
    });
  } catch (err) {
    throw new Error(parseApiError(err, "Failed to rename annotator"));
  }
}
