/**
 * Copy `text` to the clipboard, falling back to a hidden textarea +
 * `execCommand("copy")` for environments without the async Clipboard API
 * (older browsers, insecure contexts). Resolves once the copy is attempted.
 */
export async function copyToClipboard(text: string): Promise<void> {
  try {
    await navigator.clipboard.writeText(text);
  } catch {
    const el = document.createElement("textarea");
    el.value = text;
    document.body.appendChild(el);
    el.select();
    document.execCommand("copy");
    document.body.removeChild(el);
  }
}
