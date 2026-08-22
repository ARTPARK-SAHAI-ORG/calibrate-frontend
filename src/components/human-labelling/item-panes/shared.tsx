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

/**
 * Bordered box around one value, no outer card around the heading — the
 * shared building block for the non-conversational input/output panes
 * (`LlmGeneralItemPane` and the trace dialog's general-agent view). Both
 * show the same shape of data (one input, one output), so they share this
 * instead of each drawing their own card.
 */
export function ValueBox({ children }: { children: React.ReactNode }) {
  return (
    <div className="px-3 py-2 rounded-lg text-sm bg-background border border-border text-foreground whitespace-pre-wrap break-words">
      {children}
    </div>
  );
}

/** Heading + `ValueBox` together, for the common case of one plain value
 * under one heading (as opposed to an output that can also hold tool-call
 * cards, which box themselves and sit outside `ValueBox`). */
export function LabelledValue({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-2">
      <h3 className="text-sm font-semibold">{label}</h3>
      <ValueBox>{children}</ValueBox>
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
