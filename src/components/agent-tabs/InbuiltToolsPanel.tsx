"use client";

import React from "react";
import { INBUILT_TOOLS, getInbuiltToolIcon } from "@/constants/inbuilt-tools";
import { Switch } from "@/components/ui";

type InbuiltToolsPanelProps = {
  endConversationEnabled: boolean;
  setEndConversationEnabled: (value: boolean) => void;
};

export function InbuiltToolsPanel({
  endConversationEnabled,
  setEndConversationEnabled,
}: InbuiltToolsPanelProps) {
  return (
    <div className="space-y-3 md:space-y-4 order-1 lg:order-2">
      <div>
        <h3 className="text-sm md:text-base font-medium text-foreground">
          In-built tools
        </h3>
        <p className="text-sm md:text-base text-muted-foreground mt-0.5">
          Allow the agent to perform built-in actions.
        </p>
      </div>

      <div className="border border-border rounded-xl overflow-hidden">
        {/* Active tools counter */}
        <div className="px-3 md:px-4 py-2 md:py-3 bg-muted/30 border-b border-border">
          <span className="text-sm md:text-base text-foreground">
            {endConversationEnabled ? "1 active tool" : "0 active tools"}
          </span>
        </div>

        {/* In-built tools list */}
        {INBUILT_TOOLS.map((tool) => (
          <div
            key={tool.id}
            className="px-3 md:px-4 py-2 md:py-3 flex items-center justify-between border-b border-border last:border-b-0"
          >
            <div className="flex items-center gap-2 md:gap-3">
              <svg
                className="w-4 md:w-5 h-4 md:h-5 text-muted-foreground"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth={1.5}
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d={getInbuiltToolIcon(tool.icon)}
                />
              </svg>
              <span className="text-sm md:text-base font-medium text-foreground">
                {tool.name}
              </span>
            </div>
            <div hidden>
              <Switch
                checked={tool.id === "end_call" && endConversationEnabled}
                onChange={(next) => {
                  if (tool.id === "end_call") setEndConversationEnabled(next);
                }}
                label={tool.name}
              />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
