"use client";

import React, { useState } from "react";
import { Link } from "@/lib/nav";
import { CreateApiKeyDialog } from "@/components/CreateApiKeyDialog";
import { SpinnerIcon } from "@/components/icons";
import { useAccessToken, useActiveOrgUuid, useWorkspaceApiKeys } from "@/hooks";
import { getBackendUrl } from "@/lib/api";
import { CodeBlock } from "./CodeBlock";
import {
  buildSnippet,
  SNIPPET_FIELDS,
  SNIPPET_LANGUAGES,
  type SnippetLanguage,
} from "./ingestSnippets";

/** Stand-in shown until a key is created here, so the shape is still clear. */
const KEY_PLACEHOLDER = "sk_...";

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

function Step({
  number,
  title,
  description,
  children,
}: {
  number: number;
  title: string;
  description: string;
  children?: React.ReactNode;
}) {
  return (
    <li className="flex gap-3 md:gap-4">
      <span className="flex-shrink-0 w-7 h-7 rounded-full border border-border bg-muted/50 flex items-center justify-center text-xs font-semibold text-foreground">
        {number}
      </span>
      <div className="flex-1 min-w-0 pb-6 last:pb-0">
        <h4 className="text-sm md:text-base font-semibold text-foreground">
          {title}
        </h4>
        <p className="text-sm text-muted-foreground mt-1 leading-relaxed">
          {description}
        </p>
        {children && <div className="mt-3">{children}</div>}
      </div>
    </li>
  );
}

/**
 * Shown until this agent's first trace arrives: the three things someone has to
 * do to start sending traces, ending with a step that sits and waits. The tab
 * keeps checking while this is on screen, so the list replaces it on its own.
 */
export function TracesEmptyState({ agentUuid }: { agentUuid: string }) {
  const [copied, setCopied] = useState(false);
  const [isCreateKeyOpen, setIsCreateKeyOpen] = useState(false);
  // The backend returns the key itself only when it is created, so this is the
  // one moment it can be filled into the command. Held in memory only, and gone
  // as soon as the traces arrive and this screen goes away.
  const [createdKey, setCreatedKey] = useState<string | null>(null);

  const accessToken = useAccessToken();
  const [orgUuid] = useActiveOrgUuid();
  const { createApiKey } = useWorkspaceApiKeys(accessToken, orgUuid);

  let backendUrl = "https://<backend>";
  try {
    backendUrl = getBackendUrl();
  } catch {
    // Missing env var only happens in misconfigured dev; keep the placeholder.
  }
  const [language, setLanguage] = useState<SnippetLanguage>("curl");
  const snippet = buildSnippet(language, {
    backendUrl,
    agentUuid,
    apiKey: createdKey ?? KEY_PLACEHOLDER,
  });

  const handleCopy = async () => {
    await copyText(snippet);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="border border-border rounded-xl p-6 md:p-8">
      <h3 className="text-base md:text-lg font-semibold text-foreground">
        Start sending traces
      </h3>
      <p className="text-sm md:text-base text-muted-foreground mt-1 mb-6 leading-relaxed max-w-2xl">
        A trace is one turn of a real conversation this agent had. Send them
        from your own backend and you can turn the interesting ones into tests.
      </p>

      <ol>
        <Step
          number={1}
          title="Create an API key"
          description="Your backend signs each request with a workspace API key. Create one here and it goes straight into the command below."
        >
          {createdKey ? (
            <p className="text-sm text-emerald-700 dark:text-emerald-400">
              Key created and filled in below. Copy the command now, because the
              key cannot be shown again.
            </p>
          ) : (
            <div className="flex flex-wrap items-center gap-3">
              <button
                type="button"
                onClick={() => setIsCreateKeyOpen(true)}
                className="h-9 px-4 rounded-md text-xs md:text-sm font-medium bg-foreground text-background hover:opacity-90 transition-opacity cursor-pointer"
              >
                Create API key
              </button>
              <span className="text-xs text-muted-foreground">
                Already have one? Put it in the command below, or manage keys in{" "}
                <Link
                  href="/workspace-settings"
                  className="font-semibold text-foreground underline decoration-foreground/30 underline-offset-2 hover:decoration-foreground/60 transition-colors"
                >
                  workspace settings
                </Link>
                .
              </span>
            </div>
          )}
        </Step>

        <Step
          number={2}
          title="Send one request per turn"
          description="Call this from your backend right after your agent replies. The agent is already filled in below."
        >
          <div className="flex flex-col md:grid md:grid-cols-2 gap-4 md:gap-6">
            <div className="min-w-0">
              <div className="flex items-center justify-between gap-2 mb-2">
                <div
                  role="tablist"
                  aria-label="Language"
                  className="flex items-center gap-1 overflow-x-auto"
                >
                  {SNIPPET_LANGUAGES.map((option) => (
                    <button
                      key={option.id}
                      type="button"
                      role="tab"
                      aria-selected={language === option.id}
                      onClick={() => setLanguage(option.id)}
                      className={`h-7 px-2.5 rounded-md text-xs font-medium transition-colors cursor-pointer whitespace-nowrap ${
                        language === option.id
                          ? "bg-foreground text-background"
                          : "border border-border bg-background hover:bg-muted/50 text-muted-foreground"
                      }`}
                    >
                      {option.label}
                    </button>
                  ))}
                </div>
                <button
                  type="button"
                  onClick={handleCopy}
                  className="shrink-0 h-7 px-3 rounded-md text-xs font-medium border border-border bg-background hover:bg-muted/50 transition-colors cursor-pointer"
                >
                  {copied ? "Copied" : "Copy"}
                </button>
              </div>
              <CodeBlock code={snippet} />
            </div>

            <div className="min-w-0">
              <h5 className="text-xs font-semibold text-foreground uppercase tracking-wide mb-2">
                What each part means
              </h5>
              <dl className="border border-border rounded-lg divide-y divide-border">
                {SNIPPET_FIELDS.map((field) => (
                  <div key={field.name} className="px-3 py-2">
                    <dt className="font-mono text-xs text-foreground">
                      {field.name}
                    </dt>
                    <dd className="text-xs text-muted-foreground mt-0.5 leading-relaxed">
                      {field.meaning}
                    </dd>
                  </div>
                ))}
              </dl>
            </div>
          </div>
        </Step>

        <Step
          number={3}
          title="Wait for the first trace"
          description="Nothing has arrived for this agent yet. This page checks on its own and shows the traces as soon as they come in."
        >
          <span className="inline-flex items-center gap-2 text-sm text-muted-foreground">
            <SpinnerIcon className="w-4 h-4 animate-spin" />
            Listening for traces
          </span>
        </Step>
      </ol>

      {/* The same key-creation dialog workspace settings uses. It hands the
          created key back, which is what fills the command above. */}
      <CreateApiKeyDialog
        isOpen={isCreateKeyOpen}
        onClose={() => setIsCreateKeyOpen(false)}
        onCreate={async (name) => {
          const created = await createApiKey(name);
          setCreatedKey(created.key);
          return created;
        }}
      />
    </div>
  );
}
