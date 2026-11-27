// Counted by code point, the way the backend counts, so an emoji is one
// character here and there.
export function knowledgeBaseLength(text: string): number {
  return Array.from(text).length;
}

/** How far over the limit the text is. The limit comes from the backend
 *  (`max_knowledge_base_chars` on `GET /org-limits/me`); null means it is not
 *  known yet, so nothing is counted as over and the backend has the last word. */
export function knowledgeBaseOverBy(
  text: string,
  maxChars: number | null,
): number {
  if (maxChars === null) return 0;
  return Math.max(0, knowledgeBaseLength(text) - maxChars);
}

/** "1 character" or "1,249 characters". */
export function characterCount(count: number): string {
  return `${count.toLocaleString("en-US")} ${count === 1 ? "character" : "characters"}`;
}

function charactersOver(over: number): string {
  return `The knowledge base is ${characterCount(over)} over the limit.`;
}

/** Said when Save is refused for a knowledge base over the limit. */
export function knowledgeBaseTooLongToSave(over: number): string {
  return `${charactersOver(over)} Shorten it to save.`;
}

/** Said in the Duplicate window, which saves the agent before copying it. */
export function knowledgeBaseTooLongToDuplicate(over: number): string {
  return `${charactersOver(over)} Shorten it on the Knowledge base tab, then duplicate.`;
}
