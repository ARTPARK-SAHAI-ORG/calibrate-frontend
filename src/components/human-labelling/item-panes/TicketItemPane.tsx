"use client";

import { useRef, useState } from "react";
import { NOORA_CARD } from "../noora";
import type { TicketDensity } from "@/hooks/useTicketDensity";
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
  "border-amber-300 bg-amber-100 text-amber-900 dark:border-amber-500/40 dark:bg-amber-500/20 dark:text-amber-300 noora:border-transparent noora:bg-warning-container noora:text-on-warning-container";
const PILL_BLUE =
  "border-sky-300 bg-sky-100 text-sky-900 dark:border-sky-500/40 dark:bg-sky-500/20 dark:text-sky-300 noora:border-transparent noora:bg-primary-container noora:text-secondary";
const PILL_GREEN =
  "border-emerald-300 bg-emerald-100 text-emerald-900 dark:border-emerald-500/40 dark:bg-emerald-500/20 dark:text-emerald-300 noora:border-transparent noora:bg-tertiary-container noora:text-on-tertiary-container";

const MEDIA_LABEL = {
  audio: "Audio message",
  image: "Image",
  video: "Video",
  document: "Document",
  other: "Attachment",
} as const;

/** The room each part of a ticket takes. Comfortable is the everyday look;
 *  compact fits more of the ticket on the screen. The one place both are written. */
const SPACING = {
  comfortable: {
    root: "space-y-4 pt-4 md:pt-6",
    stack: "space-y-3",
    box: "px-4 py-3",
    bubble: "px-4 py-3",
    fold: "px-3 py-2",
    pill: "px-3 py-1",
    body: "text-sm",
  },
  compact: {
    root: "space-y-2 pt-2 md:pt-3",
    stack: "space-y-1.5",
    box: "px-3 py-2",
    bubble: "px-3 py-1.5",
    fold: "px-3 py-1",
    pill: "px-2.5 py-0.5",
    body: "text-[13px] leading-5",
  },
} as const;
type Spacing = (typeof SPACING)[TicketDensity];

/** A support ticket: who it is about, how it went, and the messages and staff notes in order. */
export function TicketItemPane({
  payload,
  metadata,
  density = "comfortable",
}: {
  payload: unknown;
  metadata?: { key: string; value: string }[] | null;
  density?: TicketDensity;
}) {
  const ticket = parseTicket(payload, metadata);
  const [showEnglish, setShowEnglish] = useState(true);
  if (!ticket) return null;
  const s = SPACING[density];

  const hasTranslation = [
    ...ticket.earlier,
    ...ticket.during,
    ...ticket.later,
  ].some((e) => e.kind === "message" && e.english !== null);

  return (
    <div
      className={s.root}
      data-testid="ticket-pane"
      data-density={density}
    >
      <TicketFacts ticket={ticket} s={s} />
      <TicketSteps ticket={ticket} s={s} />
      {hasTranslation && (
        <div className="flex justify-end">
          <button
            type="button"
            role="switch"
            aria-checked={showEnglish}
            onClick={() => setShowEnglish((v) => !v)}
            className={`inline-flex items-center gap-2 rounded-full noora:rounded-lg border border-border bg-background px-3 py-1.5 text-sm text-foreground hover:bg-muted/50 transition-colors cursor-pointer outline-none focus-visible:ring-2 focus-visible:ring-foreground/30 noora:border-outline-variant noora:focus-visible:ring-secondary ${
              showEnglish
                ? "noora:border-transparent noora:bg-primary-container noora:text-on-primary-container"
                : "noora:bg-surface-lowest"
            }`}
          >
            English translation
            <span className="font-medium text-muted-foreground noora:text-current">
              {showEnglish ? "On" : "Off"}
            </span>
          </button>
        </div>
      )}
      <div className={s.stack}>
        <FoldedEvents
          events={ticket.earlier}
          word="earlier"
          showEnglish={showEnglish}
          s={s}
        />
        <Pill className={PILL_BLUE} s={s}>
          Ticket opened
          {ticket.openedAt ? ` · ${dayAndTime(ticket.openedAt)} IST` : ""}
        </Pill>
        <Events events={ticket.during} showEnglish={showEnglish} s={s} />
        <Pill className={PILL_GREEN} s={s}>
          Ticket closed
          {ticket.closedAt ? ` · ${dayAndTime(ticket.closedAt)} IST` : ""}
        </Pill>
        <FoldedEvents
          events={ticket.later}
          word="later"
          showEnglish={showEnglish}
          s={s}
        />
      </div>
    </div>
  );
}

