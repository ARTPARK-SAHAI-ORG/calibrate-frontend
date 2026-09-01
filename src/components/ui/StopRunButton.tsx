"use client";

import { useState } from "react";
import { SpinnerIcon } from "@/components/icons";
import { ConfirmDialog } from "./ConfirmDialog";

type StopRunButtonProps = {
  /** Stops the run. The button stays disabled until this settles. */
  onStop: () => void | Promise<unknown>;
  /** What the run is called where it is being stopped, for the question. */
  noun?: string;
  className?: string;
};

/**
 * "Stop" control for a run that is still going: a test run, a model
 * comparison, or a simulation run. One component so all three look and behave
 * the same, and so a second click cannot send a second stop.
 *
 * A stopped run cannot be started again from where it left off, so the button
 * asks first. `onStop` reports its own failures; this button owns the question
 * and the in-flight state.
 */
export function StopRunButton({
  onStop,
  noun = "run",
  className,
}: StopRunButtonProps) {
  const [isStopping, setIsStopping] = useState(false);
  const [isAsking, setIsAsking] = useState(false);

  const stop = async () => {
    setIsAsking(false);
    if (isStopping) return;
    setIsStopping(true);
    try {
      await onStop();
    } finally {
      setIsStopping(false);
    }
  };

  return (
    <>
      <button
        type="button"
        onClick={() => setIsAsking(true)}
        disabled={isStopping}
        aria-busy={isStopping}
        className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-md text-xs font-medium border border-red-500/50 text-red-500 hover:bg-red-500/10 transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed ${
          className ?? ""
        }`}
      >
        {isStopping ? (
          <SpinnerIcon className="w-3 h-3 animate-spin" />
        ) : (
          <svg
            className="w-3 h-3"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={2}
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M5.25 7.5A2.25 2.25 0 017.5 5.25h9a2.25 2.25 0 012.25 2.25v9a2.25 2.25 0 01-2.25 2.25h-9a2.25 2.25 0 01-2.25-2.25v-9z"
            />
          </svg>
        )}
        {isStopping ? "Stopping..." : "Stop"}
      </button>

      <ConfirmDialog
        isOpen={isAsking}
        title={`Stop this ${noun}?`}
        message={`The results collected so far are kept. The ${noun} cannot be picked up again from where it stopped.`}
        confirmText="Stop"
        onClose={() => setIsAsking(false)}
        onConfirm={stop}
      />
    </>
  );
}
