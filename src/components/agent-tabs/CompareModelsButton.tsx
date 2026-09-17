import React from "react";
import { CompareIcon } from "@/components/icons";

/**
 * The Tests tab header's "compare models" / benchmark trigger button. It
 * compares the ticked tests when there are any, else every linked test.
 * Keeps the disabled rules, the two disabled-reason tooltips, and the chart
 * icon in one place.
 */
export function CompareModelsButton({
  label,
  isConnectionUnverified,
  isBenchmarkDisabled,
  onClick,
}: {
  label: React.ReactNode;
  isConnectionUnverified: boolean;
  isBenchmarkDisabled: boolean;
  onClick: () => void;
}) {
  const disabled = isConnectionUnverified || isBenchmarkDisabled;
  const buttonClass = `h-9 md:h-10 px-3 md:px-4 rounded-md text-sm md:text-base font-medium border transition-colors flex items-center gap-2 bg-amber-500/12 border-amber-500/45 text-amber-950 dark:text-amber-100 ${
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
        <CompareIcon className="w-4 h-4" />
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
