"use client";

import React from "react";

type VerifyToRunMessageProps = {
  agentName: string;
  /** Set after a failed verification attempt; switches the panel to the error state. */
  error: string | null;
  /** The agent's raw response echoed back by the backend, shown to aid debugging. */
  sampleResponse: Record<string, unknown> | null;
};

/**
 * Shared body for the "verify before you can run" gate. Rendered inside the
 * standalone VerifyToRunDialog (agent Tests tab) and inline in RunTestDialog
 * (global /tests page), so both surfaces read identically. Buttons live in the
 * host container's footer, not here.
 */
export function VerifyToRunMessage({
  agentName,
  error,
  sampleResponse,
}: VerifyToRunMessageProps) {
  if (!error) {
    return (
      <div className="bg-yellow-500/10 border border-yellow-500/30 rounded-xl px-3 md:px-4 py-2.5 md:py-3 flex gap-2 md:gap-3">
        <svg
          className="w-4 h-4 md:w-5 md:h-5 text-yellow-500 flex-shrink-0 mt-0.5"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          strokeWidth={2}
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z"
          />
        </svg>
        <p className="text-foreground text-xs md:text-sm leading-relaxed">
          &quot;{agentName}&quot; is not verified yet. Verify the connection
          before running tests against it.
        </p>
      </div>
    );
  }

  return (
    <div className="bg-red-500/10 border border-red-500/30 rounded-xl px-3 md:px-4 py-2.5 md:py-3 space-y-2">
      <p className="text-xs md:text-sm font-medium text-red-600 dark:text-red-400">
        Verification failed
      </p>
      <p className="text-xs md:text-sm text-foreground leading-relaxed break-words">
        {error}
      </p>
      {sampleResponse && (
        <pre className="text-[11px] md:text-xs bg-background/60 border border-border rounded-lg p-2 md:p-3 overflow-x-auto text-muted-foreground">
          {JSON.stringify(sampleResponse, null, 2)}
        </pre>
      )}
    </div>
  );
}
