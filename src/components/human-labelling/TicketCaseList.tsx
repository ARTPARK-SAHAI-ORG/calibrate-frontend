"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Tooltip } from "@/components/Tooltip";

export type CaseStatus = "completed" | "in progress" | null;

export type CaseRow = {
  uuid: string;
  /** Its place in the job, from 1. */
  position: number;
  title: string;
  status: CaseStatus;
  preview: string;
  /** Lower case, everything a search looks through. */
  searchText: string;
};

const STATUS_WORDS: Record<Exclude<CaseStatus, null>, string> = {
  completed: "Completed",
  "in progress": "In progress",
};

/** Three shapes, so a case's state never rests on colour alone. */
function StatusIcon({ status }: { status: CaseStatus }) {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 20 20"
      className="h-5 w-5 shrink-0"
      fill="none"
      strokeWidth="1.75"
    >
      {status === "completed" ? (
        <>
          <circle cx="10" cy="10" r="8.25" className="fill-secondary stroke-secondary" />
          <path d="M6.2 10.2l2.6 2.6 5-5.4" className="stroke-on-primary" strokeLinecap="round" strokeLinejoin="round" />
        </>
      ) : status === "in progress" ? (
        <>
          <circle cx="10" cy="10" r="8.25" className="stroke-amber-600" />
          <path d="M10 1.75a8.25 8.25 0 0 1 0 16.5z" className="fill-amber-500 stroke-amber-600" />
        </>
      ) : (
        <circle cx="10" cy="10" r="8.25" className="stroke-outline" />
      )}
    </svg>
  );
}

/** Whether a key press happened while someone was typing somewhere. */
function typingInto(target: EventTarget | null): boolean {
  const el = target as HTMLElement | null;
  if (!el) return false;
  return (
    el.isContentEditable ||
    ["INPUT", "TEXTAREA", "SELECT"].includes(el.tagName)
  );
}

/**
 * The list of cases on the left of a ticket job, in the style of the standalone
 * safety viewer: one row per ticket with what the user first wrote, when it
 * opened and how long it stayed open, and its state. It can be searched (press
 * `/`), narrowed to the cases still to do, and folded away. On a phone it sits
 * above the ticket behind an "All cases" button.
 */
