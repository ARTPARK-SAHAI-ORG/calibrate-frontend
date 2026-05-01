import React from "react";

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
