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
            d="M4 4v6h6M20 20v-6h-6M20 9A8 8 0 006.34 6.34M4 15a8 8 0 0013.66 2.66"
          />
        </svg>
      </button>
    </Tooltip>
  );
}
