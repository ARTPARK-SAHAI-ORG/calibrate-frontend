"use client";

import React from "react";
import {
  formatStatus,
  getStatusBadgeClass,
  isActiveStatus,
} from "@/lib/status";

type StatusBadgeProps = {
  /** The status string (e.g., "queued", "in_progress", "done", "failed") */
  status: string;
  /** Whether to show a spinner for active statuses (queued, in_progress) */
  showSpinner?: boolean;
};

/**
 * A badge component that displays a status with optional spinner for active states.
 * Used for displaying task/job status in evaluation and simulation pages.
 */
export function StatusBadge({ status, showSpinner = false }: StatusBadgeProps) {
  const isActive = isActiveStatus(status);

  return (
    <div className="flex items-center gap-3">
      <span
        className={`inline-flex items-center px-2.5 py-1 rounded-md text-xs font-medium ${getStatusBadgeClass(
          status
        )}`}
      >
        {formatStatus(status)}
      </span>
      {showSpinner && isActive && (
        <svg
          className="w-4 h-4 animate-spin text-muted-foreground"
          fill="none"
          viewBox="0 0 24 24"
        >
          <circle
            className="opacity-25"
            cx="12"
            cy="12"
            r="10"
            stroke="currentColor"
            strokeWidth="4"
          ></circle>
          <path
            className="opacity-75"
            fill="currentColor"
            d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
          ></path>
        </svg>
      )}
    </div>
  );
}
