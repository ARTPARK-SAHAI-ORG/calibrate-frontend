"use client";

import { Tooltip } from "@/components/Tooltip";
import { SpinnerIcon } from "@/components/icons";

type RerunIconButtonProps = {
  onClick: () => void;
  /** Tooltip text and accessible label. */
  tooltip?: string;
  /** Shows a spinner and disables the button while the new run is being
   *  created. Without it the button looks idle for the whole request and a
   *  second click starts a second run. */
  loading?: boolean;
  className?: string;
};

/**
 * Icon-only "rerun" control shown beside a results dialog title. Text lives in
 * a tooltip so it doesn't add to the crowded right-hand action cluster.
 */
export function RerunIconButton({
  onClick,
  tooltip = "Rerun",
  loading = false,
  className,
}: RerunIconButtonProps) {
  return (
    <Tooltip content={tooltip} position="bottom">
      <button
        type="button"
        disabled={loading}
        onClick={() => {
          if (loading) return;
          onClick();
        }}
        aria-label={tooltip}
        aria-busy={loading}
        className={`flex items-center justify-center h-7 w-7 rounded-md border border-border hover:bg-muted transition-colors disabled:opacity-50 ${
          loading ? "cursor-not-allowed" : "cursor-pointer"
        } ${className ?? ""}`}
      >
        {loading ? (
          <SpinnerIcon className="w-4 h-4 animate-spin" />
        ) : (
          <svg
            className="w-4 h-4"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={2}
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0l3.181 3.183a8.25 8.25 0 0013.803-3.7M4.031 9.865a8.25 8.25 0 0113.803-3.7l3.181 3.182m0-4.991v4.99"
            />
          </svg>
        )}
      </button>
    </Tooltip>
  );
}
