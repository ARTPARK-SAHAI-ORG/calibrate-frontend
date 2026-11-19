"use client";

import { useState } from "react";
import {
  dayAndTime,
  dayHeading,
  hourMinute,
  parseTicket,
  type Ticket,
  type TicketEvent,
  type TicketMessage,
} from "@/lib/ticketView";

const PILL_AMBER =
  "border-amber-300 bg-amber-100 text-amber-900 dark:border-amber-500/40 dark:bg-amber-500/20 dark:text-amber-300";
const PILL_BLUE =
  "border-sky-300 bg-sky-100 text-sky-900 dark:border-sky-500/40 dark:bg-sky-500/20 dark:text-sky-300";
const PILL_GREEN =
  "border-emerald-300 bg-emerald-100 text-emerald-900 dark:border-emerald-500/40 dark:bg-emerald-500/20 dark:text-emerald-300";

const MEDIA_LABEL = {
  audio: "Audio message",
  image: "Image",
  video: "Video",
  document: "Document",
  other: "Attachment",
} as const;

/** A support ticket: who it is about, how it went, and the messages and staff notes in order. */
export function TicketItemPane({
  payload,
  metadata,
}: {
  payload: unknown;
  metadata?: { key: string; value: string }[] | null;
}) {
  const ticket = parseTicket(payload, metadata);
  const [showEnglish, setShowEnglish] = useState(true);
  if (!ticket) return null;

  const hasTranslation = [
    ...ticket.earlier,
    ...ticket.during,
    ...ticket.later,
  ].some((e) => e.kind === "message" && e.english !== null);

  return (
    <div className="space-y-4 pt-4 md:pt-6" data-testid="ticket-pane">
      <TicketFacts ticket={ticket} />
      <TicketSteps ticket={ticket} />
      {hasTranslation && (
        <div className="flex justify-end">
          <button
            type="button"
            role="switch"
            aria-checked={showEnglish}
            onClick={() => setShowEnglish((v) => !v)}
            className="inline-flex items-center gap-2 rounded-full border border-border bg-background px-3 py-1.5 text-sm text-foreground hover:bg-muted/50 transition-colors cursor-pointer outline-none focus-visible:ring-2 focus-visible:ring-foreground/30"
          >
            English translation
            <span className="font-medium text-muted-foreground">
              {showEnglish ? "On" : "Off"}
            </span>
          </button>
        </div>
      )}
      <div className="space-y-3">
        <FoldedEvents
          events={ticket.earlier}
          word="earlier"
          showEnglish={showEnglish}
        />
        <Pill className={PILL_BLUE}>
          Ticket opened
          {ticket.openedAt ? ` · ${dayAndTime(ticket.openedAt)} IST` : ""}
        </Pill>
        <Events events={ticket.during} showEnglish={showEnglish} />
        <Pill className={PILL_GREEN}>
          Ticket closed
          {ticket.closedAt ? ` · ${dayAndTime(ticket.closedAt)} IST` : ""}
        </Pill>
        <FoldedEvents
          events={ticket.later}
          word="later"
          showEnglish={showEnglish}
        />
      </div>
    </div>
  );
}

function TicketFacts({ ticket }: { ticket: Ticket }) {
  if (ticket.facts.length === 0) return null;
  return (
    <section
      aria-label="Case details"
      data-tutorial="item-details"
      className="rounded-xl border border-border bg-muted/20 px-4 py-3"
    >
      <h3 className="text-sm font-semibold text-foreground">Case details</h3>
      <dl className="mt-2 flex flex-wrap gap-x-6 gap-y-2">
        {ticket.facts.map((f) => (
          <div key={f.label}>
            <dt className="text-xs text-muted-foreground">
              {f.label === "Condition area" ? "Area" : f.label}
            </dt>
            <dd className="text-sm font-medium text-foreground">
              {f.label === "Condition area"
                ? f.value.replace(/_/g, " ")
                : f.value}
            </dd>
          </div>
        ))}
      </dl>
    </section>
  );
}

function TicketSteps({ ticket }: { ticket: Ticket }) {
  if (ticket.steps.length === 0) return null;
  return (
    <section
      aria-label="Ticket timeline"
      className="rounded-xl border border-border bg-muted/20 px-4 py-3"
    >
      <h3 className="text-sm font-semibold text-foreground">Ticket timeline</h3>
      <ol className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-3">
        {ticket.steps.map((s, i) => (
          <li key={s.key} className="flex items-center gap-2">
            <span>
              <span className="block text-xs text-muted-foreground">
                {s.label}
              </span>
              <span className="block text-sm font-medium text-foreground">
                {dayAndTime(s.at)}
              </span>
            </span>
            {/* The arrow belongs to the step before it, so a wrapped line never starts with one. */}
            {i < ticket.steps.length - 1 && (
              <span aria-hidden className="text-muted-foreground">
                ›
              </span>
            )}
          </li>
        ))}
      </ol>
    </section>
  );
}

