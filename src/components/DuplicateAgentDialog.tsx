"use client";

import { useState } from "react";
import { signOut } from "next-auth/react";
import { reportError } from "@/lib/reportError";
import { readNameConflictMessage } from "@/lib/parseBackendError";
import { useAccessToken } from "@/hooks";

/**
 * Copy an agent under a new name. Shared by the agents list and the agent
 * detail page so both offer the same dialog. `onDuplicated` receives the new
 * agent's id and name; the caller decides whether to add a row, navigate, or
 * both.
 */
export function DuplicateAgentDialog({
  agentUuid,
  agentName: originalName,
  onClose,
  onDuplicated,
}: {
  agentUuid: string;
  agentName: string;
  onClose: () => void;
  onDuplicated: (newAgentUuid: string, name: string) => void;
}) {
  const backendAccessToken = useAccessToken();
  const [agentName, setAgentName] = useState(`Copy of ${originalName}`);
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
      onDuplicated(data.uuid, agentName.trim());
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
      onClick={onClose}
    >
      <div
        className="bg-background border border-border rounded-xl p-8 max-w-lg w-full mx-4 shadow-lg"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="mb-6">
          <h2 className="text-2xl font-semibold tracking-tight mb-1">
            Duplicate agent
          </h2>
          <p className="text-muted-foreground text-[15px]">
            Choose a name for the duplicated agent
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

        {/* Error Message */}
        {error && (
          <div className="mb-6 p-3 rounded-md bg-red-500/10 border border-red-500/20">
            <p className="text-[13px] text-red-500">{error}</p>
          </div>
        )}

        {/* Footer Buttons */}
        <div className="flex items-center justify-between">
          <button
            onClick={onClose}
            className="h-9 px-4 rounded-md text-[13px] font-medium bg-muted text-foreground hover:bg-muted/80 transition-colors cursor-pointer flex items-center gap-2"
          >
            <svg
              className="w-4 h-4"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={2}
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M15.75 19.5L8.25 12l7.5-7.5"
              />
            </svg>
            Cancel
          </button>
          <button
            onClick={handleDuplicate}
            disabled={!agentName.trim() || isDuplicating}
            className="h-9 px-4 rounded-md text-[13px] font-medium bg-foreground text-background hover:opacity-90 transition-opacity cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
          >
            {isDuplicating ? (
              <>
                <svg
                  className="w-4 h-4 animate-spin"
                  fill="none"
                  viewBox="0 0 24 24"
                >
                  <circle
                    className="opacity-25"
                    cx="12"
                    cy="12"
                    r="10"
                    stroke="currentColor"
                    strokeWidth="4"
                  ></circle>
                  <path
                    className="opacity-75"
                    fill="currentColor"
                    d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                  ></path>
                </svg>
                Duplicating...
              </>
            ) : (
              "Duplicate"
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