export function TicketCaseList({
  rows,
  currentUuid,
  onSelect,
}: {
  rows: CaseRow[];
  currentUuid: string | null;
  onSelect: (uuid: string) => void;
}) {
  const [query, setQuery] = useState("");
  const [unfinishedOnly, setUnfinishedOnly] = useState(false);
  const [folded, setFolded] = useState(false);
  const [phoneOpen, setPhoneOpen] = useState(false);
  const searchRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLUListElement>(null);

  const unfinished = rows.filter((r) => r.status !== "completed").length;
  const q = query.trim().toLowerCase();
  const shown = useMemo(
    () =>
      rows.filter(
        (r) =>
          (!unfinishedOnly || r.status !== "completed") &&
          (!q || r.searchText.includes(q)),
      ),
    [rows, unfinishedOnly, q],
  );

  // "/" jumps to the search box, as in the safety viewer.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "/" || e.metaKey || e.ctrlKey || e.altKey) return;
      if (typingInto(e.target)) return;
      e.preventDefault();
      setFolded(false);
      setPhoneOpen(true);
      searchRef.current?.focus();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  // Keep the case being read in view. Moves only the list, never the page.
  useEffect(() => {
    const list = listRef.current;
    const row = list?.querySelector<HTMLElement>('[aria-current="true"]');
    if (!list || !row) return;
    if (row.offsetTop < list.scrollTop)
      list.scrollTop = row.offsetTop;
    else if (row.offsetTop + row.offsetHeight > list.scrollTop + list.clientHeight)
      list.scrollTop = row.offsetTop + row.offsetHeight - list.clientHeight;
  }, [currentUuid, shown.length]);

  // Written out in full so Tailwind can see every class.
  const panelClass = `${phoneOpen ? "flex" : "hidden"} ${folded ? "md:hidden" : "md:flex"}`;
  return (
    <aside
      data-testid="ticket-case-list"
      className={`shrink-0 border-b md:border-b-0 md:border-r border-border bg-surface-low md:flex md:flex-col md:min-h-0 ${
        folded ? "md:w-12" : "md:w-72 lg:w-80"
      }`}
    >
      {/* Phone: one button opens the list above the ticket. */}
      <button
        type="button"
        aria-expanded={phoneOpen}
        onClick={() => setPhoneOpen((o) => !o)}
        className="md:hidden flex w-full cursor-pointer items-center justify-between px-4 py-3 text-sm font-medium text-foreground outline-none focus-visible:ring-2 focus-visible:ring-secondary"
      >
        <span>All cases</span>
        <span className="text-on-surface-variant">
          {unfinished} unfinished {phoneOpen ? "▴" : "▾"}
        </span>
      </button>

      {/* Desktop, folded away: one button brings it back. */}
      {folded && (
        <Tooltip content="Show the list of cases" position="right" className="hidden md:block">
          <button
            type="button"
            aria-label="Show the list of cases"
            onClick={() => setFolded(false)}
            className="hidden md:flex h-10 w-12 cursor-pointer items-center justify-center text-on-surface-variant hover:text-foreground outline-none focus-visible:ring-2 focus-visible:ring-secondary"
          >
            »
          </button>
        </Tooltip>
      )}

      <div
        className={`${panelClass} min-h-0 flex-1 flex-col`}
      >
        <div className="space-y-2 p-3">
          <div className="flex items-center gap-2">
            <input
              ref={searchRef}
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Escape") {
                  setQuery("");
                  e.currentTarget.blur();
                }
              }}
              aria-label="Search cases"
              placeholder="Search cases ( / )"
              className="h-11 md:h-10 min-w-0 flex-1 rounded-lg border border-transparent bg-surface-container px-3 text-sm text-foreground outline-none placeholder:text-on-surface-variant focus-visible:ring-2 focus-visible:ring-secondary"
            />
            <Tooltip content="Fold away the list" position="bottom" className="hidden md:block">
              <button
                type="button"
                aria-label="Fold away the list of cases"
                onClick={() => setFolded(true)}
                className="hidden md:flex h-10 w-10 cursor-pointer items-center justify-center rounded-lg bg-surface-container text-foreground hover:bg-surface-high outline-none focus-visible:ring-2 focus-visible:ring-secondary"
              >
                «
              </button>
            </Tooltip>
          </div>
          <label className="flex min-h-11 md:min-h-8 cursor-pointer items-center gap-2 text-sm text-foreground">
            <input
              type="checkbox"
              checked={unfinishedOnly}
              onChange={(e) => setUnfinishedOnly(e.target.checked)}
              className="h-5 w-5 cursor-pointer accent-secondary"
            />
            Show unfinished only
          </label>
          <p className="text-xs text-on-surface-variant" data-testid="case-count">
            {shown.length} of {rows.length} cases · {unfinished} unfinished
          </p>
        </div>

        {shown.length === 0 ? (
          <p className="px-4 py-6 text-sm text-on-surface-variant">
            No cases match. Clear the search or untick &quot;Show unfinished only&quot; to see more.
          </p>
        ) : (
          <ul
            ref={listRef}
            className="relative max-h-[60vh] overflow-y-auto border-t border-border md:max-h-none md:flex-1"
          >
            {shown.map((r) => {
              const current = r.uuid === currentUuid;
              return (
                <li key={r.uuid} className="border-b border-border last:border-b-0">
                  <button
                    type="button"
                    aria-current={current ? "true" : undefined}
                    aria-label={`Case ${r.position}${r.status ? `, ${STATUS_WORDS[r.status].toLowerCase()}` : ", not answered"}`}
                    onClick={() => {
                      onSelect(r.uuid);
                      setPhoneOpen(false);
                    }}
                    className={`flex w-full cursor-pointer items-start gap-3 border-l-4 px-3 py-3 text-left outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-secondary ${
                      current
                        ? "border-secondary bg-primary-container"
                        : "border-transparent hover:bg-surface-container"
                    }`}
                  >
                    <span className="mt-0.5">
                      <StatusIcon status={r.status} />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="line-clamp-2 text-sm font-medium text-foreground">
                        {r.preview || r.title}
                      </span>
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </aside>
  );
}
