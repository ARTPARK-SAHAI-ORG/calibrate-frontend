/**
 * Numbered badge shown at the start of each dataset row in the STT/TTS editors.
 * Stays circular for small numbers and grows into a pill for large ones
 * (datasets can run into the thousands).
 */
export function RowIndexBadge({ value }: { value: number }) {
  return (
    <div className="flex-shrink-0 min-w-6 h-6 px-1.5 rounded-full bg-muted flex items-center justify-center text-[11px] font-medium text-muted-foreground">
      {value}
    </div>
  );
}
