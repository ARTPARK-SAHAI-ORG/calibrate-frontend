"use client";

import React from "react";
import { useHideFloatingButton } from "@/components/AppLayout";
import { Link } from "@/lib/nav";
import { TraceIngestSnippet } from "./TraceIngestSnippet";

/**
 * The sending code, on demand. The setup steps disappear once the first trace
 * lands, so this is how someone gets back to the request afterwards: to send
 * traces from another service, or to check a field.
 */
export function TraceIngestCodeDialog({
  isOpen,
  onClose,
  agentUuid,
}: {
  isOpen: boolean;
  onClose: () => void;
  agentUuid: string;
}) {
  useHideFloatingButton(isOpen);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
      <div className="bg-background rounded-xl w-full max-w-4xl max-h-[85vh] flex flex-col shadow-2xl">
        <div className="p-5 md:p-6 border-b border-border">
          <h2 className="text-base md:text-lg font-semibold text-foreground">
            Send a trace
          </h2>
          <p className="text-sm text-muted-foreground mt-1">
            Call this from your app every time your agent replies. Your address
            and this agent are already filled in. Put in a key from{" "}
            <Link
              href="/workspace-settings"
              className="font-medium text-foreground underline decoration-foreground/30 underline-offset-2 hover:decoration-foreground/60 transition-colors"
            >
              workspace settings
            </Link>
            .
          </p>
        </div>

        <div className="flex-1 overflow-y-auto p-5 md:p-6">
          {/* No key here: the one made during setup is shown once and never
              stored, so the snippet keeps its placeholder. */}
          <TraceIngestSnippet agentUuid={agentUuid} />
        </div>

        <div className="flex items-center justify-end p-5 md:p-6 border-t border-border">
          <button
            type="button"
            onClick={onClose}
            className="h-9 md:h-10 px-4 rounded-md text-xs md:text-sm font-medium border border-border bg-background hover:bg-muted/50 transition-colors cursor-pointer"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
