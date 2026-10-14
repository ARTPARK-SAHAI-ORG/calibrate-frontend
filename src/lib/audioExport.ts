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
