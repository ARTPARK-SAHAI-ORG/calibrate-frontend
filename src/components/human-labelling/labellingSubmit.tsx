"use client";

import { toast } from "sonner";
import type { SourceEvaluatorRef } from "./AddRunToLabellingTaskDialog";

/**
 * Collapse a list of (possibly repeated / uuid-less) evaluator references into
 * the unique, uuid-bearing set the labelling dialog needs. Both the STT page
 * (from `evaluatorColumns`) and the simulation page (from the name→uuid map)
 * feed their evaluators through this so the dedupe rule lives in one place.
 */
export function dedupeSourceEvaluators(
  refs: Array<{ uuid?: string | null; name?: string }>,
): SourceEvaluatorRef[] {
  const seen = new Set<string>();
  const out: SourceEvaluatorRef[] = [];
  for (const r of refs) {
    if (r.uuid && !seen.has(r.uuid)) {
      seen.add(r.uuid);
      out.push({ uuid: r.uuid, name: r.name });
    }
  }
  return out;
}

const DEFAULT_BUTTON_CLASS =
  "hidden md:inline-flex items-center gap-2 h-8 px-3 rounded-lg text-[13px] font-medium border cursor-pointer transition-colors bg-rose-500/14 border-rose-500/45 text-rose-950 dark:text-rose-100 hover:bg-rose-500/26 dark:hover:bg-rose-500/20";

/**
 * The "Submit for labelling" button shared by the STT and simulation result
 * pages. Owns the empty-selection guard (toast) and the live selection count
 * so the two pages can't drift on that behaviour. Styling is a prop because
 * each page sits it among differently-sized header controls.
 */
export function SubmitForLabellingButton({
  count,
  emptyMessage,
  onOpen,
  className = DEFAULT_BUTTON_CLASS,
}: {
  /** Number of currently-selected (eligible) rows. */
  count: number;
  /** Toast shown when the button is clicked with nothing selected. */
  emptyMessage: string;
  /** Opens the add-to-task dialog (only called when `count > 0`). */
  onOpen: () => void;
  className?: string;
}) {
  return (
    <button
      type="button"
      onClick={() => {
        if (count === 0) {
          toast.error(emptyMessage);
          return;
        }
        onOpen();
      }}
      className={className}
    >
      Submit for labelling{count > 0 ? ` (${count})` : ""}
    </button>
  );
}
