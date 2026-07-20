"use client";

import React from "react";
import { useHideFloatingButton } from "@/components/AppLayout";
import { SpinnerIcon } from "@/components/icons";
import { useVerifyConnection } from "@/hooks/useVerifyConnection";

type VerifyConnectionDialogProps = {
  isOpen: boolean;
  onClose: () => void;
  agentUuid: string;
  agentName: string;
  /** Called after the endpoint check passes. The parent closes this dialog and
   *  starts the run it was holding. */
  onVerified: () => void;
  /** Called when the user chooses to fix the connection. The parent takes them
   *  to the agent's Connection settings (switch tab in place, or navigate). */
  onGoToConnectionSettings: () => void;
};

// Shown when a Run is clicked on a connection agent whose endpoint has not been
// checked yet. It explains why the run cannot start, checks the endpoint on the
// user's click, and on success hands control back so the run can begin. On
// failure it surfaces the error and the agent's own response, with a jump to
// the Connection settings so the user can fix it.
export function VerifyConnectionDialog({
  isOpen,
  onClose,
  agentUuid,
  agentName,
  onVerified,
  onGoToConnectionSettings,
}: VerifyConnectionDialogProps) {
  useHideFloatingButton(isOpen);

  const verify = useVerifyConnection();
  const hasFailed = verify.verifyError !== null;

  if (!isOpen) return null;

  const runCheck = async () => {
    const ok = await verify.verifySavedAgent(agentUuid);
    if (ok) onVerified();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/50 backdrop-blur-sm"
        onClick={onClose}
      />

      {/* Dialog */}
      <div className="relative w-full max-w-lg mx-4 bg-background border border-border rounded-2xl shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between px-4 md:px-6 pt-4 md:pt-5 pb-1">
          <h2 className="text-lg md:text-xl font-semibold text-foreground">
            Verify connection
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
        <div className="px-4 md:px-6 pb-2 space-y-3 md:space-y-4">
          <p className="text-muted-foreground text-xs md:text-sm leading-relaxed">
            Before running tests, we need to check that we can reach{" "}
            <span className="font-medium text-foreground">{agentName}</span>. This
            sends one message to the agent&apos;s endpoint. Once it responds, your
            tests start automatically.
          </p>

          {/* Failure: error + the agent's own response */}
          {hasFailed && (
            <div className="rounded-xl border border-red-500/40 bg-red-500/10 px-3 md:px-4 py-2.5 md:py-3 space-y-2">
              <p className="text-xs md:text-sm font-medium text-red-700 dark:text-red-400">
                Could not reach the agent
              </p>
              <p className="text-xs md:text-sm text-red-700/90 dark:text-red-300 break-words">
                {verify.verifyError}
              </p>
              {verify.verifySampleResponse && (
                <div className="space-y-1">
                  <p className="text-xs text-muted-foreground">
                    Your agent responded with:
                  </p>
                  <pre className="text-xs bg-background/60 border border-border rounded-lg p-2 overflow-x-auto max-h-40 text-foreground">
                    {JSON.stringify(verify.verifySampleResponse, null, 2)}
                  </pre>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-4 md:px-6 py-3 flex flex-wrap items-center justify-end gap-2 md:gap-3">
          {hasFailed && (
            <button
              onClick={onGoToConnectionSettings}
              className="h-9 md:h-10 px-4 md:px-5 rounded-lg text-xs md:text-base font-medium bg-muted text-foreground hover:bg-muted/80 transition-colors cursor-pointer mr-auto"
            >
              Connection settings
            </button>
          )}
          <button
            onClick={onClose}
            className="h-9 md:h-10 px-4 md:px-5 rounded-lg text-xs md:text-base font-medium bg-muted text-foreground hover:bg-muted/80 transition-colors cursor-pointer"
          >
            Cancel
          </button>
          <button
            onClick={runCheck}
            disabled={verify.isVerifying}
            className="h-9 md:h-10 px-4 md:px-5 rounded-lg text-xs md:text-base font-medium bg-transparent text-foreground border border-border hover:bg-muted transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
          >
            {verify.isVerifying && (
              <SpinnerIcon className="w-4 h-4 animate-spin" />
            )}
            {verify.isVerifying
              ? "Verifying…"
              : hasFailed
                ? "Try again"
                : "Verify"}
          </button>
        </div>
      </div>
    </div>
  );
}
