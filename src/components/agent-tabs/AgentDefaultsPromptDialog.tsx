"use client";

import React from "react";

export type AgentDefaultsPromptEvaluator = {
  uuid: string;
  name: string;
};

type AgentDefaultsPromptDialogProps = {
  evaluators: AgentDefaultsPromptEvaluator[];
  isSaving: boolean;
  error: string | null;
  onDismiss: () => void;
  onConfirm: () => void;
};

export function AgentDefaultsPromptDialog({
  evaluators,
  isSaving,
  error,
  onDismiss,
  onConfirm,
}: AgentDefaultsPromptDialogProps) {
  const isOne = evaluators.length === 1;
  const subject = isOne ? "evaluator" : "evaluators";
  const verb = isOne ? "is not" : "are not";
  const pronoun = isOne ? "it" : "them";

  return (
    <div
      className="fixed inset-0 z-[70] flex items-center justify-center bg-black/50 backdrop-blur-sm p-4"
      onClick={onDismiss}
    >
      <div
        className="bg-background border border-border rounded-xl p-6 md:p-8 max-w-lg w-full shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-3 mb-1">
          <h2 className="text-lg md:text-xl font-semibold tracking-tight">
            Update default evaluators?
          </h2>
          <button
            type="button"
            onClick={onDismiss}
            disabled={isSaving}
            className="flex items-center justify-center w-8 h-8 rounded-md hover:bg-muted transition-colors cursor-pointer flex-shrink-0 disabled:opacity-50 disabled:cursor-not-allowed"
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
        <p className="text-sm md:text-[15px] text-muted-foreground mb-4">
          The following {subject} {verb} in this agent&apos;s default list yet.
          Update the list to include {pronoun} in new tests, otherwise you will
          need to add {pronoun} manually every time you create a test.
        </p>
        <ul className="mb-4 space-y-1.5 max-h-48 overflow-y-auto">
          {evaluators.map((ev) => (
            <li
              key={ev.uuid}
              className="flex items-center gap-2 text-sm text-foreground"
            >
              <span className="w-1.5 h-1.5 rounded-full bg-muted-foreground flex-shrink-0" />
              {ev.name}
            </li>
          ))}
        </ul>
        {error && (
          <div
            role="alert"
            className="mb-4 rounded-lg border border-red-500/40 bg-red-500/5 px-3 py-2.5"
          >
            <p className="text-sm font-medium text-red-600 dark:text-red-400">
              Could not update default evaluators
            </p>
            <p className="text-sm text-red-600/90 dark:text-red-400/90 mt-1">
              {error}
            </p>
            <p className="text-xs text-muted-foreground mt-2">
              Your test was saved. Try again below, or choose Not now to skip.
            </p>
          </div>
        )}
        <div className="flex items-center justify-end gap-3">
          <button
            onClick={onDismiss}
            disabled={isSaving}
            className="h-9 md:h-10 px-4 rounded-md text-sm md:text-base font-medium border border-border bg-background dark:bg-muted hover:bg-muted/50 dark:hover:bg-accent transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
          >
            Not now
          </button>
          <button
            onClick={onConfirm}
            disabled={isSaving}
            className="h-9 md:h-10 px-4 rounded-md text-sm md:text-base font-medium bg-foreground text-background hover:opacity-90 transition-opacity cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
          >
            {isSaving ? "Updating..." : error ? "Try again" : "Update"}
          </button>
        </div>
      </div>
    </div>
  );
}
