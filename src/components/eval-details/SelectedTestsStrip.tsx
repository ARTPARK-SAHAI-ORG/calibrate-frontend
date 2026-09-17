import React from "react";
import { PlayIcon, SpinnerIcon } from "@/components/icons";
import { Tooltip } from "@/components/Tooltip";

export type SelectedTest = { uuid: string; name: string };

/**
 * The row shown above a run's test list once tests are ticked: the count and
 * Run / Compare. Same look as the bulk selection strip on the agent Tests
 * tab, squeezed to fit the list panel. Unticking is done with the row
 * checkboxes and the Deselect all control above.
 */
export function SelectedTestsStrip({
  count,
  tickedCount,
  onRun,
  onCompare,
  running = false,
}: {
  /** Distinct tests ticked. */
  count: number;
  /** Rows ticked, when a test can be ticked more than once (under each model
   *  in a comparison). Above `count`, the label says the extra ticks are the
   *  same tests. */
  tickedCount?: number;
  onRun?: () => void;
  onCompare?: () => void;
  running?: boolean;
}): React.ReactElement | null {
  if (count === 0 || (!onRun && !onCompare)) return null;
  const noun = count === 1 ? "test" : "tests";
  // One line, always. The count is dropped first when the panel is too narrow
  // to hold it beside the buttons; the ticked rows still show what it counts.
  return (
    <div className="@container hidden md:flex items-center justify-between gap-2 rounded-md border border-border bg-muted/30 px-3 py-2">
      <span className="hidden @min-[340px]:inline text-sm whitespace-nowrap">
        {tickedCount !== undefined && tickedCount > count ? (
          <Tooltip
            content="The same test ticked under more than one model counts once."
            position="bottom"
          >
            <span className="cursor-help underline decoration-dotted">
              <span className="font-medium">{count}</span> {noun} selected
            </span>
          </Tooltip>
        ) : (
          <>
            <span className="font-medium">{count}</span> {noun} selected
          </>
        )}
      </span>
      <div className="flex items-center gap-2 ml-auto">
        {onRun && (
          <button
            type="button"
            onClick={onRun}
            disabled={running}
            aria-busy={running}
            className="h-8 px-3 rounded-md text-sm font-medium bg-foreground text-background transition-opacity flex items-center gap-1.5 hover:opacity-90 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:opacity-50"
          >
            {running ? (
              <SpinnerIcon className="w-3.5 h-3.5 animate-spin" />
            ) : (
              <PlayIcon className="w-3.5 h-3.5" />
            )}
            Run
          </button>
        )}
        {onCompare && (
          <button
            type="button"
            onClick={onCompare}
            disabled={running}
            className="h-8 px-3 rounded-md text-sm font-medium border bg-amber-500/12 border-amber-500/45 text-amber-950 dark:text-amber-100 transition-colors flex items-center gap-1.5 hover:bg-amber-500/22 dark:hover:bg-amber-500/18 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
          >
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
                d="M3.75 3v11.25A2.25 2.25 0 006 16.5h2.25M3.75 3h-1.5m1.5 0h16.5m0 0h1.5m-1.5 0v11.25A2.25 2.25 0 0118 16.5h-2.25m-7.5 0h7.5m-7.5 0l-1 3m8.5-3l1 3m0 0l.5 1.5m-.5-1.5h-9.5m0 0l-.5 1.5m.75-9l3-3 2.148 2.148A12.061 12.061 0 0116.5 7.605"
              />
            </svg>
            Compare
          </button>
        )}
      </div>
    </div>
  );
}
