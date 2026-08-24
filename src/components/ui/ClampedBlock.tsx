"use client";

import React, { useEffect, useLayoutEffect, useRef, useState } from "react";

/**
 * Keeps a tall block to a set height and puts a "View more" button over the
 * cut, with "View less" once it is open. Only appears when the content is
 * actually taller than the limit, so short content is untouched.
 *
 * Written for the expected tool calls on a run result, where a long list used
 * to push the answer below it off the screen. The look is lifted from the
 * evaluator prompt's own clamp so both read the same.
 */
export function ClampedBlock({
  maxHeightClass = "max-h-[11rem]",
  maxHeightPx = 176,
  children,
}: {
  /** Tailwind class for the collapsed height. */
  maxHeightClass?: string;
  /** The same height in pixels, used to decide whether it overflows. */
  maxHeightPx?: number;
  children: React.ReactNode;
}) {
  const ref = useRef<HTMLDivElement | null>(null);
  const [overflowing, setOverflowing] = useState(false);
  const [expanded, setExpanded] = useState(false);

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const measure = () => setOverflowing(el.scrollHeight > maxHeightPx + 1);
    measure();
    if (typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    return () => observer.disconnect();
  }, [maxHeightPx, children]);

  // Content can shrink below the limit while open (a card removed, a filter
  // applied); collapse back so the button does not linger with nothing to do.
  useEffect(() => {
    if (!overflowing && expanded) setExpanded(false);
  }, [overflowing, expanded]);

  const clamped = overflowing && !expanded;

  return (
    <>
      <div className="relative">
        <div
          ref={ref}
          className={clamped ? `${maxHeightClass} overflow-hidden` : ""}
        >
          {children}
        </div>
        {clamped && (
          <div className="pointer-events-none absolute inset-x-0 bottom-0 h-16 flex items-end justify-center rounded-b-md bg-gradient-to-t from-background via-background/85 to-transparent">
            <button
              type="button"
              onClick={() => setExpanded(true)}
              className="pointer-events-auto mb-2 inline-flex items-center gap-1 px-2.5 py-1 rounded-md text-xs font-medium border border-border bg-background text-foreground hover:bg-muted transition-colors cursor-pointer shadow-sm"
            >
              View more
              <svg
                className="w-3.5 h-3.5"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth={2}
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M19.5 8.25l-7.5 7.5-7.5-7.5"
                />
              </svg>
            </button>
          </div>
        )}
      </div>
      {overflowing && expanded && (
        <div className="flex justify-center">
          <button
            type="button"
            onClick={() => setExpanded(false)}
            className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md text-xs font-medium border border-border bg-background text-foreground hover:bg-muted transition-colors cursor-pointer shadow-sm"
          >
            View less
            <svg
              className="w-3.5 h-3.5"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={2}
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M4.5 15.75l7.5-7.5 7.5 7.5"
              />
            </svg>
          </button>
        </div>
      )}
    </>
  );
}
