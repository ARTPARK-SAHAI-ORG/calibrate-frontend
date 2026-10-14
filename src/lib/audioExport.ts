/**
 * File extension of an audio link, for naming the clip inside an export zip.
 * Ignores the query string a signed storage link carries, and falls back to
 * `wav` (the backend's default) when the link has no extension.
 */
export function audioFileExtension(url: string): string {
  const path = url.split(/[?#]/)[0];
  const m = path.match(/\.([a-z0-9]+)$/i);
  return m ? m[1].toLowerCase() : "wav";
}

/**
 * Reads a run again from the backend, for exports. The clip links in a run
 * stop working an hour after the backend hands them out, so an export built
 * from the copy the page loaded earlier can no longer download the clips.
 */
export async function fetchRunForExport<T>(
  path: string,
  accessToken?: string | null,
): Promise<T> {
  const res = await fetch(`${process.env.NEXT_PUBLIC_BACKEND_URL}${path}`, {
    headers: {
      accept: "application/json",
      ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
    },
  });
  if (!res.ok) throw new Error(`HTTP ${res.status} for ${path}`);
  return res.json();
}
