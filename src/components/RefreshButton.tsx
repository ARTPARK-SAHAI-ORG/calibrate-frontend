"use client";

import { Tooltip } from "@/components/Tooltip";

type RefreshButtonProps = {
  onClick: () => void;
  loading?: boolean;
  disabled?: boolean;
  tooltip?: string;
  className?: string;
};

export function RefreshButton({
  onClick,
  loading,
  disabled,
  tooltip = "Refresh",
  className,
}: RefreshButtonProps) {
  const isDisabled = disabled || loading;

  return (
    <Tooltip content={tooltip} position="top">
      <button
        type="button"
        onClick={onClick}
        disabled={isDisabled}
        aria-label={tooltip}
        className={`flex items-center justify-center h-7 w-7 rounded-lg border cursor-pointer transition-colors disabled:opacity-50 disabled:cursor-not-allowed bg-slate-500/10 border-slate-500/30 text-slate-700 dark:text-slate-200 hover:bg-slate-500/20 dark:hover:bg-slate-500/25 ${className ?? ""}`}
      >
        <svg
          className={`w-4 h-4 ${loading ? "animate-spin" : ""}`}
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          strokeWidth={2}
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M21 12a9 9 0 11-9-9c2.52 0 4.93 1 6.74 2.74L21 8"
          />
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M21 3v5h-5"
          />
        </svg>
      </button>
    </Tooltip>
  );
}
