import { LIMITS } from "@/constants/limits";

// Counted by code point, the way the backend counts, so an emoji is one
// character here and there.
export function knowledgeBaseLength(text: string): number {
  return Array.from(text).length;
}

export function knowledgeBaseOverBy(text: string): number {
  return Math.max(0, knowledgeBaseLength(text) - LIMITS.KNOWLEDGE_BASE_MAX_CHARS);
}
