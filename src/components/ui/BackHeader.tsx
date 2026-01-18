"use client";

import React from "react";

type BackHeaderProps = {
  /** The text to display next to the back button */
  label: string;
  /** Callback when back button is clicked */
  onBack: () => void;
  /** Optional title for the back button tooltip */
  title?: string;
};

/**
 * A header component with a back button and label.
 * Designed to be used as the `customHeader` prop of AppLayout.
 */
export function BackHeader({ label, onBack, title }: BackHeaderProps) {
  return (
    <div className="flex items-center gap-3">
      <button
        onClick={onBack}
        className="flex items-center justify-center w-8 h-8 rounded-md hover:bg-muted transition-colors cursor-pointer"
        title={title}
      >
        <svg
          className="w-5 h-5"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          strokeWidth={2}
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M15.75 19.5L8.25 12l7.5-7.5"
          />
        </svg>
      </button>
      <span className="text-base font-semibold text-foreground">{label}</span>
    </div>
  );
}
