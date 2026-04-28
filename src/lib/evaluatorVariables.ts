// Extracts unique `{{var_name}}` placeholders from evaluator prompts,
// preserving the order in which they first appear. Only valid identifier names
// are recognized, so `{{ }}`, `{{ my var }}`, etc. are ignored.
export function extractVariableNames(prompt: string): string[] {
  const regex = /\{\{\s*([a-zA-Z_][a-zA-Z0-9_]*)\s*\}\}/g;
  const seen = new Set<string>();
  const result: string[] = [];
  let match: RegExpExecArray | null;
  while ((match = regex.exec(prompt)) !== null) {
    const name = match[1];
    if (!seen.has(name)) {
      seen.add(name);
      result.push(name);
    }
  }
  return result;
}
