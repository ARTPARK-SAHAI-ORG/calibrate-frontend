import React, { useState } from "react";
import { CompareIcon, PlayIcon, SpinnerIcon } from "@/components/icons";
import { Tooltip } from "@/components/Tooltip";

export type SelectedTest = { uuid: string; name: string };

// The button words show once the strip's inner width holds the count and
// both buttons. The list panels default to LIST_PANEL_MIN_WIDTH_FOR_WORDS so
// they open showing the words: strip inner width = panel - 24 (panel padding)
// - 2 (strip border) - 24 (strip padding), so 352 gives 302.
const WORD = "hidden @min-[300px]:inline";
export const LIST_PANEL_MIN_WIDTH_FOR_WORDS = 352;

/**
 * The row shown above a run's test list once tests are ticked: the count and
 * Run / Compare. Same look as the bulk selection strip on the agent Tests
 * tab, squeezed to fit the list panel. Unticking is done with the row
 * checkboxes and the Deselect all control above.
 */
export function SelectedTestsStrip({
  count,
  onRun,
  onCompare,
}: {
  /** Distinct tests ticked. */
  count: number;
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
  // One line, always. When the panel is too narrow the buttons keep their
  // icons and drop their words; the count always stays.
  return (
    <div className="@container hidden md:flex items-center justify-between gap-2 rounded-md border border-border bg-muted/30 px-3 py-2">
      <span className="text-sm whitespace-nowrap">
        <span className="font-medium">{count}</span> {noun} selected
      </span>
      <div className="flex items-center gap-2 shrink-0">
        {onRun && (
          <Tooltip content="Run the selected tests" position="bottom">
            <button
              type="button"
              onClick={() => void run()}
              disabled={running}
              aria-busy={running}
              aria-label="Run"
              className="h-8 px-2.5 rounded-md text-sm font-medium bg-foreground text-background transition-opacity flex items-center gap-1.5 hover:opacity-90 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:opacity-50"
            >
              {running ? (
                <SpinnerIcon className="w-3.5 h-3.5 animate-spin" />
              ) : (
                <PlayIcon className="w-3.5 h-3.5" />
              )}
              <span className={WORD}>Run</span>
            </button>
          </Tooltip>
        )}
        {onCompare && (
          <Tooltip content="Compare models on the selected tests" position="bottom">
            <button
              type="button"
              onClick={onCompare}
              disabled={running}
              aria-label="Compare"
              className="h-8 px-2.5 rounded-md text-sm font-medium border bg-amber-500/12 border-amber-500/45 text-amber-950 dark:text-amber-100 transition-colors flex items-center gap-1.5 hover:bg-amber-500/22 dark:hover:bg-amber-500/18 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <CompareIcon className="w-3.5 h-3.5" />
              <span className={WORD}>Compare</span>
            </button>
          </Tooltip>
        )}
      </div>
    </div>
  );
}
