"use client";

import React, { useState } from "react";
import { getBackendUrl } from "@/lib/api";
import { copyToClipboard } from "@/lib/clipboard";
import { SNIPPET_LANGUAGES, type SnippetLanguage } from "./ingestSnippets";

export function snippetBackendUrl(): string {
  try {
    return getBackendUrl();
  } catch {
    // Missing env var only happens in misconfigured dev; keep the placeholder.
    return "https://<backend>";
  }
}

// Strings and comments are the only things worth colouring in the snippet:
// they are what tell a reader "this is a value you replace" versus "this is an
// explanation". A full highlighter would be a dependency for three snippets.
// A comment marker only counts at the start of a line or after a space, so the
// "//" in an address like https://host/traces stays ordinary code.
const TOKENS = /("(?:[^"\\]|\\.)*")|((?:^|\s)(?:#|\/\/)[^\n]*)/gm;

function highlight(code: string): React.ReactNode[] {
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

/** Language tabs, a Copy button and the code below them. */
export function CodeTabsBox({
  code,
  language,
  onLanguageChange,
  renderLine,
  testId,
}: {
  code: string;
  language: SnippetLanguage;
  onLanguageChange: (language: SnippetLanguage) => void;
  /** Draws each line, newline included; without it strings and comments are coloured. */
  renderLine?: (line: string, index: number) => React.ReactNode;
  testId?: string;
}) {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    if (!(await copyToClipboard(code))) return;
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="border border-border rounded-lg overflow-hidden bg-muted/40">
      <div className="flex items-center justify-between gap-2 p-1 border-b border-border">
        <div className="flex items-center gap-0.5 overflow-x-auto">
          {SNIPPET_LANGUAGES.map((option) => (
            <button
              key={option.id}
              type="button"
              onClick={() => onLanguageChange(option.id)}
              className={`h-7 px-2.5 rounded-md text-xs font-medium transition-colors cursor-pointer whitespace-nowrap ${
                language === option.id
                  ? "bg-background text-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              {option.label}
            </button>
          ))}
        </div>
        <button
          type="button"
          onClick={handleCopy}
          className={`flex-shrink-0 h-7 px-2 rounded-md text-xs font-medium transition-colors cursor-pointer ${
            copied
              ? "bg-emerald-500/15 text-emerald-700 dark:text-emerald-400"
              : "text-muted-foreground hover:text-foreground hover:bg-muted"
          }`}
        >
          {copied ? "Copied" : "Copy"}
        </button>
      </div>
      <pre
        data-testid={testId}
        className="w-full text-left font-mono text-xs leading-relaxed text-foreground p-4 overflow-x-auto"
      >
        <code>
          {renderLine
            ? code
                .split("\n")
                .map((line, i) => (
                  <React.Fragment key={i}>{renderLine(line, i)}</React.Fragment>
                ))
            : highlight(code)}
        </code>
      </pre>
    </div>
  );
}
