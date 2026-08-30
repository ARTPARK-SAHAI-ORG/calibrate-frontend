"use client";

import { useState } from "react";
import { AddToolDialog } from "@/components/AddToolDialog";
import type { ToolData } from "@/components/AddToolDialog";

type ToolVariant = "webhook" | "structured_output";

const VARIANTS: {
  value: ToolVariant;
  title: string;
  description: string;
}[] = [
  {
    value: "webhook",
    title: "Webhook tool",
    description:
      "Lets the agent call an outside service to do something, such as sending a notification or looking a record up.",
  },
  {
    value: "structured_output",
    title: "Structured output tool",
    description:
      "Lets the agent pull set details out of the conversation, such as a caller's name or a delivery date.",
  },
];

/**
 * Writing a new tool, from anywhere a tool can be picked.
 *
 * Two steps: which kind of tool, then that kind's own form. The Tools page
 * skips the first step because it shows both kinds as separate buttons; every
 * other screen has room for one button only, so it asks here instead.
 *
 * `onCreated` receives the tool that was just written, worked out by comparing
 * the list that comes back against the one that went in. The caller decides
 * what to do with it: put it in the test being written, attach it to the
 * agent, or both.
 */
export function CreateToolFlow({
  isOpen,
  onClose,
  accessToken,
  knownTools,
  onCreated,
}: {
  isOpen: boolean;
  onClose: () => void;
  accessToken: string | undefined;
  /** The tools that existed before, used to spot the new one. */
  knownTools: ToolData[];
  onCreated: (tool: ToolData, allTools: ToolData[]) => void;
}) {
  const [variant, setVariant] = useState<ToolVariant | null>(null);

  if (!isOpen) return null;

  const close = () => {
    setVariant(null);
    onClose();
  };

  if (variant) {
    return (
      <AddToolDialog
        isOpen
        onClose={close}
        toolType={variant}
        editingToolUuid={null}
        backendAccessToken={accessToken}
        onToolsUpdated={(allTools) => {
          const before = new Set(knownTools.map((t) => t.uuid));
          const made = allTools.find((t) => !before.has(t.uuid));
          if (made) onCreated(made, allTools);
        }}
      />
    );
  }

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
      <div className="bg-background border border-border rounded-xl md:rounded-2xl w-full max-w-lg shadow-2xl">
        <div className="flex items-start justify-between gap-3 px-5 md:px-6 py-4 border-b border-border">
          <div>
            <h2 className="text-base md:text-lg font-semibold text-foreground">
              Create tool
            </h2>
            <p className="text-sm text-muted-foreground mt-0.5">
              What should this tool do?
            </p>
          </div>
          <button
            type="button"
            onClick={close}
            aria-label="Close"
            className="w-8 h-8 flex items-center justify-center rounded-md text-muted-foreground hover:text-foreground hover:bg-muted transition-colors cursor-pointer flex-shrink-0"
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
        <div className="p-5 md:p-6 space-y-3">
          {VARIANTS.map((v) => (
            <button
              key={v.value}
              type="button"
              onClick={() => setVariant(v.value)}
              className="w-full text-left rounded-xl border border-border bg-background hover:bg-muted/50 transition-colors cursor-pointer p-4"
            >
              <span className="block text-sm font-medium text-foreground">
                {v.title}
              </span>
              <span className="block text-xs text-muted-foreground mt-1">
                {v.description}
              </span>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
