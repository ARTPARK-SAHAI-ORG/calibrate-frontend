"use client";

import { useRef, useState } from "react";
import { parseBackendErrorMessage } from "@/lib/parseBackendError";
import { reportError } from "@/lib/reportError";

/** Something before and after the "@", and a dot after it. Deliberately loose. */
const looksLikeAnAddress = (value: string) =>
  /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);

type Chip = { email: string; failure?: string };

/**
 * The left half of the invite dialog: several email addresses are collected as
 * chips, then added one after another, because the backend adds one person per
 * request. Addresses that were added disappear; the ones that failed stay put
 * with the reason, so the reader can fix them and try again.
 */
export function AddByEmailPanel({
  onAddMember,
}: {
  onAddMember: (email: string) => Promise<unknown>;
}) {
  const [chips, setChips] = useState<Chip[]>([]);
  const [text, setText] = useState("");
  const [typingError, setTypingError] = useState<string | null>(null);
  const [isAdding, setIsAdding] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  /** Turn whatever has been typed or pasted into chips. */
  const commit = (raw: string) => {
    const parts = raw.split(/[,;\s]+/).filter(Boolean);
    if (parts.length === 0) return true;
    const bad = parts.filter((p) => !looksLikeAnAddress(p));
    if (bad.length > 0) {
      setTypingError(`${bad[0]} is not an email address.`);
      return false;
    }
    setChips((current) => {
      const seen = new Set(current.map((c) => c.email));
      return [
        ...current,
        ...parts.filter((p) => !seen.has(p)).map((email) => ({ email })),
      ];
    });
    setTypingError(null);
    return true;
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter" || e.key === ",") {
      e.preventDefault();
      if (commit(text)) setText("");
      return;
    }
    if (e.key === "Backspace" && text === "") {
      setChips((current) => current.slice(0, -1));
    }
  };

  const handlePaste = (e: React.ClipboardEvent<HTMLInputElement>) => {
    const pasted = e.clipboardData.getData("text");
    if (!/[,;\s]/.test(pasted)) return;
    e.preventDefault();
    if (commit(`${text}${pasted}`)) setText("");
  };

  const pending = commitPreview(chips, text);

  const handleAdd = async () => {
    if (isAdding) return;
    // Anything still in the box counts too, so nothing typed is silently lost.
    const typed = text.split(/[,;\s]+/).filter(Boolean);
    if (typed.some((t) => !looksLikeAnAddress(t))) {
      setTypingError(
        `${typed.find((t) => !looksLikeAnAddress(t))} is not an email address.`,
      );
      return;
    }
    const queue = [...chips.map((c) => c.email)];
    for (const part of typed) {
      if (!queue.includes(part)) queue.push(part);
    }
    if (queue.length === 0) return;
    setText("");
    setIsAdding(true);
    const failures: Chip[] = [];
    for (const email of queue) {
      try {
        await onAddMember(email);
      } catch (err) {
        reportError("Error adding a workspace member:", err);
        failures.push({
          email,
          failure: parseBackendErrorMessage(err, "Could not add this person"),
        });
      }
    }
    setChips(failures);
    setIsAdding(false);
  };

  return (
    <div className="space-y-2">
      {/* One box holding the addresses already entered and the caret, the way
          every other address field works. Clicking anywhere in it types. */}
      <div
        onClick={() => inputRef.current?.focus()}
        className={`flex flex-wrap items-center gap-1.5 min-h-10 px-2 py-1.5 rounded-md border bg-background cursor-text focus-within:ring-2 ${
          typingError
            ? "border-red-500/60 focus-within:ring-red-500/20"
            : "border-border focus-within:ring-foreground/10"
        }`}
      >
        {chips.map((chip) => (
          <span
            key={chip.email}
            className={`inline-flex items-center gap-1 text-sm px-2 py-0.5 rounded border ${
              chip.failure
                ? "border-red-500/60 bg-red-500/10 text-red-500"
                : "border-border bg-muted/40 text-foreground"
            }`}
          >
            {chip.email}
            <button
              type="button"
              onClick={() =>
                setChips((current) =>
                  current.filter((c) => c.email !== chip.email),
                )
              }
              disabled={isAdding}
              aria-label={`Remove ${chip.email}`}
              className="cursor-pointer hover:opacity-70 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <svg
                aria-hidden="true"
                className="w-3 h-3"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth={2}
              >
                <path strokeLinecap="round" d="M6 6l12 12M18 6L6 18" />
              </svg>
            </button>
          </span>
        ))}

        <input
          type="text"
          value={text}
          onChange={(e) => {
            setText(e.target.value);
            setTypingError(null);
          }}
          onKeyDown={handleKeyDown}
          onPaste={handlePaste}
          ref={inputRef}
          placeholder={chips.length === 0 ? "teammate@example.com" : ""}
          autoFocus
          disabled={isAdding}
          aria-label="Email address"
          className="flex-1 min-w-[10rem] h-7 bg-transparent text-sm text-foreground placeholder:text-muted-foreground focus:outline-none disabled:opacity-50"
        />
      </div>

      {typingError && <p className="text-[13px] text-red-500">{typingError}</p>}

      {chips.some((c) => c.failure) && (
        <ul className="space-y-1">
          {chips
            .filter((c) => c.failure)
            .map((c) => (
              <li key={c.email} className="text-[13px] text-red-500">
                {c.email}: {c.failure}
              </li>
            ))}
        </ul>
      )}

      <button
        type="button"
        onClick={handleAdd}
        disabled={pending === 0 || isAdding}
        className="w-full h-10 rounded-md text-sm font-medium bg-foreground text-background hover:opacity-90 transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
      >
        {isAdding && (
          <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
            <circle
              className="opacity-25"
              cx="12"
              cy="12"
              r="10"
              stroke="currentColor"
              strokeWidth="4"
            />
            <path
              className="opacity-75"
              fill="currentColor"
              d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
            />
          </svg>
        )}
        {isAdding
          ? "Adding people..."
          : pending > 1
            ? `Add ${pending} people`
            : "Add"}
      </button>
    </div>
  );
}

/** How many addresses the button would send: the chips plus anything typed. */
function commitPreview(chips: Chip[], text: string) {
  const typed = text.split(/[,;\s]+/).filter(Boolean);
  const seen = new Set(chips.map((c) => c.email));
  return chips.length + typed.filter((t) => !seen.has(t)).length;
}