function TicketFacts({ ticket, s }: { ticket: Ticket; s: Spacing }) {
  if (ticket.facts.length === 0) return null;
  return (
    <section
      aria-label="Case details"
      data-tutorial="item-details"
      className={`rounded-xl border border-border bg-muted/20 ${s.box} ${NOORA_CARD} noora:bg-surface-low`}
    >
      <h3 className={`text-sm font-semibold text-foreground noora:text-[15px]`}>
        Case details
      </h3>
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

function TicketSteps({ ticket, s }: { ticket: Ticket; s: Spacing }) {
  if (ticket.steps.length === 0) return null;
  return (
    <section
      aria-label="Ticket timeline"
      className={`rounded-xl border border-border bg-muted/20 ${s.box} ${NOORA_CARD} noora:bg-surface-low`}
    >
      <h3 className={`text-sm font-semibold text-foreground noora:text-[15px]`}>
        Ticket timeline
      </h3>
      <ol className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-3">
        {ticket.steps.map((step, i) => (
          <li key={step.key} className="flex items-center gap-2">
            <span>
              <span className="block text-xs text-muted-foreground">
                {step.label}
              </span>
              <span className="block text-sm font-medium text-foreground">
                {dayAndTime(step.at)}
              </span>
              {step.note && (
                <span className="block text-xs text-muted-foreground">
                  {step.note}
                </span>
              )}
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
  s,
  children,
}: {
  className: string;
  s: Spacing;
  children: React.ReactNode;
}) {
  return (
    <div className="flex justify-center">
      <span
        className={`inline-flex items-center rounded-full border text-xs font-medium ${s.pill} ${className}`}
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
  s,
}: {
  events: TicketEvent[];
  word: "earlier" | "later";
  showEnglish: boolean;
  s: Spacing;
}) {
  const [open, setOpen] = useState(false);
  const topButton = useRef<HTMLButtonElement>(null);
  if (events.length === 0) return null;
  const n = events.length;
  const label = `${open ? "Hide" : "Show"} ${n} ${word} message${n === 1 ? "" : "s"}`;
  const buttonClass = `w-full rounded-xl border border-dashed border-border text-sm text-muted-foreground hover:bg-muted/50 transition-colors cursor-pointer outline-none focus-visible:ring-2 focus-visible:ring-foreground/30 noora:rounded-lg noora:border-outline-variant noora:text-secondary noora:hover:bg-primary-container noora:focus-visible:ring-secondary ${s.fold}`;
  return (
    <div className={s.stack}>
      <button
        ref={topButton}
        type="button"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
        className={buttonClass}
      >
        {label}
      </button>
      {open && (
        <>
          <Events events={events} showEnglish={showEnglish} s={s} />
          {/* The same button at the far end, so a long run can be put away
              without scrolling back up to its start. */}
          <button
            type="button"
            aria-expanded
            onClick={() => {
              setOpen(false);
              // Bring the top button back into view, so the reader is not left
              // somewhere further down the ticket than where they were.
              topButton.current?.scrollIntoView?.({ block: "nearest" });
            }}
            className={buttonClass}
          >
            {label}
          </button>
        </>
      )}
    </div>
  );
}

function Events({
  events,
  showEnglish,
  s,
}: {
  events: TicketEvent[];
  showEnglish: boolean;
  s: Spacing;
}) {
  // A date heading goes above the first event of each day.
  const startsDay = events.map((e, i) => {
    const d = e.atIst.slice(0, 10);
    return d !== "" && (i === 0 || d !== events[i - 1].atIst.slice(0, 10));
  });
  return (
    <div className={s.stack}>
      {events.map((e, i) => {
        const heading = startsDay[i] ? (
          <p className="text-center text-xs text-muted-foreground">
            {dayHeading(e.atIst)}
          </p>
        ) : null;
        return (
          <div key={`${e.kind}-${e.ts}-${i}`} className={s.stack}>
            {heading}
            {e.kind === "escalation" ? (
              <Pill className={PILL_AMBER} s={s}>
                {e.toMedicalOfficer
                  ? "Escalated to a Medical Officer (internal)"
                  : "Escalated (internal)"}
                {` · ${hourMinute(e.atIst)}`}
              </Pill>
            ) : e.kind === "note" ? (
              <div
                className={`rounded-xl border ${s.bubble} ${PILL_AMBER} bg-amber-50 dark:bg-amber-500/10 noora:rounded-xl`}
              >
                <p className={`${s.body} font-semibold`}>
                  {e.label} · {hourMinute(e.atIst)}
                </p>
                <p className={`mt-1 ${s.body} whitespace-pre-wrap break-words`}>
                  {e.text}
                </p>
              </div>
            ) : (
              <Message m={e} showEnglish={showEnglish} s={s} />
            )}
          </div>
        );
      })}
    </div>
  );
}

/** An automated message longer than this folds to a few lines until opened. */
const LONG_AUTOMATED_CHARS = 280;

function Message({
  m,
  showEnglish,
  s,
}: {
  m: TicketMessage;
  showEnglish: boolean;
  s: Spacing;
}) {
  // With the translation on it reads first and the original sits underneath;
  // with it off only the original shows. A placeholder has no translation.
  const translated = showEnglish && !m.placeholder && m.english !== null;
  const main = translated ? m.english : m.text;
  const original = translated ? m.text : null;
  // Broadcasts and other automated messages can run to a whole page. They fold
  // to three lines (with the original language tucked away too) until opened.
  const [open, setOpen] = useState(false);
  const foldable =
    m.who === "automated" && (main ?? "").length > LONG_AUTOMATED_CHARS;
  const folded = foldable && !open;
  // Staff replies sit to the right and the user to the left, but only
  // where there is room: on a phone every bubble takes nearly the full width.
  const align = m.who === "mse" ? "md:ml-auto" : "md:mr-auto";
  // Material 3 chat roles: what the user wrote on a clean surface, the nurse's
  // reply on a brand-blue container, and automated messages on a neutral one.
  const surface =
    m.who === "user"
      ? "bg-background noora:bg-surface-lowest"
      : m.who === "mse"
        ? "bg-muted/40 noora:border-transparent noora:bg-secondary-container"
        : "bg-muted/20 noora:bg-surface-lowest";
  return (
    <div className={`max-w-full md:max-w-[88%] ${align}`}>
      <div
        className={`rounded-xl border border-border ${s.bubble} ${surface} noora:rounded-xl noora:border-outline-variant`}
      >
        <p className="text-xs text-muted-foreground">
          <span className="font-medium text-foreground">{m.label}</span>
          {m.atIst ? ` · ${hourMinute(m.atIst)}` : ""}
        </p>
        {/* A file with no words of its own is drawn as the note below, not as "[Audio message]". */}
        {!(m.media && m.placeholder) && (
          <p
            className={`mt-1 ${s.body} whitespace-pre-wrap break-words ${
              m.placeholder ? "italic text-muted-foreground" : "text-foreground"
            } ${folded ? "line-clamp-3" : ""}`}
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
        {original && !folded && (
          <p
            className={`mt-2 border-t border-border pt-2 ${s.body} whitespace-pre-wrap break-words text-muted-foreground`}
          >
            {original}
          </p>
        )}
        {foldable && (
          <button
            type="button"
            aria-expanded={open}
            onClick={() => setOpen((o) => !o)}
            className="mt-1 cursor-pointer text-sm text-secondary underline underline-offset-2 outline-none focus-visible:ring-2 focus-visible:ring-secondary rounded"
          >
            {open ? "Show less" : "Read more"}
          </button>
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
              className={`rounded-full border px-2 py-0.5 text-xs ${PILL_AMBER} noora:bg-[#FDE8F0] noora:font-medium noora:text-[#B3125A]`}
            >
              Marked as emergency
            </span>
          )}
        </div>
      )}
    </div>
  );
}
