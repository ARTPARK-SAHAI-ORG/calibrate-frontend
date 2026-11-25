"use client";

import React, { useEffect, useRef, useState } from "react";
import { Tooltip } from "@/components/Tooltip";
import { TraceScoringConfirmDialog } from "@/components/traces/TraceScoringConfirmDialog";
import type { TraceScoringControls } from "@/hooks/useAgentTraceScoring";
import { NothingCanScoreMessage } from "@/components/traces/NothingCanScoreMessage";
import {
  MessagesPerDayInfo,
  MessagesPerDayTooHigh,
  overMessagesPerDayMaximum,
} from "@/components/chat/MessagesPerDayParts";

type SettingsTabContentProps = {
  agentSpeaksFirst: boolean;
  setAgentSpeaksFirst: (value: boolean) => void;
  maxAssistantTurns: number;
  setMaxAssistantTurns: (value: number) => void;
  traceScoring: TraceScoringControls;
  /** The agent's own number, or the workspace default when it has none. */
  messagesPerDay: number;
  setMessagesPerDay: (value: number) => void;
  /** The workspace maximum; null means none. */
  messagesPerDayMaximum: number | null;
  /** Opens the Evaluators tab, where the set that can score is chosen. */
  onGoToEvaluators: () => void;
  /** Goes up by one each time the reader is sent here to raise the messages
   *  per day, which brings that box into view and outlines it for a moment. */
  highlightMessagesPerDay?: number;
};

