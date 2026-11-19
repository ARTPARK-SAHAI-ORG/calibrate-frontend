/**
 * A support ticket stored as a labelling item.
 *
 * The backend keeps the whole ticket in a `conversation` item, so nothing about
 * it needed a new field: the messages and the staff notes ride in
 * `payload.transcript` as chat turns (turns keep any extra keys they are sent),
 * and the case details and timeline ride in `metadata` as readable pairs.
 *
 * A turn is a ticket turn when it carries `kind: "message" | "note"`. Anything
 * else is an ordinary conversation and is left to the usual pane.
 */

export type TicketMessage = {
  kind: "message";
  ts: number;
  atIst: string;
  who: "user" | "mse" | "automated";
  label: string;
  /** What was written, in the language it was written in. */
  text: string;
  /** The English translation, when there is one and it differs. */
  english: string | null;
  placeholder: boolean;
  tags: string[];
  emergencyTag: boolean;
  /** An image, audio clip, video or document sent with the message, when there is one. */
  media: TicketMedia | null;
};

/** What kind of file a message carried. The link is kept with the item for later but never drawn. */
export type TicketMedia = {
  kind: "audio" | "image" | "video" | "document" | "other";
  mime: string;
};

export type TicketNote = {
  kind: "note";
  ts: number;
  atIst: string;
  label: string;
  text: string;
};

export type TicketEscalation = {
  kind: "escalation";
  ts: number;
  atIst: string;
  toMedicalOfficer: boolean;
};

export type TicketEvent = TicketMessage | TicketNote | TicketEscalation;

export type TicketFact = { label: string; value: string };

export type TicketStep = {
  key: string;
  label: string;
  at: string;
  /** A short line under the time, such as how many questions were asked. */
  note?: string;
};

export type Ticket = {
  language: string;
  facts: TicketFact[];
  steps: TicketStep[];
  /** Events before the ticket opened, while it was open, and after it closed. */
  earlier: TicketEvent[];
  during: TicketEvent[];
  later: TicketEvent[];
  openedAt: string;
  closedAt: string;
};

/** The label the backend stores a translation under. */
export const ENGLISH_VERSION = "English translation";

/** The case details shown in the strip, in order, by the key they are stored under. */
const FACT_KEYS = [
  "Condition area",
  "Language",
  "Expected due date",
  "Time until due",
  "Trimester",
  "Baby age",
] as const;

type Meta = { key: string; value: string }[] | null | undefined;

function asRecord(v: unknown): Record<string, unknown> | null {
  return v && typeof v === "object" && !Array.isArray(v)
    ? (v as Record<string, unknown>)
    : null;
}

function str(v: unknown): string {
  return typeof v === "string" ? v : "";
}

/** Ticket times are written in Indian time with no zone: "2026-11-16 19:01:00". */
export function istToMs(at: string): number {
  const ms = Date.parse(`${at.trim().replace(" ", "T")}+05:30`);
  return Number.isNaN(ms) ? NaN : ms;
}

const MONTHS = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
];
const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

/** "19:01" from "2026-11-16 19:01:00". */
export function hourMinute(at: string): string {
  return at.slice(11, 16);
}

/** "16 Nov, 19:01" from "2026-11-16 19:01:00". */
export function dayAndTime(at: string): string {
  const month = MONTHS[Number(at.slice(5, 7)) - 1] ?? "";
  return `${Number(at.slice(8, 10))} ${month}, ${hourMinute(at)}`;
}

/** "Mon, 16 Nov 2026" from "2026-11-16 19:01:00". */
export function dayHeading(at: string): string {
  const y = Number(at.slice(0, 4));
  const m = Number(at.slice(5, 7));
  const d = Number(at.slice(8, 10));
  const weekday = WEEKDAYS[new Date(Date.UTC(y, m - 1, d)).getUTCDay()] ?? "";
  return `${weekday}, ${d} ${MONTHS[m - 1] ?? ""} ${y}`;
}

function metaValue(meta: Meta, key: string): string {
  return meta?.find((e) => e.key === key)?.value?.trim() ?? "";
}

function readTurn(turn: unknown): TicketEvent | null {
  const t = asRecord(turn);
  if (!t) return null;
  const kind = t.kind;
  const ts = typeof t.ts === "number" ? t.ts : istToMs(str(t.at_ist));
  const atIst = str(t.at_ist);
  const text = str(t.content).trim();
  if (kind === "note") {
    return text
      ? { kind: "note", ts, atIst, label: str(t.label) || "Note", text }
      : null;
  }
  if (kind !== "message") return null;
  const versions = asRecord(t.versions);
  const english = str(versions?.[ENGLISH_VERSION]).trim();
  const label = str(t.label);
  const who =
    t.role === "user"
      ? "user"
      : label.toLowerCase() === "mse"
        ? "mse"
        : "automated";
  return {
    kind: "message",
    ts,
    atIst,
    who,
    // The person writing in is always "User", whatever the data calls them.
    label: who === "user" ? "User" : label || "Automated",
    text,
    english: english && english !== text ? english : null,
    placeholder: t.placeholder === true,
    tags: Array.isArray(t.tags)
      ? t.tags.filter((x): x is string => typeof x === "string")
      : [],
    emergencyTag: t.emergency_tag === true,
    media: readMedia(t.media),
  };
}

