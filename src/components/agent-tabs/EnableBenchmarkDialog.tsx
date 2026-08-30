"use client";

import React, { useState } from "react";
import { useHideFloatingButton } from "@/components/AppLayout";
import {
  BENCHMARK_PROVIDERS,
  DEFAULT_BENCHMARK_PROVIDER,
} from "@/components/agent-tabs/benchmarkProviders";

/**
 * Asked the first time someone compares models on a connection agent that has
 * not turned benchmarking on yet. Picking the provider here turns it on and
 * saves it, so nobody has to leave the Tests tab for the Connection tab.
 */
export function EnableBenchmarkDialog({
  isOpen,
  onClose,
  onConfirm,
  currentProvider,
}: {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: (provider: string) => void | Promise<void>;
  currentProvider?: string;
}) {
  const [provider, setProvider] = useState(
    currentProvider || DEFAULT_BENCHMARK_PROVIDER,
  );
  const [isSaving, setIsSaving] = useState(false);

  useHideFloatingButton(isOpen);

  if (!isOpen) return null;

  const handleClose = () => {
    if (!isSaving) onClose();
  };

  const handleConfirm = async () => {
    setIsSaving(true);
    try {
      await onConfirm(provider);
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
      <div className="relative bg-background rounded-xl w-full max-w-md p-5 md:p-6 shadow-2xl">
        <h2 className="text-base md:text-lg font-semibold text-foreground mb-2">
          Compare models
        </h2>
        <p className="text-sm md:text-base text-muted-foreground mb-4">
          Which provider does your agent use for models?
        </p>
        <div className="relative mb-5">
          <select
            id="benchmark-provider"
            aria-label="Model provider"
            value={provider}
            onChange={(e) => setProvider(e.target.value)}
            disabled={isSaving}
            className="w-full h-9 md:h-10 px-3 md:px-4 pr-10 rounded-md text-sm md:text-base border border-border bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-accent focus:border-transparent cursor-pointer appearance-none disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {BENCHMARK_PROVIDERS.map((p) => (
              <option key={p.value} value={p.value}>
                {p.label}
              </option>
            ))}
          </select>
          <svg
            className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={2}
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M19.5 8.25l-7.5 7.5-7.5-7.5"
            />
          </svg>
        </div>
        <div className="flex items-center justify-end gap-2 md:gap-3">
          <button
            onClick={handleClose}
            disabled={isSaving}
            className="h-9 md:h-10 px-4 rounded-md text-xs md:text-sm font-medium border border-border bg-background hover:bg-muted/50 transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
          >
            Cancel
          </button>
          <button
            onClick={() => void handleConfirm()}
            disabled={isSaving}
            className="h-9 md:h-10 px-4 rounded-md text-xs md:text-sm font-medium bg-foreground text-background hover:opacity-90 transition-opacity cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
          >
            Continue
          </button>
        </div>
      </div>

      <div className="absolute inset-0 -z-10" onClick={handleClose} />
    </div>
  );
}
