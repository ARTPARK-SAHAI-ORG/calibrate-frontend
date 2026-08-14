"use client";

import React, { useState } from "react";
import { Link } from "@/lib/nav";
import { CreateApiKeyDialog } from "@/components/CreateApiKeyDialog";
import { CheckCircleIcon } from "@/components/icons";
import { Button } from "@/components/ui";
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

/**
 * One numbered card, matching the Connection check card on the agent tab.
 * A finished step collapses to its heading and can be opened again; only one
 * step is open at a time, so there is only ever one thing to read.
 */
function Step({
  number,
  title,
  description,
  isDone,
  isOpen,
  onToggle,
  children,
}: {
  number: number;
  title: string;
  description: string;
  isDone: boolean;
  isOpen: boolean;
  onToggle: () => void;
  children: React.ReactNode;
}) {
  return (
    <div className="border border-border rounded-xl p-3 md:p-4 space-y-3">
      <button
        type="button"
        onClick={onToggle}
        disabled={!isDone}
        aria-expanded={isOpen}
        className="w-full flex items-start gap-2 text-left cursor-pointer disabled:cursor-default"
      >
        {isDone ? (
          <CheckCircleIcon className="w-4 h-4 text-green-500 flex-shrink-0 mt-0.5" />
        ) : (
          <span className="w-4 h-4 flex-shrink-0" />
        )}
        <span className="flex-1 min-w-0">
          <span className="block text-sm md:text-base font-medium text-foreground">
            {number}. {title}
          </span>
          {isOpen && (
            <span className="block text-xs text-muted-foreground mt-0.5">
              {description}
            </span>
          )}
        </span>
      </button>
      {isOpen && children}
    </div>
  );
}

type TracesEmptyStateProps = {
  agentUuid: string;
  /** Ask the backend for this agent's traces again. */
  onCheckForTraces: () => void;
};

/**
 * Shown until this agent's first trace arrives: the three things someone has to
 * do to start sending traces, ending with a check button. Nothing polls; the
 * reader says when to look.
 */
