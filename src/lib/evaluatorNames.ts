import type { EvaluatorType } from "@/components/EvaluatorPills";

// Evaluator names that collide with reserved bulk-upload CSV columns.
//
// In `BulkUploadTestsModal`, each attached evaluator gets a per-row "include"
// column whose header is the evaluator's bare name (e.g. `Correctness`),
// alongside the fixed `name` and `conversation_history` columns every row has.
// An evaluator named exactly `name` or `conversation_history` would therefore
// clash with those built-in columns and break the upload, so we forbid those
// names at evaluator create / edit / duplicate time. Keep this list in sync
// with the base CSV columns in `BulkUploadTestsModal`.
export const RESERVED_EVALUATOR_NAMES = ["name", "conversation_history"];

// True when `name` (case-insensitive, trimmed) matches a reserved column name.
export function isReservedEvaluatorName(name: string): boolean {
  const trimmed = name.trim().toLowerCase();
  return RESERVED_EVALUATOR_NAMES.includes(trimmed);
}

// User-facing error message shown when a reserved name is entered.
export function reservedEvaluatorNameError(name: string): string {
  return `"${name.trim()}" is a reserved keyword and can't be used as an evaluator name`;
}

// What each kind of evaluator judges, as it reads inside a suggested name.
const KIND_WORDS: Record<EvaluatorType, string> = {
  llm: "conversation reply",
  conversation: "whole conversation",
  "llm-general": "basic output",
  "tool-call": "tool call",
  stt: "speech to text",
  tts: "text to speech",
};

// The name a new evaluator opens with, so it can be created without typing
// one. A name already in the workspace gets " 2", " 3" and so on.
export function defaultEvaluatorName(
  type: EvaluatorType,
  existingNames: string[],
): string {
  const base = `New ${KIND_WORDS[type]} evaluator`;
  const taken = new Set(existingNames.map((n) => n.trim().toLowerCase()));
  let name = base;
  for (let n = 2; taken.has(name.toLowerCase()); n++) name = `${base} ${n}`;
  return name;
}
