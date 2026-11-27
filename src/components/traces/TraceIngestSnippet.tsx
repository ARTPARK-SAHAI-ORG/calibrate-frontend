"use client";

import { InfoNote } from "@/components/ui";
import React, { useState } from "react";
import { Link } from "@/lib/nav";
import { CodeTabsBox, snippetBackendUrl } from "./CodeTabsBox";
import {
  buildSnippet,
  snippetFields,
  type AgentNature,
  type SnippetLanguage,
} from "./ingestSnippets";

/** Stand-in shown when we have no key to hand, so the shape is still clear. */
export const KEY_PLACEHOLDER = "YOUR_API_KEY";

function FieldList({
  optional,
  agentNature,
}: {
  optional: boolean;
  agentNature: AgentNature;
}) {
  return (
    <dl className="space-y-2">
      {snippetFields(agentNature)
        .filter((f) => Boolean(f.optional) === optional)
        .map((field) => (
          <div key={field.name}>
            <dt className="font-mono text-xs text-foreground">{field.name}</dt>
            <dd className="text-xs text-muted-foreground mt-0.5">
              {field.meaning}
            </dd>
          </div>
        ))}
    </dl>
  );
}

/**
 * The request that sends one trace, in the reader's language of choice, beside
 * what each field means. Used by the setup steps before the first trace lands
 * and by the "Integration guide" dialog afterwards, so both show the same thing.
 */
export function TraceIngestSnippet({
  agentUuid,
  apiKey,
  agentNature = "conversation",
  fillHeight = false,
}: {
  agentUuid: string;
  /** The key created during setup, when there is one. */
  apiKey?: string | null;
  agentNature?: AgentNature;
  /** Fit a fixed-height box: the code stays put and the notes scroll beside
   *  it. Off on the setup steps, where the page scrolls as one. */
  fillHeight?: boolean;
}) {
  const [language, setLanguage] = useState<SnippetLanguage>("curl");
  const [includeOptional, setIncludeOptional] = useState(false);

  const snippet = buildSnippet(language, {
    backendUrl: snippetBackendUrl(),
    agentUuid,
    apiKey: apiKey ?? KEY_PLACEHOLDER,
    includeOptional,
    agentNature,
  });

  return (
    // The code gets the larger share: a key and a URL on one line need the room
    // more than the explanations do.
    <div
      className={`flex flex-col lg:grid lg:grid-cols-[3fr_2fr] gap-4 ${
        fillHeight ? "lg:h-full lg:min-h-0" : ""
      }`}
    >
      <div className={`min-w-0 ${fillHeight ? "lg:overflow-y-auto" : ""}`}>
        <CodeTabsBox
          code={snippet}
          language={language}
          onLanguageChange={setLanguage}
        />
      </div>

      <div
        className={`min-w-0 space-y-3 ${
          fillHeight ? "lg:overflow-y-auto lg:min-h-0" : ""
        }`}
      >
        {!apiKey && (
          <InfoNote>
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
          </InfoNote>
        )}
        <FieldList optional={false} agentNature={agentNature} />
        <div className="space-y-2">
          <p className="text-xs font-medium text-foreground">Optional</p>
          <FieldList optional agentNature={agentNature} />
          <label className="flex items-center gap-2 cursor-pointer select-none">
            <button
              type="button"
              role="switch"
              aria-checked={includeOptional}
              onClick={() => setIncludeOptional((value) => !value)}
              className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors cursor-pointer ${
                includeOptional ? "bg-foreground" : "bg-border"
              }`}
            >
              <span
                className={`inline-block h-3.5 w-3.5 transform rounded-full bg-background transition-transform ${
                  includeOptional ? "translate-x-4" : "translate-x-1"
                }`}
              />
            </button>
            <span className="text-sm text-muted-foreground">
              Include optional fields in the code
            </span>
          </label>
        </div>
      </div>
    </div>
  );
}
