"use client";

import React, { useState } from "react";
import { CreateApiKeyDialog } from "@/components/CreateApiKeyDialog";
import { CheckCircleIcon, ChevronDownIcon } from "@/components/icons";
import { Button } from "@/components/ui";
import { useAccessToken, useActiveOrgUuid, useWorkspaceApiKeys } from "@/hooks";
import { getBackendUrl } from "@/lib/api";
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

// Strings and comments are the only things worth colouring in the snippet:
// they are what tell a reader "this is a value you replace" versus "this is an
// explanation". A full highlighter would be a dependency for four snippets.
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

type StepState = "done" | "current" | "upcoming";

/**
 * One step, open or collapsed. Header and body share the same padding so the
 * heading, the text and the buttons all sit on one left edge.
 */
function Step({
  number,
  title,
  description,
  state,
  isOpen,
  onToggle,
  children,
}: {
  number: number;
  title: string;
  description: string;
  state: StepState;
  isOpen: boolean;
  onToggle: () => void;
  children: React.ReactNode;
}) {
  return (
    <div
      className={`border border-border rounded-xl ${
        state === "upcoming" ? "opacity-50" : ""
      }`}
    >
      {/* A step you have not reached cannot be opened. A finished one can, to
          look at what you did. */}
      <button
        type="button"
        onClick={onToggle}
        disabled={state === "upcoming"}
        aria-expanded={isOpen}
        className="w-full flex items-center gap-3 px-4 py-3 text-left cursor-pointer disabled:cursor-not-allowed"
      >
        {/* The counter becomes a tick once the step is done. */}
        {state === "done" ? (
          <CheckCircleIcon className="flex-shrink-0 w-6 h-6 text-green-500" />
        ) : (
          <span className="flex-shrink-0 w-6 h-6 rounded-full border border-border bg-background flex items-center justify-center text-xs font-medium text-foreground">
            {number}
          </span>
        )}
        <span className="flex-1 min-w-0 text-sm md:text-base font-medium text-foreground">
          {title}
        </span>
        {state !== "upcoming" && (
          <ChevronDownIcon
            className={`w-4 h-4 flex-shrink-0 text-muted-foreground transition-transform ${
              isOpen ? "" : "-rotate-90"
            }`}
          />
        )}
      </button>
      {isOpen && (
        <div className="px-4 pb-4 pl-13 space-y-3">
          <p className="text-sm text-muted-foreground">{description}</p>
          {children}
        </div>
      )}
    </div>
  );
}

type TracesEmptyStateProps = {
  agentUuid: string;
  /** Ask the backend for this agent's traces again. */
  onCheckForTraces: () => void;
};

/**
 * Shown until this agent's first trace arrives: the three things to do to
 * start sending traces. Every step is listed, but only the one to do now is
 * open. Nothing polls; the reader says when to look.
 */
export function TracesEmptyState({
  agentUuid,
  onCheckForTraces,
}: TracesEmptyStateProps) {
  const [copied, setCopied] = useState(false);
  const [isCreateKeyOpen, setIsCreateKeyOpen] = useState(false);
  const [isChecking, setIsChecking] = useState(false);
  const [checkedAndEmpty, setCheckedAndEmpty] = useState(false);
  // `reached` is how far they have got, `openStep` is what is expanded, which
  // is the current step unless they reopen a finished one.
  const [reached, setReached] = useState(1);
  const [openStep, setOpenStep] = useState(1);
  const goToStep = (step: number) => {
    setReached((furthest) => Math.max(furthest, step));
    setOpenStep(step);
  };
  /** The header chevron: shut the open step, or open a reached one. */
  const toggleStep = (step: number) => {
    setOpenStep((open) => (open === step ? 0 : step));
  };
  const stepState = (step: number): StepState =>
    step < reached ? "done" : step === reached ? "current" : "upcoming";

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
    <div className="space-y-3">
      <div>
        <h2 className="text-base md:text-lg font-semibold text-foreground">
          Getting started
        </h2>
        <p className="text-sm text-muted-foreground mt-0.5">
          Bring your agent's live conversations to Calibrate to continuously
          monitor its quality
        </p>
      </div>

      <Step
        number={1}
        title="Create an API key"
        description="Your app needs this key to connect to your Calibrate workspace"
        state={stepState(1)}
        isOpen={openStep === 1}
        onToggle={() => toggleStep(1)}
      >
        {createdKey ? (
          <>
            {/* Coming back to this step, the key you made is still here: it
                is the one already in the request below. */}
            <code className="block px-3 py-2 rounded-md border border-border bg-muted/40 text-xs font-mono text-foreground whitespace-nowrap overflow-x-auto">
              {createdKey}
            </code>
            <Button
              size="sm"
              variant="secondary"
              onClick={() => setIsCreateKeyOpen(true)}
            >
              Create a new API key
            </Button>
          </>
        ) : (
          <Button size="sm" onClick={() => setIsCreateKeyOpen(true)}>
            Create API key
          </Button>
        )}
      </Step>

      <Step
        number={2}
        title="Send your first trace"
        description="Add the following code snippet to your app to capture the agent's input and output response"
        state={stepState(2)}
        isOpen={openStep === 2}
        onToggle={() => toggleStep(2)}
      >
        {/* The code gets the larger share: a key and a URL on one line need
            the room more than the explanations do. */}
        <div className="flex flex-col lg:grid lg:grid-cols-[3fr_2fr] gap-4">
          {/* The snippet and its controls are one object: tabs on the left of
              the header bar, copy on the right, code below. */}
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
            <dl className="space-y-2">
              {SNIPPET_FIELDS.filter((f) => !f.optional).map((field) => (
                <div key={field.name}>
                  <dt className="font-mono text-xs text-foreground">
                    {field.name}
                  </dt>
                  <dd className="text-xs text-muted-foreground mt-0.5">
                    {field.meaning}
                  </dd>
                </div>
              ))}
            </dl>

            <div className="space-y-2">
              <p className="text-xs font-medium text-foreground">Optional</p>
              <dl className="space-y-2">
                {SNIPPET_FIELDS.filter((f) => f.optional).map((field) => (
                  <div key={field.name}>
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
        </div>

        <Button size="sm" onClick={() => goToStep(3)}>
          I have added this
        </Button>
      </Step>

      <Step
        number={3}
        title="Check that it arrived"
        description="Traces show up on this tab as soon as your app sends one."
        state={stepState(3)}
        isOpen={openStep === 3}
        onToggle={() => toggleStep(3)}
      >
        {checkedAndEmpty && !isChecking && (
          <p className="text-sm text-muted-foreground">
            Still nothing for this agent.
          </p>
        )}
        <Button
          size="sm"
          onClick={handleCheck}
          isLoading={isChecking}
          loadingText="Checking..."
        >
          Check for traces
        </Button>
      </Step>

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
