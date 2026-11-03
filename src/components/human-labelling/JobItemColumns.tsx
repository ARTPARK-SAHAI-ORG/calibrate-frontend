"use client";

import type { CSSProperties, ReactNode, Ref } from "react";
import { ResizeHandle } from "@/components/test-results/shared";
import { useSavedColumnWidth } from "@/hooks/useSavedColumnWidth";

const WIDTH_KEY = "calibrate:labelling-right-column-width";
const MIN_PERCENT = 20;
const MAX_PERCENT = 70;

/**
 * The item on the left and the evaluators on the right of a labelling job,
 * each scrolling on its own. Stacked on a phone. A labeller can drag the
 * divider between them; someone only reading gets fixed widths and no divider.
 */
export function JobItemColumns({
  taskType,
  canResize,
  leftHasOwnPadding,
  left,
  right,
  rightRef,
}: {
  taskType: string;
  canResize: boolean;
  leftHasOwnPadding: boolean;
  left: ReactNode;
  right: ReactNode;
  rightRef: Ref<HTMLDivElement>;
}) {
  const isSpeech = taskType === "stt" || taskType === "tts";
  const { percent, startDrag } = useSavedColumnWidth(
    WIDTH_KEY,
    isSpeech ? 50 : 30,
    MIN_PERCENT,
    MAX_PERCENT,
  );

  const leftWidth = canResize
    ? "md:flex-1 md:min-w-0"
    : `${isSpeech ? "md:flex-1" : "md:flex-[6]"} md:border-r border-border`;
  const rightWidth = canResize
    ? "md:w-[var(--right-column-width)] md:shrink-0"
    : isSpeech
      ? "md:flex-1"
      : "md:flex-[4]";

  return (
    <>
      <div
        className={`${leftWidth} md:min-h-0 md:overflow-y-auto px-4 md:px-6 ${
          leftHasOwnPadding ? "pb-4 md:pb-6" : "py-4 md:py-6"
        }`}
      >
        {left}
      </div>
      {canResize && (
        <ResizeHandle onMouseDown={startDrag} label="Resize the columns" />
      )}
      <div
        ref={rightRef}
        style={
          canResize
            ? ({ "--right-column-width": `${percent}%` } as CSSProperties)
            : undefined
        }
        className={`${rightWidth} md:min-h-0 md:overflow-y-auto p-4 md:p-6`}
      >
        {right}
      </div>
    </>
  );
}
