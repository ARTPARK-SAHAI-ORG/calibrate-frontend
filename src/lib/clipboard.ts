/**
 * Copy `text` to the clipboard, falling back to a hidden textarea +
 * `execCommand("copy")` for environments without the async Clipboard API
 * (older browsers, insecure contexts).
 *
 * Answers whether the text actually reached the clipboard. It used to answer
 * nothing at all, so a caller could only say "Copied" and hope: where the
 * clipboard was blocked, the reader was told the link was theirs, pasted it
 * into a chat, and sent nothing.
 */
export async function copyToClipboard(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    const el = document.createElement("textarea");
    el.value = text;
    document.body.appendChild(el);
    el.select();
    let copied = false;
    try {
      copied = document.execCommand("copy");
    } catch {
      copied = false;
    }
    document.body.removeChild(el);
    return copied;
  }
}
