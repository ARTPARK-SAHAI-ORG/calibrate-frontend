import React from "react";
import type { TestCaseHistory } from "@/components/test-results/shared";

export function Section({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="border border-border rounded-xl p-4 space-y-2">
      <div>
        <h3 className="text-sm font-semibold">{title}</h3>
        {subtitle && (
          <p className="text-xs text-muted-foreground">{subtitle}</p>
        )}
      </div>
      <div>{children}</div>
    </div>
  );
}

export function ChatMessage({
  role,
  content,
}: {
  role: string;
  content: string;
}) {
  const isAssistant = role === "assistant" || role === "agent";
  return (
    <div className="space-y-1">
      <div
        className={`text-[10px] uppercase tracking-wide ${
          isAssistant
            ? "text-blue-600 dark:text-blue-400"
            : "text-muted-foreground"
        }`}
      >
        {isAssistant ? "Agent" : role === "tool" ? "Tool" : "User"}
      </div>
      <p className="text-sm whitespace-pre-wrap break-words">
        {content || "—"}
      </p>
    </div>
  );
}

/** Turns one saved conversation turn into the shape `TestDetailView` draws.
 * Returns null for anything it cannot read, so a malformed turn is dropped
 * rather than breaking the pane. Shared by the panes that render a
 * conversation from `payload.chat_history`. */
export function normaliseHistoryItem(raw: unknown): TestCaseHistory | null {
  if (!raw || typeof raw !== "object") return null;
  const obj = raw as Record<string, unknown>;
  const role = obj.role;
  const content = typeof obj.content === "string" ? obj.content : undefined;
  const toolCalls = obj.tool_calls;
  const toolCallId =
    typeof obj.tool_call_id === "string" ? obj.tool_call_id : undefined;
  const createdAt =
    typeof obj.created_at === "string" ? obj.created_at : undefined;
  const tsField = createdAt ? { created_at: createdAt } : {};
  if (role === "assistant") {
    if (Array.isArray(toolCalls) && toolCalls.length > 0) {
      return {
        role: "assistant",
        ...(content != null ? { content } : {}),
        tool_calls: toolCalls as TestCaseHistory["tool_calls"],
        ...tsField,
      };
    }
    if (content != null) return { role: "assistant", content, ...tsField };
    return null;
  }
  if (role === "user" && content != null) {
    return { role: "user", content, ...tsField };
  }
  if (role === "tool" && content != null) {
    return {
      role: "tool",
      content,
      ...(toolCallId ? { tool_call_id: toolCallId } : {}),
      ...tsField,
    };
  }
  return null;
}
