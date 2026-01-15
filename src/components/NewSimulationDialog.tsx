"use client";

import React, { useState } from "react";
import { useSession, signOut } from "next-auth/react";

type NewSimulationDialogProps = {
  onClose: () => void;
  onCreateSimulation?: (simulationUuid: string) => void;
};

export function NewSimulationDialog({
  onClose,
  onCreateSimulation,
}: NewSimulationDialogProps) {
  const { data: session } = useSession();
  const backendAccessToken = (session as any)?.backendAccessToken;
  const [simulationName, setSimulationName] = useState("");
  const [isCreating, setIsCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const maxLength = 50;

  const handleCreate = async () => {
    if (!simulationName.trim()) return;

    try {
      setIsCreating(true);
      setError(null);
      const backendUrl = process.env.NEXT_PUBLIC_BACKEND_URL;
      if (!backendUrl) {
        throw new Error("BACKEND_URL environment variable is not set");
      }

      const response = await fetch(`${backendUrl}/simulations`, {
        method: "POST",
        headers: {
          accept: "application/json",
          "Content-Type": "application/json",
          "ngrok-skip-browser-warning": "true",
          Authorization: `Bearer ${backendAccessToken}`,
        },
        body: JSON.stringify({
          name: simulationName.trim(),
          description: "",
        }),
      });

      if (response.status === 401) {
        await signOut({ callbackUrl: "/login" });
        return;
      }

      if (!response.ok) {
        throw new Error("Failed to create simulation");
      }

      const data = await response.json();
      const simulationUuid = data.uuid;

      if (simulationUuid && onCreateSimulation) {
        onClose(); // Close dialog first
        onCreateSimulation(simulationUuid);
      }
    } catch (err) {
      console.error("Error creating simulation:", err);
      setError(
        err instanceof Error ? err.message : "Failed to create simulation"
      );
    } finally {
      setIsCreating(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50"
      onClick={onClose}
    >
      <div
        className="bg-background border border-border rounded-xl p-8 max-w-lg w-full mx-4 shadow-lg"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="mb-6">
          <h2 className="text-2xl font-semibold tracking-tight mb-1">
            Create your simulation
          </h2>
          <p className="text-muted-foreground text-[15px]">
            Choose a name that reflects your simulation&apos;s purpose
          </p>
        </div>

        {/* Simulation Name Input */}
        <div className="mb-6">
          <label className="block text-[13px] font-medium text-foreground mb-2">
            Simulation Name <span className="text-red-500">*</span>
          </label>
          <div className="relative">
            <input
              type="text"
              value={simulationName}
              onChange={(e) => {
                if (e.target.value.length <= maxLength) {
                  setSimulationName(e.target.value);
                }
              }}
              placeholder="Enter simulation name"
              className="w-full h-10 px-3 pr-16 rounded-md text-[13px] border border-border bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-accent focus:border-transparent"
              maxLength={maxLength}
            />
            <div className="absolute inset-y-0 right-0 flex items-center pr-3 pointer-events-none">
              <span className="text-[12px] text-muted-foreground">
                {simulationName.length}/{maxLength}
              </span>
            </div>
          </div>
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
            Back
          </button>
          <button
            onClick={handleCreate}
            disabled={!simulationName.trim() || isCreating}
            className="h-9 px-4 rounded-md text-[13px] font-medium bg-foreground text-background hover:opacity-90 transition-opacity cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
          >
            {isCreating ? (
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
                Creating...
              </>
            ) : (
              "Create Simulation"
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
