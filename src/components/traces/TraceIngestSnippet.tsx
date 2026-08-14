"use client";

import React, { useState } from "react";
import { Link } from "@/lib/nav";
import { getBackendUrl } from "@/lib/api";
import {
  buildSnippet,
  SNIPPET_FIELDS,
  SNIPPET_LANGUAGES,
  type SnippetLanguage,
} from "./ingestSnippets";

/** Stand-in shown when we have no key to hand, so the shape is still clear. */
export const KEY_PLACEHOLDER = "YOUR_API_KEY";

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
  const [includeOptional, setIncludeOptional] = useState(false);

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
    includeOptional,
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
      <div className="min-w-0 space-y-2">
        <div className="flex items-center justify-end gap-2">
          <span className="text-xs text-muted-foreground">
            Include optional fields
          </span>
          <button
            type="button"
            role="switch"
            aria-checked={includeOptional}
            aria-label="Include optional fields"
            onClick={() => setIncludeOptional((value) => !value)}
            className={`relative inline-flex h-5 w-9 flex-shrink-0 items-center rounded-full transition-colors cursor-pointer ${
              includeOptional ? "bg-foreground" : "bg-muted-foreground/40"
            }`}
          >
            <span
              className={`inline-block h-3.5 w-3.5 transform rounded-full bg-background transition-transform ${
                includeOptional ? "translate-x-4" : "translate-x-1"
              }`}
            />
          </button>
        </div>
        {/* Tabs on the left of the header bar, copy on the right, code below. */}
        <div className="border border-border rounded-lg overflow-hidden bg-muted/40">
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
      </div>

      <div className="min-w-0 space-y-3">
        {!apiKey && (
          <div className="flex items-start gap-2 rounded-md border border-blue-500/20 bg-blue-500/5 p-3 text-xs text-muted-foreground">
            <svg
              className="w-4 h-4 mt-0.5 flex-shrink-0 text-blue-600 dark:text-blue-400"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={1.75}
              aria-hidden
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M11.25 11.25l.041-.02a.75.75 0 011.063.852l-.708 2.836a.75.75 0 001.063.853l.041-.021M21 12a9 9 0 11-18 0 9 9 0 0118 0zm-9-3.75h.008v.008H12V8.25z"
              />
            </svg>
            <p>
              Replace{" "}
              <span className="font-mono text-foreground">
                {KEY_PLACEHOLDER}
              </span>{" "}
              with an API key for your workspace from the{" "}
              <Link
                href="/workspace-settings?tab=api-keys"
                className="font-medium text-foreground underline decoration-foreground/30 underline-offset-2 hover:decoration-foreground/60 transition-colors"
              >
                API keys
              </Link>{" "}
              page
            </p>
          </div>
        )}
        <FieldList optional={false} />
        <div className="space-y-2">
          <p className="text-xs font-medium text-foreground">Optional</p>
          <FieldList optional />
        </div>
      </div>
    </div>
  );
}
