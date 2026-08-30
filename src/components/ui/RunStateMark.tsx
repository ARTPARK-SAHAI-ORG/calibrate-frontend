import type { ReactNode } from "react";
import { Tooltip } from "@/components/Tooltip";
import type { RunState } from "@/lib/testTypes";

const MARKS: Record<
  RunState,
  { tooltip: string; className: string; glyph: ReactNode }
> = {
  finished: {
    tooltip: "Ran every test",
    className: "text-green-600",
    glyph: (
      <path
        d="M7.5 12.5l3 3 6-6.5"
        stroke="white"
        strokeWidth={2.2}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    ),
  },
  stopped: {
    tooltip: "Someone stopped this run before it finished",
    className: "text-amber-500",
    glyph: (
      <>
        <circle
          cx="12"
          cy="12"
          r="6"
          stroke="white"
          strokeWidth={2.2}
          fill="none"
        />
        <path
          d="M8 8l8 8"
          stroke="white"
          strokeWidth={2.2}
          strokeLinecap="round"
        />
      </>
    ),
  },
  error: {
    tooltip: "This run broke before it could finish",
    className: "text-red-500",
    glyph: (
      <>
        <path
          d="M12 7v6"
          stroke="white"
          strokeWidth={2.2}
          strokeLinecap="round"
        />
        <circle cx="12" cy="16.5" r="1.3" fill="white" />
      </>
    ),
  },
};

/**
 * The round mark next to a run's name, in the list of runs and in the window
 * that opens from it. One component so the two cannot end up saying the same
 * thing two different ways.
 */
export function RunStateMark({
  state,
  className,
}: {
  state: RunState;
  className?: string;
}) {
  const mark = MARKS[state];
  return (
    <Tooltip content={mark.tooltip} position="top">
      <svg
        className={`w-4 h-4 shrink-0 ${mark.className} ${className ?? ""}`}
        viewBox="0 0 24 24"
        fill="none"
        role="img"
        aria-label={mark.tooltip}
      >
        <circle cx="12" cy="12" r="10" fill="currentColor" />
        {mark.glyph}
      </svg>
    </Tooltip>
  );
}
