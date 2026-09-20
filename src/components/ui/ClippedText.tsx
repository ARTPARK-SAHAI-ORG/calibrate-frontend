"use client";

import type { ReactNode } from "react";
import { Tooltip } from "@/components/Tooltip";
import { useIsNameClipped } from "@/hooks/useIsNameClipped";

/**
 * Text a column may not have room for, with the whole of it on hover only
 * when some of it is actually cut off. Repeating text the reader can already
 * see in full just covers what is underneath and says nothing.
 *
 * `className` carries whatever does the cutting: `truncate` for one line,
 * `line-clamp-*` or a fixed height it scrolls inside for several. Both are
 * measured, so a cell that cuts its text off downwards gets the hover too.
 */
export function ClippedText({
  text,
  className = "",
  children,
}: {
  /** The whole text, which is also what the hover shows. */
  text: string;
  /** Classes on the measured element, including the one that cuts text off. */
  className?: string;
  /** Drawn in place of `text`, for a cell that shows a dash when empty. */
  children?: ReactNode;
}) {
  const { ref, clipped } = useIsNameClipped(text);
  const body = (
    <span ref={ref} className={className}>
      {children ?? text}
    </span>
  );
  // Nothing to show when the cell stands in for an absent value with a dash
  // or "(empty)": a popup holding no words is worse than no popup.
  return clipped && text.trim() !== "" ? (
    <Tooltip content={text} className="min-w-0 max-w-full">
      {body}
    </Tooltip>
  ) : (
    body
  );
}
