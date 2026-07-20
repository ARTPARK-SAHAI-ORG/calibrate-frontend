"use client";

import React from "react";
import Link from "next/link";
import { getBackendUrl } from "@/lib/api";

function ingestSnippet(backendUrl: string): string {
  return [
    `curl -X POST ${backendUrl}/traces \\`,
    `  -H "X-API-Key: sk_..." \\`,
    `  -H "Content-Type: application/json" \\`,
    `  -d '{`,
    `    "message_id": "msg-001",`,
    `    "conversation_id": "conv-001",`,
    `    "input": [{"role": "user", "content": "When is the next vaccination?"}],`,
    `    "output": {"response": "At 14 weeks, for OPV and DPT."}`,
    `  }'`,
  ].join("\n");
}

/**
 * Shown when the workspace has no traces at all: explains the feature and
 * gives a copy-paste ingestion call, pointing at workspace settings for the
 * API key it needs.
 */
export function TracesEmptyState() {
  let backendUrl = "https://<backend>";
  try {
    backendUrl = getBackendUrl();
  } catch {
    // Missing env var only happens in misconfigured dev; keep the placeholder.
  }

  return (
    <div className="border border-border rounded-xl p-8 md:p-12 flex flex-col items-center justify-center bg-muted/20">
      <div className="w-12 h-12 md:w-14 md:h-14 rounded-xl bg-muted flex items-center justify-center mb-3 md:mb-4">
        <svg
          className="w-6 h-6 text-muted-foreground"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          strokeWidth={1.5}
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M9 3.75H6.912a2.25 2.25 0 00-2.15 1.588L2.35 13.177a2.25 2.25 0 00-.1.661V18a2.25 2.25 0 002.25 2.25h15A2.25 2.25 0 0021.75 18v-4.162c0-.224-.034-.447-.1-.661l-2.41-7.839a2.25 2.25 0 00-2.15-1.588H15M2.25 13.5h3.86a2.25 2.25 0 012.012 1.244l.256.512a2.25 2.25 0 002.013 1.244h3.218a2.25 2.25 0 002.013-1.244l.256-.512a2.25 2.25 0 012.013-1.244h3.859M12 3v8.25m0 0l-3-3m3 3l3-3"
          />
        </svg>
      </div>
      <h3 className="text-base md:text-lg font-semibold text-foreground mb-1">
        No traces yet
      </h3>
      <p className="text-sm md:text-base text-muted-foreground mb-3 md:mb-4 text-center max-w-lg">
        Send your agent&apos;s production conversations here, one request per
        turn, then curate them into tests. Create an API key in{" "}
        <Link
          href="/workspace-settings"
          className="font-semibold text-foreground underline decoration-foreground/30 underline-offset-2 hover:decoration-foreground/60 transition-colors"
        >
          workspace settings
        </Link>{" "}
        and POST each turn:
      </p>
      <pre className="w-full max-w-xl text-left font-mono text-xs text-foreground bg-muted/50 border border-border rounded-lg p-4 overflow-x-auto">
        {ingestSnippet(backendUrl)}
      </pre>
    </div>
  );
}
