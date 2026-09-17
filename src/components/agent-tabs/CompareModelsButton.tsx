import React from "react";
import { CompareIcon } from "@/components/icons";

/**
 * Shared "compare models" / benchmark trigger button. Used both in the Tests
 * tab header (compare all linked tests) and in the selection bulk-action bar
 * (compare only the selected tests). Keeps the disabled rules, the two
 * disabled-reason tooltips, and the chart icon in one place so the two
 * surfaces can't drift apart.
 */
export function CompareModelsButton({
  size,
  label,
  isConnectionUnverified,
  isBenchmarkDisabled,
  onClick,
}: {
  size: "header" | "bulk";
  label: React.ReactNode;
  isConnectionUnverified: boolean;
  isBenchmarkDisabled: boolean;
  onClick: () => void;
}) {
  const disabled = isConnectionUnverified || isBenchmarkDisabled;
  const isHeader = size === "header";

  const buttonClass = isHeader
    ? `h-9 md:h-10 px-3 md:px-4 rounded-md text-sm md:text-base font-medium border transition-colors flex items-center gap-2 bg-amber-500/12 border-amber-500/45 text-amber-950 dark:text-amber-100 ${
        disabled
          ? "opacity-50 cursor-not-allowed"
          : "hover:bg-amber-500/22 dark:hover:bg-amber-500/18 cursor-pointer"
      }`
    : `h-8 px-3 rounded-md text-sm font-medium border bg-amber-500/12 border-amber-500/45 text-amber-950 dark:text-amber-100 transition-colors flex items-center gap-1.5 ${
        disabled
          ? "opacity-50 cursor-not-allowed"
          : "hover:bg-amber-500/22 dark:hover:bg-amber-500/18 cursor-pointer"
      }`;

  return (
    <div className="relative group/compare">
      <button
        onClick={() => {
          if (disabled) return;
          onClick();
        }}
        disabled={disabled}
        className={buttonClass}
      >
        <CompareIcon className={isHeader ? "w-4 h-4" : "w-3.5 h-3.5"} />
        {label}
      </button>
      {isConnectionUnverified && (
        <div className="absolute left-1/2 -translate-x-1/2 bottom-full mb-2 px-3 py-1.5 bg-foreground text-background text-xs rounded-lg shadow-lg opacity-0 group-hover/compare:opacity-100 pointer-events-none transition-opacity whitespace-nowrap z-50">
          Verify agent connection first
        </div>
      )}
      {!isConnectionUnverified && isBenchmarkDisabled && (
        <div className="absolute left-1/2 -translate-x-1/2 bottom-full mb-2 px-3 py-1.5 bg-foreground text-background text-xs rounded-lg shadow-lg opacity-0 group-hover/compare:opacity-100 pointer-events-none transition-opacity whitespace-nowrap z-50">
          You have turned off benchmarking models in connection settings — turn
          it on to enable this
        </div>
      )}
    </div>
  );
}
