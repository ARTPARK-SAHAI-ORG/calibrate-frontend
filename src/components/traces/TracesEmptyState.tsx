"use client";

import React, { useRef, useState } from "react";
import { CreateApiKeyDialog } from "@/components/CreateApiKeyDialog";
import { CheckCircleIcon, ChevronDownIcon } from "@/components/icons";
import { Button } from "@/components/ui";
import { useAccessToken, useActiveOrgUuid, useWorkspaceApiKeys } from "@/hooks";
import { validateApiKeyForAgent } from "@/lib/tracesApi";
import { TraceIngestSnippet } from "./TraceIngestSnippet";

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
  const [isCreateKeyOpen, setIsCreateKeyOpen] = useState(false);
  /** Set when a key is created, cleared when the dialog closes, so cancelling
   *  a later opening does not move the reader back to step two. */
  const madeKeyThisTime = useRef(false);
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
  // Step two is always open to the reader, whether or not step one worked out:
  // the key can be typed into the code by hand, so nothing about a failed key
  // check should hide the code that does the sending.
  // Step one is done when there is a key, not when the reader has walked past
  // it: skipping it leaves the code below with a placeholder in place of a key,
  // so a tick there would say a key was made when none was.
  const stepState = (step: number): StepState =>
    step === 1
      ? createdKey
        ? "done"
        : "current"
      : step < reached
        ? "done"
        : step === reached || step === 2
          ? "current"
          : "upcoming";

  // The backend returns the key itself only when it is created, so this is the
  // one moment it can be filled into the request. Held in memory only, and gone
  // as soon as the traces arrive and this screen goes away. Pasting an existing
  // key and checking it lands in the same place.
  const [createdKey, setCreatedKey] = useState<string | null>(null);
  const [isPastingKey, setIsPastingKey] = useState(false);
  const [pastedKey, setPastedKey] = useState("");
  const [isCheckingKey, setIsCheckingKey] = useState(false);
  const [keyCheckError, setKeyCheckError] = useState<string | null>(null);

  const accessToken = useAccessToken();
  const [orgUuid] = useActiveOrgUuid();
  const { createApiKey } = useWorkspaceApiKeys(accessToken, orgUuid);

  const handleCheckExistingKey = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = pastedKey.trim();
    if (!trimmed || isCheckingKey) return;
    setIsCheckingKey(true);
    setKeyCheckError(null);
    try {
      const ok = await validateApiKeyForAgent(trimmed, agentUuid);
      if (!ok) {
        setKeyCheckError(
          "This key did not work. Check it is for this workspace.",
        );
        return;
      }
      setCreatedKey(trimmed);
      setIsPastingKey(false);
      setPastedKey("");
      goToStep(2);
    } catch {
      setKeyCheckError("Could not check this key. Try again.");
    } finally {
      setIsCheckingKey(false);
    }
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
            {/* Coming back to this step, the key you made or checked is still
                here: it is the one already in the request below. */}
            <code className="block px-3 py-2 rounded-md border border-border bg-muted/40 text-xs font-mono text-foreground whitespace-nowrap overflow-x-auto">
              {createdKey}
            </code>
            <Button size="sm" onClick={() => setIsCreateKeyOpen(true)}>
              Create a new API key
            </Button>
          </>
        ) : isPastingKey ? (
          <form onSubmit={handleCheckExistingKey} className="space-y-3">
            <label className="block">
              <span className="sr-only">API key</span>
              <input
                type="text"
                value={pastedKey}
                onChange={(e) => {
                  setPastedKey(e.target.value);
                  setKeyCheckError(null);
                }}
                placeholder="Paste your key"
                autoFocus
                autoComplete="off"
                spellCheck={false}
                disabled={isCheckingKey}
                className="w-full h-10 px-3 rounded-md border border-border bg-background text-sm font-mono text-foreground placeholder:font-sans placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-foreground/10 disabled:opacity-50"
              />
            </label>
            {keyCheckError && (
              <p className="text-sm text-red-600 dark:text-red-400">
                {keyCheckError}
              </p>
            )}
            <div className="flex flex-wrap items-center gap-2">
              <Button
                type="submit"
                size="sm"
                disabled={!pastedKey.trim()}
                isLoading={isCheckingKey}
                loadingText="Checking..."
              >
                Check key
              </Button>
              <Button
                type="button"
                size="sm"
                variant="ghost"
                disabled={isCheckingKey}
                onClick={() => {
                  setIsPastingKey(false);
                  setPastedKey("");
                  setKeyCheckError(null);
                }}
              >
                Cancel
              </Button>
            </div>
          </form>
        ) : (
          <div className="flex flex-wrap items-center gap-2">
            <Button size="sm" onClick={() => setIsCreateKeyOpen(true)}>
              Create API key
            </Button>
            <Button
              size="sm"
              variant="secondary"
              onClick={() => setIsPastingKey(true)}
            >
              I have a key already
            </Button>
          </div>
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
        <TraceIngestSnippet agentUuid={agentUuid} apiKey={createdKey} />

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
          // point the key is in the request and step one is done. Only this
          // opening counts: someone on step three who opens the dialog and
          // cancels should stay where they were.
          if (madeKeyThisTime.current) {
            madeKeyThisTime.current = false;
            goToStep(2);
          }
        }}
        onCreate={async (name) => {
          const created = await createApiKey(name);
          setCreatedKey(created.key);
          madeKeyThisTime.current = true;
          return created;
        }}
      />
    </div>
  );
}