/** Ends with a question mark, ignoring trailing spaces, emoji and WhatsApp's *bold* or _italic_ marks. */
export function endsWithQuestion(text: string): boolean {
  return /[?？][\s\p{Extended_Pictographic}️‍*_~"'”’)\]]*$/u.test(
    text.trim(),
  );
}

const MEDIA_KINDS =["audio", "image", "video", "document"] as const;

function readMedia(v: unknown): TicketMedia | null {
  const m = asRecord(v);
  if (!m) return null;
  const type = str(m.type).toLowerCase();
  const kind = (MEDIA_KINDS as readonly string[]).includes(type)
    ? (type as TicketMedia["kind"])
    : "other";
  return { kind, mime: str(m.mime) };
}

/** Whether this item holds a ticket, so the usual conversation pane is not used. */
export function isTicketPayload(payload: unknown): boolean {
  const transcript = asRecord(payload)?.transcript;
  return (
    Array.isArray(transcript) &&
    transcript.some((t) => {
      const kind = asRecord(t)?.kind;
      return kind === "message" || kind === "note";
    })
  );
}

/** Reads a ticket out of an item, or null when the item is not one. */
export function parseTicket(payload: unknown, metadata: Meta): Ticket | null {
  if (!isTicketPayload(payload)) return null;
  const transcript = asRecord(payload)?.transcript as unknown[];
  const events: TicketEvent[] = [];
  for (const turn of transcript) {
    const e = readTurn(turn);
    if (e) events.push(e);
  }

  const openedAt = metaValue(metadata, "Opened");
  const closedAt = metaValue(metadata, "Closed");
  const escalatedAt = metaValue(metadata, "Escalated");
  if (escalatedAt) {
    events.push({
      kind: "escalation",
      ts: istToMs(escalatedAt),
      atIst: escalatedAt,
      toMedicalOfficer: metaValue(metadata, "Escalated to") === "Medical Officer",
    });
  }
  // Stable, so a note and the escalation it follows keep the order they were sent in.
  events.sort((a, b) => a.ts - b.ts || 0);

  // An event with no readable time is never "before" or "after", so it stays
  // in the ticket rather than disappearing.
  // The opening and closing times are written to the second but a message's
  // time is to the millisecond, so a reply sent the instant the ticket closed
  // would read as "after". Compare whole seconds.
  const sec = (ms: number) => Math.floor(ms / 1000);
  const lo = openedAt ? sec(istToMs(openedAt)) : -Infinity;
  const hi = closedAt ? sec(istToMs(closedAt)) : Infinity;
  const earlier = events.filter((e) => sec(e.ts) < lo);
  const later = events.filter((e) => sec(e.ts) > hi);
  const during = events.filter((e) => !(sec(e.ts) < lo) && !(sec(e.ts) > hi));

  // The first reply is the first MSE message while the ticket was open. The
  // chat's older history is full of automated broadcasts, which are not replies.
  const firstReply = during.find(
    (e): e is TicketMessage => e.kind === "message" && e.who === "mse",
  );
  // A probe is an MSE message, while the ticket was open, that ends with a
  // question mark: the nurse asking the user for more. The user's own questions
  // and automated messages do not count.
  const probes = during.filter(
    (e): e is TicketMessage =>
      e.kind === "message" &&
      e.who === "mse" &&
      !e.placeholder &&
      (endsWithQuestion(e.text) ||
        (e.english !== null && endsWithQuestion(e.english))),
  );

  // In the order they happened, so a probe sits before or after the first
  // reply or the escalation as it really did.
  const timed: { ts: number; step: TicketStep }[] = [];
  const add = (step: TicketStep) => timed.push({ ts: istToMs(step.at), step });
  if (openedAt) add({ key: "opened", label: "Opened", at: openedAt });
  if (escalatedAt) add({ key: "escalated", label: "Escalated", at: escalatedAt });
  if (firstReply)
    add({ key: "first-reply", label: "First reply", at: firstReply.atIst });
  if (probes.length > 0)
    add({
      key: "probed",
      label: "Probed",
      at: probes[0].atIst,
      note: probes.length > 1 ? `${probes.length} questions` : undefined,
    });
  if (closedAt) add({ key: "closed", label: "Closed", at: closedAt });
  // Stable, so steps at the same second keep the order they were added in.
  timed.sort((a, b) => a.ts - b.ts || 0);
  const steps = timed.map((t) => t.step);

  const facts: TicketFact[] = [];
  for (const label of FACT_KEYS) {
    const value = metaValue(metadata, label);
    if (value) facts.push({ label, value });
  }

  return {
    language: metaValue(metadata, "Language"),
    facts,
    steps,
    earlier,
    during,
    later,
    openedAt,
    closedAt,
  };
}
