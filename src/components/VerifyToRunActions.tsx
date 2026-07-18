"use client";

import React from "react";

type VerifyToRunActionsProps = {
  isVerifying: boolean;
  /** Set after a failed verification attempt. */
  error: string | null;
  /** Trigger a verification attempt. */
  onVerify: () => void;
  /** Take the user to the agent's connection settings (shown after a failure). */
  onGoToConnection: () => void;
};

/**
 * Footer actions for the verify-to-run gate. Two surfaces render the same pair
 * of buttons: the standalone VerifyToRunDialog (agent Tests tab) and the verify
 * mode of RunTestDialog (global /tests page), so they share this component.
 * Cancel is deliberately left out: each host keeps its own, since they sit in
 * different footer layouts with different disabled wiring.
 */
export function VerifyToRunActions({
  isVerifying,
  error,
  onVerify,
  onGoToConnection,
}: VerifyToRunActionsProps) {
  return (
    <>
      {error && (
        <button
          onClick={onGoToConnection}
          className="h-9 md:h-10 px-4 md:px-5 rounded-lg text-xs md:text-base font-medium bg-transparent text-foreground border border-border hover:bg-muted transition-colors cursor-pointer"
        >
          Go to connection settings
        </button>
      )}
      <button
        onClick={onVerify}
        disabled={isVerifying}
        className="h-9 md:h-10 px-4 md:px-5 rounded-lg text-xs md:text-base font-medium bg-foreground text-background hover:opacity-90 transition-opacity cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
      >
        {isVerifying && (
          <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
            <circle
              className="opacity-25"
              cx="12"
              cy="12"
              r="10"
              stroke="currentColor"
              strokeWidth="4"
            />
            <path
              className="opacity-75"
              fill="currentColor"
              d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
            />
          </svg>
        )}
        {isVerifying ? "Verifying..." : error ? "Try again" : "Verify"}
      </button>
    </>
  );
}
