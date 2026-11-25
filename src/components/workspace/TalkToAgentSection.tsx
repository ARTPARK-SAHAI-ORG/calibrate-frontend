"use client";

import { useState } from "react";
import { toast } from "sonner";
import { useAccessToken, useOrgLimits, useOrganizations } from "@/hooks";
import { parseBackendErrorMessage } from "@/lib/parseBackendError";
import { workspaceDefaultMessagesPerDay, type Organization } from "@/lib/orgs";
import {
  MessagesPerDayInfo,
  MessagesPerDayTooHigh,
  overMessagesPerDayMaximum,
} from "@/components/chat/MessagesPerDayParts";

/**
 * The messages a day an agent's chat link answers, for every agent in the
 * workspace that has no number of its own. Saves when the box loses focus or
 * Enter is pressed, and puts the saved number back when the save fails.
 */
export function TalkToAgentSection({ org }: { org: Organization }) {
  const accessToken = useAccessToken();
  const { updateOrganization } = useOrganizations(accessToken);
  const maximum = useOrgLimits().max_chat_replies_per_day;
  // Held here rather than read off `org`, for the reason RunModelsSection
  // gives: the workspace behind this page catches up only once read again.
  const [saved, setSaved] = useState(workspaceDefaultMessagesPerDay(org));
  const [input, setInput] = useState(String(saved));
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const value = Number(input);
  const tooHigh = overMessagesPerDayMaximum(value, maximum);

  const save = async () => {
    if (!Number.isInteger(value) || value < 1) {
      // Nothing to save: show the saved number again.
      setInput(String(saved));
      return;
    }
    if (tooHigh) return;
    if (value === saved || isSaving) return;
    setError(null);
    setIsSaving(true);
    try {
      await updateOrganization(org.uuid, {
        settings: { talk_to_agent: { default_messages_per_day: value } },
      });
      setSaved(value);
      toast.success("Saved the default messages per day");
    } catch (err) {
      setInput(String(saved));
      setError(
        parseBackendErrorMessage(
          err,
          "Failed to save the default messages per day",
        ),
      );
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <section className="space-y-3">
      <div>
        <div className="flex items-center gap-1.5">
          <h2 className="text-base md:text-lg font-semibold text-foreground">
            Talk to agent
          </h2>
          <MessagesPerDayInfo maximum={maximum} />
        </div>
        <p className="text-sm text-muted-foreground">
          Default limit on the number of messages allowed per day when talking
          to an agent on Calibrate. Every new agent starts with this limit, and
          it can be changed for each agent from its own Settings tab.
        </p>
        {error && <p className="text-[13px] text-red-500 mt-1">{error}</p>}
      </div>
      <div className="space-y-1">
        <div className="flex items-center gap-3">
          <input
            type="number"
            min="1"
            aria-label="Default messages per day"
            value={input}
            disabled={isSaving}
            onChange={(e) => setInput(e.target.value)}
            onBlur={() => void save()}
            onKeyDown={(e) => {
              if (e.key === "Enter") void save();
            }}
            className={`w-16 md:w-20 h-9 md:h-10 px-2 md:px-3 text-center rounded-lg border bg-background text-sm md:text-base text-foreground focus:outline-none focus:ring-2 focus:ring-primary/50 disabled:opacity-50 disabled:cursor-not-allowed ${
              tooHigh ? "border-red-500/60" : "border-border"
            }`}
          />
          <span className="text-sm text-muted-foreground">
            messages per day
          </span>
        </div>
        {tooHigh && <MessagesPerDayTooHigh />}
      </div>
    </section>
  );
}
