"use client";

import React, { useState } from "react";
import { CheckIcon, CopyIcon } from "@/components/icons";
import { copyToClipboard } from "@/lib/clipboard";

/** Shown in place of a run's results when it failed before producing any. */
export const RUN_FAILED_SENTENCE =
  "The evaluation run failed before it produced any result.";

/**
 * The line above the details on a run that broke: how far it got, and where
 * to look. A run that finished nothing has nothing to point at, so it gets
 * the plain sentence instead.
 */
export function runFailureSentence(
  ran: number,
  total: number,
  tab: React.ReactNode,
): React.ReactNode {
  if (ran === 0) return RUN_FAILED_SENTENCE;
  return (
    <>
      {`The evaluation failed after ${ran} of ${total} ${total === 1 ? "test" : "tests"}. `}
      Review the tests that were run in the {tab}.
    </>
  );
}

/**
 * The red box both run windows show for a run with no results: one fixed
 * sentence, then whatever the backend recorded about the failure, verbatim,
 * with a copy button so it can be pasted into a message to us.
 */
export function RunFailureBox({
  details,
  onTryAgain,
  sentence = RUN_FAILED_SENTENCE,
  className = "max-w-md w-full mx-4",
}: {
  /** What the backend recorded, or null when it recorded nothing. */
  details: string | null;
  onTryAgain?: () => void;
  /** The line under the heading. Defaults to the no-result sentence. */
  sentence?: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={`bg-red-500/10 border border-red-500/30 rounded-lg p-4 md:p-6 ${className}`}
    >
      <div className="flex items-center gap-2 mb-2">
        <svg
          className="w-5 h-5 text-red-500"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          strokeWidth={2}
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M12 9v3.75m9-.75a9 9 0 11-18 0 9 9 0 0118 0zm-9 3.75h.008v.008H12v-.008z"
          />
        </svg>
        <span className="font-medium text-red-500">Something went wrong</span>
      </div>
      <p className="text-sm text-red-400 mb-4">{sentence}</p>
      {details && (
        <RunFailureDetails
          details={details}
          className={onTryAgain ? "mb-4" : ""}
        />
      )}
      {onTryAgain && (
        <button
          onClick={onTryAgain}
          className="w-full h-9 md:h-10 px-4 rounded-md text-sm font-medium bg-foreground text-background hover:opacity-90 transition-opacity cursor-pointer flex items-center justify-center gap-2"
        >
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
              d="M9 15L3 9m0 0l6-6M3 9h12a6 6 0 010 12h-3"
            />
          </svg>
          Try again
        </button>
      )}
    </div>
  );
}

/** What the backend recorded about a failure, verbatim, with a Copy button. */
function RunFailureDetails({
  details,
  className = "",
}: {
  details: string;
  className?: string;
}) {
  const [copied, setCopied] = useState(false);
  const handleCopy = async () => {
    if (!(await copyToClipboard(details))) return;
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };
  return (
    <div className={className}>
      <div className="flex items-center justify-between mb-1">
        <p className="text-xs text-muted-foreground">Details</p>
        <button
          type="button"
          onClick={handleCopy}
          className="inline-flex items-center gap-1 h-7 px-2 rounded-md border border-border bg-background text-xs font-medium text-foreground hover:bg-muted cursor-pointer transition-colors"
        >
          {copied ? (
            <CheckIcon className="w-3.5 h-3.5 text-green-600 dark:text-green-400" />
          ) : (
            <CopyIcon className="w-3.5 h-3.5" />
          )}
          {copied ? "Copied" : "Copy"}
        </button>
      </div>
      <pre className="p-3 rounded-md border border-border bg-background text-xs font-mono whitespace-pre-wrap break-words text-foreground">
        {details}
      </pre>
    </div>
  );
}
