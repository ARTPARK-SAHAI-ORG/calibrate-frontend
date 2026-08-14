"use client";

import React from "react";

// Strings and comments are the only things worth colouring here: they are what
// tell a reader "this is a value you replace" versus "this is an explanation".
// A full highlighter would be a dependency for four fixed snippets.
const TOKENS = /("(?:[^"\\]|\\.)*")|((?:#|\/\/)[^\n]*)/g;

/** Colour the strings and comments in a snippet, leave the rest alone. */
export function highlight(code: string): React.ReactNode[] {
  const out: React.ReactNode[] = [];
  let last = 0;
  let match: RegExpExecArray | null;
  TOKENS.lastIndex = 0;
  while ((match = TOKENS.exec(code)) !== null) {
    if (match.index > last) out.push(code.slice(last, match.index));
    const [text, str, comment] = match;
    out.push(
      <span
        key={match.index}
        className={
          str
            ? "text-emerald-700 dark:text-emerald-400"
            : "text-muted-foreground italic"
        }
      >
        {str ?? comment ?? text}
      </span>,
    );
    last = match.index + text.length;
  }
  if (last < code.length) out.push(code.slice(last));
  return out;
}

/** A read-only snippet with its strings and comments coloured. */
export function CodeBlock({
  code,
  className = "",
}: {
  code: string;
  className?: string;
}) {
  return (
    <pre
      className={`w-full text-left font-mono text-xs leading-relaxed text-foreground bg-muted/50 border border-border rounded-lg p-4 overflow-x-auto ${className}`}
    >
      <code>{highlight(code)}</code>
    </pre>
  );
}
