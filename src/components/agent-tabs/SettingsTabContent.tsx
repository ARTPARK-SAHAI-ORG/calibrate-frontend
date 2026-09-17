"use client";

import React from "react";
import type { TraceScoringControls } from "@/hooks/useAgentTraceScoring";

type SettingsTabContentProps = {
  agentSpeaksFirst: boolean;
  setAgentSpeaksFirst: (value: boolean) => void;
  maxAssistantTurns: number;
  setMaxAssistantTurns: (value: number) => void;
  traceScoring: TraceScoringControls;
};

export function SettingsTabContent({
  agentSpeaksFirst,
  setAgentSpeaksFirst,
  maxAssistantTurns,
  setMaxAssistantTurns,
  traceScoring,
}: SettingsTabContentProps) {
  const scoringDisabled =
    traceScoring.saving ||
    (!traceScoring.enabled &&
      (traceScoring.eligibility === null || traceScoring.enableBlocked));
  return (
    <div className="space-y-4 md:space-y-6">
      <div className="border border-border rounded-xl overflow-hidden">
        <div className="px-3 md:px-4 py-3 md:py-4 flex items-start md:items-center justify-between gap-3">
          <div className="flex flex-col-reverse md:flex-row items-start md:items-center gap-2 md:gap-4">
            {/* Toggle Switch */}
            <button
              onClick={() => setAgentSpeaksFirst(!agentSpeaksFirst)}
              className={`relative w-11 md:w-12 h-6 md:h-7 rounded-full transition-colors cursor-pointer border-2 flex-shrink-0 ${
                agentSpeaksFirst
                  ? "bg-green-500 border-green-500"
                  : "bg-muted border-muted-foreground/30"
              }`}
            >
              <div
                className={`absolute top-0.5 w-4 md:w-5 h-4 md:h-5 rounded-full bg-white shadow-md transition-transform ${
                  agentSpeaksFirst ? "translate-x-5" : "translate-x-0.5"
                }`}
              />
            </button>
            <div>
              <h3 className="text-sm md:text-base font-medium text-foreground">
                Agent speaks first
              </h3>
              <p className="text-xs md:text-sm text-muted-foreground mt-0.5">
                Whether the agent should initiate the conversation.
              </p>
            </div>
          </div>
        </div>
      </div>

      <div className="border border-border rounded-xl overflow-hidden">
        <div className="px-3 md:px-4 py-3 md:py-4 flex items-start md:items-center justify-between gap-3">
          <div className="flex flex-col-reverse md:flex-row items-start md:items-center gap-2 md:gap-4">
            <input
              type="number"
              min="1"
              value={maxAssistantTurns}
              onChange={(e) => {
                const value = e.target.value;
                const num = parseInt(value, 10);
                if (!isNaN(num) && num >= 1) {
                  setMaxAssistantTurns(num);
                }
              }}
              className="w-16 md:w-20 h-9 md:h-10 px-2 md:px-3 text-center rounded-lg border border-border bg-background text-sm md:text-base text-foreground focus:outline-none focus:ring-2 focus:ring-primary/50"
            />
            <div>
              <h3 className="text-sm md:text-base font-medium text-foreground">
                Max assistant turns
              </h3>
              <p className="text-xs md:text-sm text-muted-foreground mt-0.5">
                Maximum number of assistant turns before ending the call.
              </p>
            </div>
          </div>
        </div>
      </div>

      <div className="border border-border rounded-xl overflow-hidden">
        <div className="px-3 md:px-4 py-3 md:py-4 flex items-start md:items-center justify-between gap-3">
          <div className="flex flex-col-reverse md:flex-row items-start md:items-center gap-2 md:gap-4">
            <button
              type="button"
              role="switch"
              aria-checked={traceScoring.enabled}
              aria-label="Score new traces automatically"
              disabled={scoringDisabled}
              onClick={() => void traceScoring.setEnabled(!traceScoring.enabled)}
              className={`relative w-11 md:w-12 h-6 md:h-7 rounded-full transition-colors cursor-pointer disabled:cursor-not-allowed disabled:opacity-50 border-2 flex-shrink-0 ${
                traceScoring.enabled
                  ? "bg-green-500 border-green-500"
                  : "bg-muted border-muted-foreground/30"
              }`}
            >
              <div
                className={`absolute top-0.5 w-4 md:w-5 h-4 md:h-5 rounded-full bg-white shadow-md transition-transform ${
                  traceScoring.enabled ? "translate-x-5" : "translate-x-0.5"
                }`}
              />
            </button>
            <div>
              <h3 className="text-sm md:text-base font-medium text-foreground">
                Score new traces automatically
              </h3>
              <p className="text-xs md:text-sm text-muted-foreground mt-0.5">
                New traces this agent receives are scored with its evaluators.
              </p>
              {traceScoring.saveError ? (
                <p className="text-xs md:text-sm text-red-600 dark:text-red-400 mt-1">
                  {traceScoring.saveError}
                </p>
              ) : traceScoring.enableBlocked ? (
                <p className="text-xs md:text-sm text-muted-foreground mt-1">
                  Scoring cannot be turned on because none of this agent&apos;s
                  evaluators can score traces.
                </p>
              ) : null}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
