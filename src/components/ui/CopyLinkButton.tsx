"use client";

import { useEffect, useState } from "react";
import { Tooltip } from "@/components/Tooltip";
import { copyToClipboard } from "@/lib/clipboard";

/**
 * Copies an address, and says so for a moment. Used everywhere a page shows a
 * link someone is meant to send on: the invite link in workspace settings and
 * the labelling links on the annotator and task pages.
 *
 * It sits beside the address rather than over it, which is what separates it
 * from `CopyCodeButton`: that one tucks into the corner of a block of code.
 *
 * A click never reaches the row underneath, so the control can sit in a table
 * row that opens something of its own without every caller remembering to stop
 * it.
 */
export function CopyLinkButton({
  value,
  label = "Copy link",
}: {
  /** The address to copy. */
  value: string;
  /** What the hover text and a screen reader say before it is copied. */
  label?: string;
}) {
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!copied) return;
    const t = setTimeout(() => setCopied(false), 1500);
    return () => clearTimeout(t);
  }, [copied]);

  const text = copied ? "Copied" : label;

  return (
    <Tooltip content={text} position="top" className="shrink-0">
      <button
        type="button"
        onClick={async (e) => {
          e.stopPropagation();
          await copyToClipboard(value);
          setCopied(true);
        }}
        aria-label={text}
        className={`w-7 h-7 flex items-center justify-center rounded-md border transition-colors cursor-pointer ${
          copied
            ? "border-green-200 bg-green-100 text-green-700 dark:border-green-500/40 dark:bg-green-500/20 dark:text-green-400"
            : "border-border bg-background text-muted-foreground hover:bg-muted/50 hover:text-foreground"
        }`}
      >
        {copied ? (
          <svg
            className="w-3.5 h-3.5"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={2.5}
          >
            <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
          </svg>
        ) : (
          <svg
            className="w-3.5 h-3.5"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={1.8}
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2"
            />
          </svg>
        )}
      </button>
    </Tooltip>
  );
}
