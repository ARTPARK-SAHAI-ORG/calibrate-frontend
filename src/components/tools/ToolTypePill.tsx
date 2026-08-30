"use client";

import React from "react";

/** The two kinds of tool, as they are written for a reader. */
export function toolTypeLabel(configType: unknown): string {
  return configType === "webhook" ? "Webhook" : "Structured Output";
}

const COLORS: Record<string, string> = {
  // A webhook reaches out of the product; structured output stays inside it.
  // Two colours already used for evaluator kinds, so nothing new is invented.
  Webhook: "bg-blue-500/10 text-blue-600 dark:text-blue-400",
  "Structured Output": "bg-teal-500/10 text-teal-600 dark:text-teal-400",
};

/**
 * A tool's kind, in the one shape and colour it has everywhere: the tools
 * list, the agent's own tools, the picker rows and the preview beside them.
 */
export function ToolTypePill({
  configType,
  className = "",
}: {
  /** `tool.config?.type`. Anything that is not "webhook" is structured output. */
  configType: unknown;
  className?: string;
}) {
  const label = toolTypeLabel(configType);
  return (
    <span
      className={`inline-flex items-center whitespace-nowrap px-2 py-0.5 rounded-full text-xs font-medium ${COLORS[label]} ${className}`}
    >
      {label}
    </span>
  );
}
