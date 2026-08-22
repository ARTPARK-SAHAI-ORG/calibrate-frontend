"use client";

/** One choice in the row of pills. */
export interface SegmentedFilterOption<T extends string> {
  value: T;
  label: string;
}

interface SegmentedFilterProps<T extends string> {
  value: T;
  onChange: (value: T) => void;
  options: SegmentedFilterOption<T>[];
  /**
   * "md" (default) — standalone filter row, fixed-width chips.
   * "sm" — compact, equal-width chips that fill their container (used inside
   * narrow dropdowns).
   */
  size?: "sm" | "md";
  /** Extra classes for the pill track (positioning, e.g. `mt-2`, `w-fit`). */
  className?: string;
  /** Describes the row of pills for screen readers. */
  ariaLabel?: string;
}

/**
 * A row of pills where exactly one is on, used to filter a list. Presentational
 * only: the caller owns which pill is on and does whatever the change needs.
 */
export function SegmentedFilter<T extends string>({
  value,
  onChange,
  options,
  size = "md",
  className = "",
  ariaLabel,
}: SegmentedFilterProps<T>) {
  const buttonClasses =
    size === "sm"
      ? "flex-1 h-6 px-1.5 text-[11px] whitespace-nowrap"
      : "h-7 px-3 text-xs";

  return (
    <div
      aria-label={ariaLabel}
      className={`flex items-center gap-0.5 rounded-full bg-muted/60 p-0.5 ${className}`}
    >
      {options.map((opt) => (
        <button
          key={opt.value}
          type="button"
          onClick={() => onChange(opt.value)}
          aria-pressed={value === opt.value}
          className={`${buttonClasses} rounded-full font-medium cursor-pointer transition-colors ${
            value === opt.value
              ? "bg-background text-foreground shadow-sm"
              : "text-muted-foreground hover:text-foreground"
          }`}
        >
          {opt.label}
        </button>
      ))}
    </div>
  );
}
