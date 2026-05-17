// Bulk-upload CSVs frequently come out of Word / Google Sheets / Notes,
// which silently rewrite straight ASCII quotes to "smart" curly quotes
// (U+201C, U+201D, U+2018, U+2019). JSON.parse rejects those, so before
// we surface a parsing error to the user we try replacing common Unicode
// quote look-alikes with their ASCII equivalents and re-parse. Only if
// the sanitised string still doesn't parse do we let the error bubble up.

const QUOTE_REPLACEMENTS: Array<[RegExp, string]> = [
  [/[“”„‟″‶]/g, '"'],
  [/[‘’‚‛′‵]/g, "'"],
];

export function sanitizeJsonString(raw: string): string {
  let out = raw;
  for (const [re, replacement] of QUOTE_REPLACEMENTS) {
    out = out.replace(re, replacement);
  }
  return out;
}

/** Parse JSON, retrying once with smart-quote → ASCII-quote sanitisation
 * before propagating the parse error. */
export function parseJsonLenient(raw: string): unknown {
  try {
    return JSON.parse(raw);
  } catch (firstError) {
    const sanitized = sanitizeJsonString(raw);
    if (sanitized === raw) throw firstError;
    return JSON.parse(sanitized);
  }
}
