"use client";

import { useEffect, useState } from "react";
import { useHideFloatingButton } from "@/components/AppLayout";

export type CreatedJob = {
  uuid: string;
  public_token: string;
  annotator_id: string;
  annotator_name: string;
  item_count: number;
  status: string;
};

type JobsCreatedDialogProps = {
  isOpen: boolean;
  jobs: CreatedJob[];
  onClose: () => void;
};

function buildJobUrl(token: string): string {
  if (typeof window === "undefined") return `/annotate-job/${token}`;
  return `${window.location.origin}/annotate-job/${token}`;
}

export function JobsCreatedDialog({
  isOpen,
  jobs,
  onClose,
}: JobsCreatedDialogProps) {
  useHideFloatingButton(isOpen);
  const [copiedToken, setCopiedToken] = useState<string | null>(null);

  useEffect(() => {
    if (!copiedToken) return;
    const t = setTimeout(() => setCopiedToken(null), 1500);
    return () => clearTimeout(t);
  }, [copiedToken]);

  if (!isOpen) return null;

  const handleCopy = async (token: string) => {
    try {
      await navigator.clipboard.writeText(buildJobUrl(token));
      setCopiedToken(token);
    } catch {
      // ignore clipboard failures
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4"
      onClick={onClose}
    >
      <div
        className="bg-background border border-border rounded-xl shadow-2xl w-full max-w-4xl flex flex-col max-h-[90vh]"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="px-6 py-4 border-b border-border flex items-center justify-between">
          <h2 className="text-lg font-semibold">
            {jobs.length} new job{jobs.length === 1 ? "" : "s"} created
          </h2>
          <button
            onClick={onClose}
            className="w-8 h-8 flex items-center justify-center rounded-md hover:bg-muted transition-colors cursor-pointer"
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

        <div className="p-4 md:p-6 space-y-4 overflow-y-auto">
          <p className="text-sm text-muted-foreground">
            Copy each link and send it to the corresponding annotator
          </p>

          <div className="border border-border rounded-lg overflow-hidden">
            <div className="grid grid-cols-[minmax(0,1fr)_minmax(0,3fr)_auto] gap-4 px-4 py-2.5 bg-muted/30 text-xs font-medium text-muted-foreground uppercase tracking-wide">
              <div>Annotator</div>
              <div>Link</div>
              <div className="w-[7.5rem]" />
            </div>
            {jobs.map((job, idx) => {
              const url = buildJobUrl(job.public_token);
              const copied = copiedToken === job.public_token;
              return (
                <div
                  key={job.uuid}
                  className={`grid grid-cols-[minmax(0,1fr)_minmax(0,3fr)_auto] gap-4 items-center px-4 py-3 ${
                    idx > 0 ? "border-t border-border" : ""
                  }`}
                >
                  <div className="text-sm font-medium truncate">
                    {job.annotator_name}
                  </div>
                  <div className="text-xs font-mono text-muted-foreground break-all">
                    {url}
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => handleCopy(job.public_token)}
                      className={`h-8 px-3 rounded-md text-xs font-medium border transition-colors cursor-pointer w-16 ${
                        copied
                          ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-500"
                          : "border-indigo-500/30 bg-indigo-500/10 text-indigo-600 dark:text-indigo-300 hover:bg-indigo-500/20"
                      }`}
                    >
                      {copied ? "Copied" : "Copy"}
                    </button>
                    <a
                      href={url}
                      target="_blank"
                      rel="noopener noreferrer"
                      aria-label={`Open ${job.annotator_name}'s job in a new tab`}
                      title="Open in new tab"
                      className="h-8 w-8 flex items-center justify-center rounded-md border border-amber-500/30 bg-amber-500/10 text-amber-600 dark:text-amber-300 hover:bg-amber-500/20 transition-colors cursor-pointer"
                    >
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
                          d="M13.5 6H5.25A2.25 2.25 0 003 8.25v10.5A2.25 2.25 0 005.25 21h10.5A2.25 2.25 0 0018 18.75V10.5m-10.5 6L21 3m0 0h-5.25M21 3v5.25"
                        />
                      </svg>
                    </a>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        <div className="px-6 py-4 border-t border-border flex items-center justify-end">
          <button
            onClick={onClose}
            className="h-10 px-4 rounded-md text-sm font-medium bg-foreground text-background hover:opacity-90 transition-opacity cursor-pointer"
          >
            Done
          </button>
        </div>
      </div>
    </div>
  );
}