function Pill({
  className,
  children,
}: {
  className: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex justify-center">
      <span
        className={`inline-flex items-center rounded-full border px-3 py-1 text-xs font-medium ${className}`}
      >
        {children}
      </span>
    </div>
  );
}

/** Messages from before the ticket opened or after it closed, kept out of the way until asked for. */
function FoldedEvents({
  events,
  word,
  showEnglish,
}: {
  events: TicketEvent[];
  word: "earlier" | "later";
  showEnglish: boolean;
}) {
  const [open, setOpen] = useState(false);
  if (events.length === 0) return null;
  const n = events.length;
  return (
    <div className="space-y-3">
      <button
        type="button"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
        className="w-full rounded-xl border border-dashed border-border px-3 py-2 text-sm text-muted-foreground hover:bg-muted/50 transition-colors cursor-pointer outline-none focus-visible:ring-2 focus-visible:ring-foreground/30"
      >
        {open ? "Hide" : "Show"} {n} {word} message{n === 1 ? "" : "s"}
      </button>
      {open && <Events events={events} showEnglish={showEnglish} />}
    </div>
  );
}

function Events({
  events,
  showEnglish,
}: {
  events: TicketEvent[];
  showEnglish: boolean;
}) {
  // A date heading goes above the first event of each day.
  const startsDay = events.map((e, i) => {
    const d = e.atIst.slice(0, 10);
    return d !== "" && (i === 0 || d !== events[i - 1].atIst.slice(0, 10));
  });
  return (
    <div className="space-y-3">
      {events.map((e, i) => {
        const heading = startsDay[i] ? (
          <p className="text-center text-xs text-muted-foreground">
            {dayHeading(e.atIst)}
          </p>
        ) : null;
        return (
          <div key={`${e.kind}-${e.ts}-${i}`} className="space-y-3">
            {heading}
            {e.kind === "escalation" ? (
              <Pill className={PILL_AMBER}>
                {e.toMedicalOfficer
                  ? "Escalated to a Medical Officer (internal)"
                  : "Escalated (internal)"}
                {` · ${hourMinute(e.atIst)}`}
              </Pill>
            ) : e.kind === "note" ? (
              <div
                className={`rounded-xl border px-4 py-3 ${PILL_AMBER} bg-amber-50 dark:bg-amber-500/10`}
              >
                <p className="text-sm font-semibold">
                  {e.label} · {hourMinute(e.atIst)}
                </p>
                <p className="mt-1 text-sm whitespace-pre-wrap break-words">
                  {e.text}
                </p>
              </div>
            ) : (
              <Message m={e} showEnglish={showEnglish} />
            )}
          </div>
        );
      })}
    </div>
  );
}

function Message({
  m,
  showEnglish,
}: {
  m: TicketMessage;
  showEnglish: boolean;
}) {
  // With the translation on it reads first and the original sits underneath;
  // with it off only the original shows. A placeholder has no translation.
  const translated = showEnglish && !m.placeholder && m.english !== null;
  const main = translated ? m.english : m.text;
  const original = translated ? m.text : null;
  // Staff replies sit to the right and the caregiver to the left, but only
  // where there is room: on a phone every bubble takes nearly the full width.
  const align = m.who === "mse" ? "md:ml-auto" : "md:mr-auto";
  const surface =
    m.who === "caregiver"
      ? "bg-background"
      : m.who === "mse"
        ? "bg-muted/40"
        : "bg-muted/20";
  return (
    <div className={`max-w-full md:max-w-[88%] ${align}`}>
      <div className={`rounded-xl border border-border px-4 py-3 ${surface}`}>
        <p className="text-xs text-muted-foreground">
          <span className="font-medium text-foreground">{m.label}</span>
          {m.atIst ? ` · ${hourMinute(m.atIst)}` : ""}
        </p>
        {/* A file with no words of its own is drawn as the note below, not as "[Audio message]". */}
        {!(m.media && m.placeholder) && (
          <p
            className={`mt-1 text-sm whitespace-pre-wrap break-words ${
              m.placeholder ? "italic text-muted-foreground" : "text-foreground"
            }`}
          >
            {main}
          </p>
        )}
        {m.media && (
          <p
            data-testid="ticket-media"
            className="mt-1 inline-block rounded-md bg-muted px-2 py-1 text-xs text-muted-foreground"
          >
            {MEDIA_LABEL[m.media.kind]} · cannot be played here
          </p>
        )}
        {original && (
          <p className="mt-2 border-t border-border pt-2 text-sm whitespace-pre-wrap break-words text-muted-foreground">
            {original}
          </p>
        )}
      </div>
      {(m.tags.length > 0 || m.emergencyTag) && (
        <div className="mt-1 flex flex-wrap gap-1.5">
          {m.tags.map((t) => (
            <span
              key={t}
              className="rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground"
            >
              {t}
            </span>
          ))}
          {m.emergencyTag && (
            <span
              className={`rounded-full border px-2 py-0.5 text-xs ${PILL_AMBER}`}
            >
              Marked as emergency
            </span>
          )}
        </div>
      )}
    </div>
  );
}
