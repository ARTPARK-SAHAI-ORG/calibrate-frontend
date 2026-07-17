"use client";

import React from "react";
import { useHideFloatingButton } from "@/components/AppLayout";
import { VerifyToRunMessage } from "@/components/VerifyToRunMessage";

type VerifyToRunDialogProps = {
  isOpen: boolean;
  agentName: string;
  isVerifying: boolean;
  /** Set after a failed verification attempt. */
  error: string | null;
  sampleResponse: Record<string, unknown> | null;
  /** Trigger a verification attempt. */
  onVerify: () => void;
  /** Take the user to the agent's connection settings (shown after a failure). */
  onGoToConnection: () => void;
  onClose: () => void;
};

/**
 * Gates running a test behind connection verification. When a connection
 * agent isn't verified, a run action opens this dialog instead of running.
 * Verifying successfully lets the host resume the pending run directly; a
 * failure surfaces the error and offers a jump to the connection settings.
 */
export function VerifyToRunDialog({
  isOpen,
  agentName,
  isVerifying,
  error,
  sampleResponse,
  onVerify,
  onGoToConnection,
  onClose,
}: VerifyToRunDialogProps) {
  useHideFloatingButton(isOpen);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div
        className="absolute inset-0 bg-black/50 backdrop-blur-sm"
        onClick={onClose}
      />

      <div className="relative w-full max-w-lg mx-4 bg-background border border-border rounded-2xl shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between px-4 md:px-6 pt-4 md:pt-5 pb-1">
          <h2 className="text-lg md:text-xl font-semibold text-foreground">
            Verify connection to run
          </h2>
          <button
            onClick={onClose}
            className="w-8 h-8 flex items-center justify-center rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted transition-colors cursor-pointer"
            aria-label="Close"
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
                d="M6 18L18 6M6 6l12 12"
              />
            </svg>
          </button>
        </div>

        {/* Content */}
        <div className="px-4 md:px-6 pt-2 pb-2">
          <VerifyToRunMessage
            agentName={agentName}
            error={error}
            sampleResponse={sampleResponse}
          />
        </div>

        {/* Footer */}
        <div className="px-4 md:px-6 py-3 flex items-center justify-end gap-2 md:gap-3">
          <button
            onClick={onClose}
            disabled={isVerifying}
            className="h-9 md:h-10 px-4 md:px-5 rounded-lg text-xs md:text-base font-medium bg-muted text-foreground hover:bg-muted/80 transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
          >
            Cancel
          </button>
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
              <svg
                className="w-4 h-4 animate-spin"
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
        </div>
      </div>
    </div>
  );
}
