"use client";

import React, { useState } from "react";
import { getBackendUrl } from "@/lib/api";
import {
  buildSnippet,
  SNIPPET_FIELDS,
  SNIPPET_LANGUAGES,
  type SnippetLanguage,
} from "./ingestSnippets";

/** Stand-in shown when we have no key to hand, so the shape is still clear. */
export const KEY_PLACEHOLDER = "sk_...";

async function copyText(text: string): Promise<void> {
  try {
    await navigator.clipboard.writeText(text);
  } catch {
    const el = document.createElement("textarea");
    el.value = text;
    document.body.appendChild(el);
    el.select();
    document.execCommand("copy");
    document.body.removeChild(el);
  }
}

// Strings and comments are the only things worth colouring in the snippet:
// they are what tell a reader "this is a value you replace" versus "this is an
// explanation". A full highlighter would be a dependency for three snippets.
const TOKENS = /("(?:[^"\\]|\\.)*")|((?:#|\/\/)[^\n]*)/g;

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

function FieldList({ optional }: { optional: boolean }) {
  return (
    <dl className="space-y-2">
      {SNIPPET_FIELDS.filter((f) => Boolean(f.optional) === optional).map(
        (field) => (
          <div key={field.name}>
            <dt className="font-mono text-xs text-foreground">{field.name}</dt>
            <dd className="text-xs text-muted-foreground mt-0.5">
              {field.meaning}
            </dd>
          </div>
        ),
      )}
    </dl>
  );
}

/**
 * The request that sends one trace, in the reader's language of choice, beside
 * what each field means. Used by the setup steps before the first trace lands
 * and by the "View code" dialog afterwards, so both show the same thing.
 */
export function TraceIngestSnippet({
  agentUuid,
  apiKey,
}: {
  agentUuid: string;
  /** The key created during setup, when there is one. */
  apiKey?: string | null;
}) {
  const [copied, setCopied] = useState(false);
  const [language, setLanguage] = useState<SnippetLanguage>("curl");

  let backendUrl = "https://<backend>";
  try {
    backendUrl = getBackendUrl();
  } catch {
    // Missing env var only happens in misconfigured dev; keep the placeholder.
  }

  const snippet = buildSnippet(language, {
    backendUrl,
    agentUuid,
    apiKey: apiKey ?? KEY_PLACEHOLDER,
  });

  const handleCopy = async () => {
    await copyText(snippet);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    // The code gets the larger share: a key and a URL on one line need the room
    // more than the explanations do.
    <div className="flex flex-col lg:grid lg:grid-cols-[3fr_2fr] gap-4">
      {/* The snippet and its controls are one object: tabs on the left of the
          header bar, copy on the right, code below. */}
      <div className="min-w-0 border border-border rounded-lg overflow-hidden bg-muted/40">
        <div className="flex items-center justify-between gap-2 pl-1 pr-1 py-1 border-b border-border">
          <div className="flex items-center gap-0.5 overflow-x-auto">
            {SNIPPET_LANGUAGES.map((option) => (
              <button
                key={option.id}
                type="button"
                onClick={() => setLanguage(option.id)}
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
        <pre className="w-full text-left font-mono text-xs leading-relaxed text-foreground p-4 overflow-x-auto">
          <code>{highlight(snippet)}</code>
        </pre>
      </div>

      <div className="min-w-0 space-y-3">
        <FieldList optional={false} />
        <div className="space-y-2">
          <p className="text-xs font-medium text-foreground">Optional</p>
          <FieldList optional />
        </div>
      </div>
    </div>
  );
}