export function SettingsTabContent({
  agentSpeaksFirst,
  setAgentSpeaksFirst,
  maxAssistantTurns,
  setMaxAssistantTurns,
  traceScoring,
  messagesPerDay,
  setMessagesPerDay,
  messagesPerDayMaximum,
  onGoToEvaluators,
  highlightMessagesPerDay = 0,
}: SettingsTabContentProps) {
  const messagesPerDayRef = useRef<HTMLInputElement>(null);
  // The outline is on from a new request until its three seconds are up.
  const [outlineEndedFor, setOutlineEndedFor] = useState(0);
  const messagesPerDayOutlined = highlightMessagesPerDay > outlineEndedFor;
  useEffect(() => {
    if (!highlightMessagesPerDay) return;
    const input = messagesPerDayRef.current;
    input?.scrollIntoView?.({ block: "center", behavior: "smooth" });
    input?.focus({ preventScroll: true });
    const timer = window.setTimeout(
      () => setOutlineEndedFor(highlightMessagesPerDay),
      3000,
    );
    return () => window.clearTimeout(timer);
  }, [highlightMessagesPerDay]);
  const messagesTooHigh = overMessagesPerDayMaximum(
    messagesPerDay,
    messagesPerDayMaximum,
  );
  // What the switch is asking to do, while the confirmation is on screen.
  const [pendingScoring, setPendingScoring] = useState<boolean | null>(null);
  const scoringDisabled = traceScoring.saving || traceScoring.cannotEnable;
  // Not clickable when nothing can score, but drawn as usual: dimming it makes
  // it hard to see that it is a switch at all. The reason rides on the control,
  // where the tooltip stays open long enough to click through to Evaluators.
  const blockedReason = traceScoring.enableBlocked ? (
    <span>
      <NothingCanScoreMessage
        ineligible={traceScoring.eligibility?.ineligible ?? []}
        onGoToEvaluators={onGoToEvaluators}
      />
    </span>
  ) : null;
  const scoringSwitch = (
    <button
      type="button"
      role="switch"
      aria-checked={traceScoring.enabled}
      aria-label="Enable continuous monitoring"
      disabled={scoringDisabled}
      onClick={() => setPendingScoring(!traceScoring.enabled)}
      className={`relative w-11 md:w-12 h-6 md:h-7 rounded-full transition-colors cursor-pointer disabled:cursor-not-allowed border-2 flex-shrink-0 ${
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
  );

  return (
    <div className="space-y-4 md:space-y-6">
      <TraceScoringConfirmDialog
        pending={pendingScoring}
        onClose={() => setPendingScoring(null)}
        onConfirm={(next) => void traceScoring.setEnabled(next)}
      />
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

      <div className="space-y-3 md:space-y-4">
        <h2 className="text-sm md:text-base font-semibold text-foreground">
          Monitoring
        </h2>
        <div className="border border-border rounded-xl overflow-hidden">
          <div className="px-3 md:px-4 py-3 md:py-4 flex items-start md:items-center justify-between gap-3">
            <div className="flex flex-col-reverse md:flex-row items-start md:items-center gap-2 md:gap-4">
              {blockedReason ? (
                <Tooltip content={blockedReason} position="top">
                  {scoringSwitch}
                </Tooltip>
              ) : (
                scoringSwitch
              )}
              <div>
                <h3 className="text-sm md:text-base font-medium text-foreground">
                  Enable continuous monitoring
                </h3>
                {/* A div, not a p: the hover text wraps its trigger in a div,
                    which a paragraph cannot hold. */}
                <div className="text-xs md:text-sm text-muted-foreground mt-0.5">
                  New traces for this agent are scored using the{" "}
                  <Tooltip
                    content="Evaluators that fit this agent, have a prompt, and use no variables"
                    position="top"
                    className="inline"
                  >
                    <span className="text-foreground font-medium decoration-dotted decoration-muted-foreground underline underline-offset-2 cursor-pointer">
                      valid evaluators
                    </span>
                  </Tooltip>{" "}
                  added in the{" "}
                  <button
                    type="button"
                    onClick={onGoToEvaluators}
                    className="font-medium text-foreground hover:opacity-80 cursor-pointer"
                  >
                    Evaluators tab
                  </button>
                </div>
                {traceScoring.saveError || traceScoring.eligibilityError ? (
                  <p className="text-xs md:text-sm text-red-600 dark:text-red-400 mt-1">
                    {traceScoring.saveError ?? traceScoring.eligibilityError}
                  </p>
                ) : null}
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="space-y-3 md:space-y-4">
        <h2 className="text-sm md:text-base font-semibold text-foreground">
          Talk to agent
        </h2>
        <div
          data-testid="messages-per-day-box"
          className={`border rounded-xl overflow-hidden transition-colors duration-500 ${
            messagesPerDayOutlined
              ? "border-amber-500 bg-amber-500/10 ring-2 ring-amber-500/40"
              : "border-border"
          }`}
        >
          <div className="px-3 md:px-4 py-3 md:py-4 space-y-2">
            <div className="flex flex-col-reverse md:flex-row items-start md:items-center gap-2 md:gap-4">
              <input
                ref={messagesPerDayRef}
                type="number"
                min="1"
                aria-label="Messages per day"
                value={messagesPerDay}
                onChange={(e) => {
                  const num = parseInt(e.target.value, 10);
                  // Below 1 is kept so the Save can refuse it and say why.
                  if (!isNaN(num)) {
                    setMessagesPerDay(num);
                  }
                }}
                className={`w-16 md:w-20 h-9 md:h-10 px-2 md:px-3 text-center rounded-lg border bg-background text-sm md:text-base text-foreground focus:outline-none focus:ring-2 focus:ring-primary/50 ${
                  messagesTooHigh ? "border-red-500/60" : "border-border"
                }`}
              />
              <div>
                <div className="flex items-center gap-1.5">
                  <h3 className="text-sm md:text-base font-medium text-foreground">
                    Messages per day
                  </h3>
                  <MessagesPerDayInfo maximum={messagesPerDayMaximum} />
                </div>
                <p className="text-xs md:text-sm text-muted-foreground mt-0.5">
                  Limit on the number of messages allowed per day when talking
                  to this agent on Calibrate
                </p>
              </div>
            </div>
            {messagesTooHigh && <MessagesPerDayTooHigh />}
          </div>
        </div>
      </div>
    </div>
  );
}
