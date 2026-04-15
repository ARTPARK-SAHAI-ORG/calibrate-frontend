"use client";

import React, { useState } from "react";
import { Tooltip } from "@/components/Tooltip";

export type ShareableEntityType =
  | "stt"
  | "tts"
  | "test-run"
  | "benchmark"
  | "simulation-run";

const VISIBILITY_ENDPOINTS: Record<
  ShareableEntityType,
  (id: string) => string
> = {
  stt: (id) => `/stt/evaluate/${id}/visibility`,
  tts: (id) => `/tts/evaluate/${id}/visibility`,
  "test-run": (id) => `/agent-tests/run/${id}/visibility`,
  benchmark: (id) => `/agent-tests/benchmark/${id}/visibility`,
  "simulation-run": (id) => `/simulations/run/${id}/visibility`,
};

const PUBLIC_PATHS: Record<ShareableEntityType, string> = {
  stt: "stt",
  tts: "tts",
  "test-run": "test-run",
  benchmark: "benchmark",
  "simulation-run": "simulation-run",
};

interface ShareButtonProps {
  entityType: ShareableEntityType;
  entityId: string;
  accessToken: string;
  initialIsPublic: boolean;
  initialShareToken: string | null;
}

export function ShareButton({
  entityType,
  entityId,
  accessToken,
  initialIsPublic,
  initialShareToken,
}: ShareButtonProps) {
  const [isPublic, setIsPublic] = useState(initialIsPublic);
  const [shareToken, setShareToken] = useState<string | null>(
    initialShareToken,
  );
  const [isLoading, setIsLoading] = useState(false);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const publicUrl = shareToken
    ? `${window.location.origin}/public/${PUBLIC_PATHS[entityType]}/${shareToken}`
    : null;

  const toggle = async () => {
    setIsLoading(true);
    setError(null);
    try {
      const backendUrl = process.env.NEXT_PUBLIC_BACKEND_URL;
      if (!backendUrl) throw new Error("Backend URL not configured");

      const endpoint = VISIBILITY_ENDPOINTS[entityType](entityId);
      const res = await fetch(`${backendUrl}${endpoint}`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          accept: "application/json",
          "ngrok-skip-browser-warning": "true",
          Authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify({ is_public: !isPublic }),
      });

      if (!res.ok) throw new Error("Failed to update visibility");

      const data = await res.json();
      setIsPublic(data.is_public);
      setShareToken(data.share_token ?? null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setIsLoading(false);
    }
  };

  const copyLink = async () => {
    if (!publicUrl) return;
    try {
      await navigator.clipboard.writeText(publicUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Fallback for environments without clipboard API
      const el = document.createElement("textarea");
      el.value = publicUrl;
      document.body.appendChild(el);
      el.select();
      document.execCommand("copy");
      document.body.removeChild(el);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  return (
    <div className="flex items-center gap-2">
      {/* Toggle button */}
      <Tooltip
        content={
          isPublic
            ? "Make this benchmark private"
            : "Make this benchmark publicly shareable"
        }
        position="bottom"
      >
        <button
          onClick={toggle}
          disabled={isLoading}
          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[13px] font-medium transition-colors border cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed ${
            isPublic
              ? "bg-blue-500/10 border-blue-500/30 text-blue-600 dark:text-blue-400 hover:bg-blue-500/20"
              : "bg-muted border-border text-muted-foreground hover:text-foreground hover:bg-muted/70"
          }`}
        >
          {isLoading ? (
            <svg
              className="w-3.5 h-3.5 animate-spin"
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
              />
              <path
                className="opacity-75"
                fill="currentColor"
                d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
              />
            </svg>
          ) : isPublic ? (
            /* Globe icon — public */
            <svg
              className="w-3.5 h-3.5"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={2}
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M12 21a9.004 9.004 0 008.716-6.747M12 21a9.004 9.004 0 01-8.716-6.747M12 21c2.485 0 4.5-4.03 4.5-9S14.485 3 12 3m0 18c-2.485 0-4.5-4.03-4.5-9S9.515 3 12 3m0 0a8.997 8.997 0 017.843 4.582M12 3a8.997 8.997 0 00-7.843 4.582m15.686 0A11.953 11.953 0 0112 10.5c-2.998 0-5.74-1.1-7.843-2.918m15.686 0A8.959 8.959 0 0121 12c0 .778-.099 1.533-.284 2.253M3 12a8.959 8.959 0 01.284-2.253"
              />
            </svg>
          ) : (
            /* Lock icon — private */
            <svg
              className="w-3.5 h-3.5"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={2}
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M16.5 10.5V6.75a4.5 4.5 0 10-9 0v3.75m-.75 11.25h10.5a2.25 2.25 0 002.25-2.25v-6.75a2.25 2.25 0 00-2.25-2.25H6.75a2.25 2.25 0 00-2.25 2.25v6.75a2.25 2.25 0 002.25 2.25z"
              />
            </svg>
          )}
          {isPublic ? "Public" : "Share"}
        </button>
      </Tooltip>

      {/* Copy link — only shown when public */}
      {isPublic && publicUrl && (
        <button
          onClick={copyLink}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[13px] font-medium bg-muted border border-border text-muted-foreground hover:text-foreground hover:bg-muted/70 transition-colors cursor-pointer dark:bg-accent/20 dark:border-accent/40 dark:text-accent-foreground dark:hover:bg-accent/30"
          title="Copy public link"
        >
          {copied ? (
            <>
              <svg
                className="w-3.5 h-3.5 text-green-500"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth={2}
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M4.5 12.75l6 6 9-13.5"
                />
              </svg>
              <span className="text-green-600 dark:text-green-400">Copied</span>
            </>
          ) : (
            <>
              <svg
                className="w-3.5 h-3.5"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth={2}
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M13.19 8.688a4.5 4.5 0 011.242 7.244l-4.5 4.5a4.5 4.5 0 01-6.364-6.364l1.757-1.757m13.35-.622l1.757-1.757a4.5 4.5 0 00-6.364-6.364l-4.5 4.5a4.5 4.5 0 001.242 7.244"
                />
              </svg>
              Copy link
            </>
          )}
        </button>
      )}

      {error && <span className="text-[12px] text-red-500">{error}</span>}
    </div>
  );
}
