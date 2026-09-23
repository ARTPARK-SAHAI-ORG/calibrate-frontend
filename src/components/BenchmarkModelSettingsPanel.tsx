"use client";

import React from "react";
import {
  MODEL_HOSTS,
  THINKING_LEVELS,
  type BenchmarkModelSettings,
} from "@/lib/benchmarkModelSettings";

type BenchmarkModelSettingsPanelProps = {
  settings: BenchmarkModelSettings;
  onChange: (settings: BenchmarkModelSettings) => void;
  /** Choosing a host is only offered when the agent routes through OpenRouter,
   *  because it is the only provider that picks between hosts. */
  canChooseHost: boolean;
};

const SELECT_CLASS =
  "w-full h-9 px-3 rounded-md text-sm border border-border bg-background text-foreground focus:outline-none focus:ring-1 focus:ring-accent cursor-pointer";

/**
 * The settings one model is compared under. They are added to the request body
 * Calibrate posts to the agent's own server, beside the model, so the agent has
 * to read them for them to change anything. That is what the note at the bottom
 * says, and it is the honest thing to say: a server that ignores an unknown
 * field answers perfectly well and the setting simply does nothing, which
 * nothing outside that server can detect.
 */
export function BenchmarkModelSettingsPanel({
  settings,
  onChange,
  canChooseHost,
}: BenchmarkModelSettingsPanelProps) {
  return (
    <div className="rounded-lg border border-border bg-muted/30 p-3 space-y-3 md:absolute md:left-full md:top-0 md:ml-9 md:w-80 md:rounded-xl md:border-0 md:bg-background md:p-4 md:shadow-2xl md:z-10">
      <div className="space-y-1.5">
        <label
          htmlFor="benchmark-thinking-level"
          className="block text-xs font-medium text-foreground"
        >
          Thinking level
        </label>
        <select
          id="benchmark-thinking-level"
          value={settings.thinking ?? ""}
          onChange={(e) =>
            onChange({
              ...settings,
              thinking: e.target.value
                ? (e.target.value as BenchmarkModelSettings["thinking"])
                : undefined,
            })
          }
          className={SELECT_CLASS}
        >
          <option value="">Do not set one</option>
          {THINKING_LEVELS.map((level) => (
            <option key={level.value} value={level.value}>
              {level.label}
            </option>
          ))}
        </select>
      </div>

      {canChooseHost && (
        <div className="space-y-1.5">
          <label
            htmlFor="benchmark-model-host"
            className="block text-xs font-medium text-foreground"
          >
            Hosted by
          </label>
          <select
            id="benchmark-model-host"
            value={settings.hostedBy ?? ""}
            onChange={(e) =>
              onChange({
                ...settings,
                hostedBy: e.target.value || undefined,
              })
            }
            className={SELECT_CLASS}
          >
            <option value="">Any host</option>
            {MODEL_HOSTS.map((host) => (
              <option key={host.value} value={host.value}>
                {host.label}
              </option>
            ))}
          </select>
          <p className="text-xs text-muted-foreground">
            Picking one host stops the request being served from another
          </p>
        </div>
      )}

      <p className="text-xs text-muted-foreground border-t border-border pt-2.5">
        These are added to the request sent to your agent. Your agent has to
        read them for them to change anything
      </p>
    </div>
  );
}
