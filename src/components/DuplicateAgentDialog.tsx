"use client";

import { useState } from "react";
import { signOut } from "next-auth/react";
import { reportError } from "@/lib/reportError";
import { readNameConflictMessage } from "@/lib/parseBackendError";
import { useAccessToken } from "@/hooks";
import {
  Button,
  InteractionTypeChooser,
  type InteractionType,
} from "@/components/ui";

/**
 * Copy an agent under a new name. Shared by the agents list and the agent
 * detail page so both offer the same dialog. `onDuplicated` receives the new
 * agent's id and name; the caller decides whether to add a row, navigate, or
 * both.
 *
 * The backend copies the agent it has stored, so a caller that holds edits the
 * person has not saved yet passes `onBeforeDuplicate` to save them first. It
 * returns false when that save fails, and nothing is copied.
 *
 * The copy can be a different kind of agent from the original, which is the
 * only way to move an agent between holding a conversation and answering once:
 * the type cannot be changed on an agent that already exists. `interaction_type`
 * is optional on the request, and a value outside the two kinds is refused.
 *
 * The backend decides what a copy carries: the agent's tools and evaluators,
 * never its tests, and, when the kind changes, only the evaluators that can
 * judge the new kind.
 */
export function DuplicateAgentDialog({
  agentUuid,
  agentName: originalName,
  interactionType: originalInteractionType,
  onClose,
  onDuplicated,
  onBeforeDuplicate,
}: {
  agentUuid: string;
  agentName: string;
  interactionType?: InteractionType;
  onClose: () => void;
  onDuplicated: (
    newAgentUuid: string,
    name: string,
    interactionType: InteractionType,
  ) => void;
  onBeforeDuplicate?: () => Promise<boolean>;
}) {
  const backendAccessToken = useAccessToken();
  const [agentName, setAgentName] = useState(`Copy of ${originalName}`);
  const [interactionType, setInteractionType] = useState<InteractionType>(
    originalInteractionType === "general" ? "general" : "conversation",
  );
  const [isDuplicating, setIsDuplicating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [nameConflictError, setNameConflictError] = useState<string | null>(
    null,
  );
  const maxLength = 50;

  const handleDuplicate = async () => {
    if (!agentName.trim()) return;

    try {
      setIsDuplicating(true);
      setError(null);
      setNameConflictError(null);
      const backendUrl = process.env.NEXT_PUBLIC_BACKEND_URL;
      if (!backendUrl) {
        throw new Error("BACKEND_URL environment variable is not set");
      }

      if (onBeforeDuplicate && !(await onBeforeDuplicate())) {
        setError(
          "Your latest changes could not be saved, so the copy was not created. Try again.",
        );
        setIsDuplicating(false);
        return;
      }

      const response = await fetch(
        `${backendUrl}/agents/${agentUuid}/duplicate`,
        {
          method: "POST",
          headers: {
            accept: "application/json",
            "Content-Type": "application/json",
            Authorization: `Bearer ${backendAccessToken}`,
          },
          body: JSON.stringify({
            name: agentName.trim(),
            interaction_type: interactionType,
          }),
        },
      );

      if (response.status === 401) {
        await signOut({ callbackUrl: "/login" });
        return;
      }

      if (!response.ok) {
        const conflict = await readNameConflictMessage(response);
        if (conflict) {
          setNameConflictError(conflict);
          setIsDuplicating(false);
          return;
        }
        throw new Error("Failed to duplicate agent");
      }

      const data = await response.json();
      onDuplicated(data.uuid, agentName.trim(), interactionType);
      onClose();
    } catch (err) {
      reportError("Error duplicating agent:", err);
      setError(
        err instanceof Error ? err.message : "Failed to duplicate agent",
      );
    } finally {
      setIsDuplicating(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm"
      // The dialog stays put until the copy has been made, the same as Cancel
      // and the corner X, so a stray click cannot take it off screen while the
      // request is still going.
      onClick={() => {
        if (!isDuplicating) onClose();
      }}
    >
      <div
        className="bg-background border border-border rounded-xl p-8 max-w-lg w-full mx-4 shadow-lg"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="mb-6">
          <div className="flex items-start justify-between gap-3 mb-1">
            <h2 className="text-2xl font-semibold tracking-tight">
              Duplicate agent
            </h2>
            <button
              type="button"
              onClick={onClose}
              disabled={isDuplicating}
              className="flex items-center justify-center w-8 h-8 rounded-md hover:bg-muted transition-colors cursor-pointer flex-shrink-0 disabled:opacity-50 disabled:cursor-not-allowed"
              aria-label="Close"
            >
              <svg
                className="w-5 h-5"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth={2}
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M6 18L18 6M6 6l12 12"
                />
              </svg>
            </button>
          </div>
          <p className="text-muted-foreground text-[15px]">
            Choose a name for the new agent and what it does
          </p>
        </div>

        {/* Agent Name Input */}
        <div className="mb-6">
          <label className="block text-[13px] font-medium text-foreground mb-2">
            Agent Name <span className="text-red-500">*</span>
          </label>
          <div className="relative">
            <input
              type="text"
              value={agentName}
              onChange={(e) => {
                if (e.target.value.length <= maxLength) {
                  setAgentName(e.target.value);
                  if (nameConflictError) setNameConflictError(null);
                }
              }}
              placeholder="Enter agent name"
              className={`w-full h-10 px-3 pr-16 rounded-md text-[13px] border bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-accent focus:border-transparent ${
                nameConflictError ? "border-red-500" : "border-border"
              }`}
              maxLength={maxLength}
            />
            <div className="absolute inset-y-0 right-0 flex items-center pr-3 pointer-events-none">
              <span className="text-[12px] text-muted-foreground">
                {agentName.length}/{maxLength}
              </span>
            </div>
          </div>
          {nameConflictError && (
            <p className="mt-1 text-[13px] text-red-500">{nameConflictError}</p>
          )}
        </div>

        <InteractionTypeChooser
          value={interactionType}
          onChange={setInteractionType}
          label="What does the new agent do?"
          className="mb-6 space-y-2"
        />

        {/* Error Message */}
        {error && (
          <div className="mb-6 p-3 rounded-md bg-red-500/10 border border-red-500/20">
            <p className="text-[13px] text-red-500">{error}</p>
          </div>
        )}

        <div className="flex items-center justify-end gap-2 md:gap-3">
          <Button
            variant="secondary"
            size="md"
            onClick={onClose}
            disabled={isDuplicating}
          >
            Cancel
          </Button>
          <Button
            variant="primary"
            size="md"
            onClick={handleDuplicate}
            disabled={!agentName.trim()}
            isLoading={isDuplicating}
            loadingText="Duplicating..."
          >
            Duplicate
          </Button>
        </div>
      </div>
    </div>
  );
}
