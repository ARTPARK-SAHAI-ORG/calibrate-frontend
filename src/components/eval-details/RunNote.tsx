import type { ReactNode } from "react";
import { WarningTriangleIcon } from "@/components/icons";

/**
 * The amber note at the top of a run's summary: something about the run itself
 * the reader has to know before reading the numbers, such as the run having
 * been stopped or some tests having produced no answer.
 *
 * One component so the run window and the model comparison window cannot end
 * up saying the same thing two different ways.
 */
export function RunNote({ children }: { children: ReactNode }) {
  return (
    <div className="flex gap-3 rounded-lg border border-amber-500/40 bg-amber-500/10 p-3 text-sm text-foreground">
      <WarningTriangleIcon className="mt-0.5 h-4 w-4 shrink-0 text-amber-500" />
      <p>{children}</p>
    </div>
  );
}
