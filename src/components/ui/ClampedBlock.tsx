"use client";

import React, { useEffect, useLayoutEffect, useRef, useState } from "react";
import { ViewMoreToggle } from "./ViewMoreToggle";

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
            <ViewMoreToggle
              expanded={false}
              onClick={() => setExpanded(true)}
              className="pointer-events-auto mb-2 shadow-sm"
            />
          </div>
        )}
      </div>
      {overflowing && expanded && (
        <div className="flex justify-center">
          <ViewMoreToggle
            expanded
            onClick={() => setExpanded(false)}
            className="shadow-sm"
          />
        </div>
      )}
    </>
  );
}