export function TracesEmptyState({
  agentUuid,
  onCheckForTraces,
}: TracesEmptyStateProps) {
  const [copied, setCopied] = useState(false);
  const [isCreateKeyOpen, setIsCreateKeyOpen] = useState(false);
  const [isChecking, setIsChecking] = useState(false);
  const [checkedAndEmpty, setCheckedAndEmpty] = useState(false);
  // Only one step is on screen at a time: later ones do not exist yet, earlier
  // ones collapse to a line. `reached` is how far they have got, `openStep` is
  // what is expanded, which is the current step unless they reopen an old one.
  const [reached, setReached] = useState(1);
  const [openStep, setOpenStep] = useState(1);
  const goToStep = (step: number) => {
    setReached((furthest) => Math.max(furthest, step));
    setOpenStep(step);
  };
  const toggleStep = (step: number) => {
    setOpenStep((open) => (open === step ? reached : step));
  };
  // The backend returns the key itself only when it is created, so this is the
  // one moment it can be filled into the request. Held in memory only, and gone
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

  // The tab swaps this whole screen for the list when traces come back, so the
  // only outcome to handle here is "still nothing".
  const handleCheck = async () => {
    setIsChecking(true);
    setCheckedAndEmpty(false);
    try {
      await onCheckForTraces();
    } finally {
      setIsChecking(false);
      setCheckedAndEmpty(true);
    }
  };

  return (
    <div className="space-y-4 md:space-y-6">
      <div>
        <h2 className="text-base md:text-lg font-medium text-foreground">
          Start sending traces
        </h2>
        <p className="text-xs md:text-sm text-muted-foreground mt-0.5 max-w-3xl">
          A trace is one turn of a real conversation this agent had. Send them
          from your own backend and you can turn the interesting ones into
          tests.
        </p>
      </div>

      <Step
        number={1}
        title="Create an API key"
        description="Your backend signs each request with a workspace API key. Create one here and it goes straight into the request in the next step."
        isDone={reached > 1}
        isOpen={openStep === 1}
        onToggle={() => toggleStep(1)}
      >
        <div className="flex flex-wrap items-center gap-3">
          <Button size="sm" onClick={() => setIsCreateKeyOpen(true)}>
            Create API key
          </Button>
          <Button size="sm" variant="secondary" onClick={() => goToStep(2)}>
            I already have a key
          </Button>
          <p className="text-xs text-muted-foreground">
            Manage keys in{" "}
            <Link
              href="/workspace-settings"
              className="font-medium text-foreground underline decoration-foreground/30 underline-offset-2 hover:decoration-foreground/60 transition-colors"
            >
              workspace settings
            </Link>
            .
          </p>
        </div>
      </Step>

      {reached >= 2 && (
        <Step
          number={2}
          title="Send one request per turn"
          description="Call this from your backend right after your agent replies. Your Calibrate address and this agent are already filled in."
          isDone={reached > 2}
          isOpen={openStep === 2}
          onToggle={() => toggleStep(2)}
        >
        <div className="flex flex-col md:grid md:grid-cols-2 gap-4 md:gap-6">
          <div className="min-w-0 space-y-2">
            <div className="flex items-center justify-between gap-2">
              <div className="inline-flex rounded-lg border border-border p-0.5 bg-muted/30">
                {SNIPPET_LANGUAGES.map((option) => (
                  <button
                    key={option.id}
                    type="button"
                    onClick={() => setLanguage(option.id)}
                    className={`h-8 px-3 rounded-md text-xs md:text-sm font-medium transition-colors cursor-pointer ${
                      language === option.id
                        ? "bg-foreground text-background"
                        : "text-muted-foreground hover:text-foreground"
                    }`}
                  >
                    {option.label}
                  </button>
                ))}
              </div>
              <Button size="sm" variant="secondary" onClick={handleCopy}>
                {copied ? "Copied" : "Copy"}
              </Button>
            </div>
            <CodeBlock code={snippet} />
          </div>

          <div className="min-w-0 space-y-2">
            <h4 className="text-sm md:text-base font-medium text-foreground">
              What goes in the request
            </h4>
            <dl className="border border-border rounded-xl divide-y divide-border overflow-hidden">
              {SNIPPET_FIELDS.map((field) => (
                <div key={field.name} className="px-3 py-2">
                  <dt className="font-mono text-xs text-foreground">
                    {field.name}
                  </dt>
                  <dd className="text-xs text-muted-foreground mt-0.5">
                    {field.meaning}
                  </dd>
                </div>
              ))}
              </dl>
            </div>
          </div>

          <div className="flex justify-end">
            <Button size="sm" onClick={() => goToStep(3)}>
              I have added this
            </Button>
          </div>
        </Step>
      )}

      {reached >= 3 && (
        <Step
          number={3}
          title="Check that it arrived"
          description="Once your backend has sent a trace, check here. The traces show up on this tab as soon as there are any."
          isDone={false}
          isOpen={openStep === 3}
          onToggle={() => toggleStep(3)}
        >
          <div className="flex items-center justify-between gap-4">
            <div className="flex items-center gap-2">
              {/* Pulsing dot: listening, nothing has landed yet. */}
              <span className="relative flex w-2 h-2 flex-shrink-0">
                <span className="absolute inline-flex w-full h-full rounded-full bg-amber-500 opacity-60 animate-ping" />
                <span className="relative inline-flex w-2 h-2 rounded-full bg-amber-500" />
              </span>
              <span className="text-sm text-muted-foreground">
                {checkedAndEmpty && !isChecking
                  ? "Still nothing for this agent"
                  : "No traces for this agent yet"}
              </span>
            </div>
            <Button
              onClick={handleCheck}
              isLoading={isChecking}
              loadingText="Checking..."
              className="flex-shrink-0 h-9 md:h-10 text-xs md:text-sm"
            >
              Check for traces
            </Button>
          </div>
        </Step>
      )}

      {/* The same key-creation dialog workspace settings uses. It hands the
          created key back, which is what fills the request above. */}
      <CreateApiKeyDialog
        isOpen={isCreateKeyOpen}
        onClose={() => {
          setIsCreateKeyOpen(false);
          // The dialog reveals the key, then the reader closes it; that is the
          // point the key is in the request and step one is done.
          if (createdKey) goToStep(2);
        }}
        onCreate={async (name) => {
          const created = await createApiKey(name);
          setCreatedKey(created.key);
          return created;
        }}
      />
    </div>
  );
}
