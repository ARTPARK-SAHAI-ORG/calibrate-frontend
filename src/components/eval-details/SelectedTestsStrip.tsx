import React, { useState } from "react";
import { CompareIcon, PlayIcon, SpinnerIcon } from "@/components/icons";
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
}: {
  /** Distinct tests ticked. */
  count: number;
  /** Rows ticked, when a test can be ticked more than once (under each model
   *  in a comparison). Above `count`, the label says the extra ticks are the
   *  same tests. */
  tickedCount?: number;
  /** Starts the run. Run stays busy and both buttons disabled until it settles. */
  onRun?: () => Promise<unknown> | void;
  onCompare?: () => void;
}): React.ReactElement | null {
  const [running, setRunning] = useState(false);
  if (count === 0 || (!onRun && !onCompare)) return null;
  const run = async () => {
    if (!onRun) return;
    setRunning(true);
    try {
      await onRun();
    } finally {
      setRunning(false);
    }
  };
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
            onClick={() => void run()}
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
            <CompareIcon className="w-3.5 h-3.5" />
            Compare
          </button>
        )}
      </div>
    </div>
  );
}
