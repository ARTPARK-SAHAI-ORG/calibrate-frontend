/**
 * A turn's text can come with a display name and other forms of itself.
 *
 * On a chat turn (`chat_history`, `transcript`) the keys sit beside `role`
 * and `content`. The reply fields `agent_response`, `input` and `output`
 * are either a plain string or `{ content, label?, versions? }`. `content`
 * is always the default text: it is what the judge reads and what every
 * screen shows first. `versions` maps a display name to another form of the
 * same text, such as a translation or a human rewrite.
 */
export type TurnExtras = {
  label?: string;
  versions?: Record<string, string>;
};

export type TextField = TurnExtras & { content: string };

/** Reads `label` and `versions` off a raw turn or text object, dropping
 * anything that is not the expected shape. */
export function readTurnExtras(raw: unknown): TurnExtras {
  if (!raw || typeof raw !== "object") return {};
  const obj = raw as Record<string, unknown>;
  const out: TurnExtras = {};
  if (typeof obj.label === "string" && obj.label.trim()) out.label = obj.label;
  if (obj.versions && typeof obj.versions === "object" && !Array.isArray(obj.versions)) {
    const versions: Record<string, string> = {};
    for (const [k, v] of Object.entries(obj.versions as Record<string, unknown>)) {
      if (typeof v === "string" && k.trim()) versions[k] = v;
    }
    if (Object.keys(versions).length > 0) out.versions = versions;
  }
  return out;
}

/** Reads a reply field that is a string or `{ content, label?, versions? }`.
 * Returns null when there is no text to show. */
export function readTextField(raw: unknown): TextField | null {
  if (typeof raw === "string") return { content: raw };
  if (!raw || typeof raw !== "object") return null;
  const content = (raw as Record<string, unknown>).content;
  if (typeof content !== "string") return null;
  return { content, ...readTurnExtras(raw) };
}

/** The default text of a reply field, or "" when there is none. */
export function textOf(raw: unknown): string {
  return readTextField(raw)?.content ?? "";
}

/** Writes a reply field back: a plain string when it carries no label and no
 * versions, so an item saved before versions existed keeps its old shape. */
export function writeTextField(
  content: string,
  extras: TurnExtras = {},
): string | TextField {
  const label = extras.label?.trim();
  const versions = extras.versions;
  const hasVersions = !!versions && Object.keys(versions).length > 0;
  if (!label && !hasVersions) return content;
  return {
    content,
    ...(label ? { label } : {}),
    ...(hasVersions ? { versions } : {}),
  };
}

/** True when any turn or reply field of a labelling item carries versions. */
export function payloadHasVersions(payload: unknown): boolean {
  if (!payload || typeof payload !== "object") return false;
  const p = payload as Record<string, unknown>;
  const turns = [
    ...(Array.isArray(p.chat_history) ? p.chat_history : []),
    ...(Array.isArray(p.transcript) ? p.transcript : []),
    p.agent_response,
    p.input,
    p.output,
  ];
  return turns.some((t) => readTurnExtras(t).versions !== undefined);
}
