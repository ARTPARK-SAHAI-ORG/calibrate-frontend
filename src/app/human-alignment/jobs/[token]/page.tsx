"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { AppLayout } from "@/components/AppLayout";
import {
  AnnotationJobView,
  jobStatusLabel,
  jobStatusPillClass,
  type AnnotationJobMeta,
} from "@/components/human-labelling/AnnotationJobView";
import { ShareButton } from "@/components/ShareButton";
import { useAccessToken } from "@/hooks";
import { useSidebarState } from "@/lib/sidebar";

export default function AdminAnnotateJobPage() {
  const router = useRouter();
  const params = useParams();
  const accessToken = useAccessToken();
  const [sidebarOpen, setSidebarOpen] = useSidebarState();
  const [meta, setMeta] = useState<AnnotationJobMeta | null>(null);

  const token =
    typeof params?.token === "string"
      ? params.token
      : Array.isArray(params?.token)
        ? params.token[0]
        : "";

  useEffect(() => {
    document.title = "Annotation job | Calibrate";
  }, []);

  const handleLoaded = useCallback((m: AnnotationJobMeta) => setMeta(m), []);

  // Copy the annotator-facing URL (/annotate-job/{token}) to the clipboard.
  // Mirrors the per-job copy button used in the tasks detail jobs table.
  const [copied, setCopied] = useState(false);
  useEffect(() => {
    if (!copied) return;
    const t = setTimeout(() => setCopied(false), 1500);
    return () => clearTimeout(t);
  }, [copied]);
  const handleCopyJobLink = async () => {
    if (!token) return;
    const url =
      typeof window === "undefined"
        ? `/annotate-job/${token}`
        : `${window.location.origin}/annotate-job/${token}`;
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
    } catch {
      // ignore — clipboard can fail in insecure contexts; user can still copy manually.
    }
  };

  const customHeader = (
    <button
      onClick={() => router.back()}
      className="inline-flex items-center gap-1.5 px-2 h-8 rounded-md text-sm font-medium text-muted-foreground hover:text-foreground hover:bg-muted transition-colors cursor-pointer"
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
      Back to labelling jobs
    </button>
  );

  return (
    <AppLayout
      activeItem="human-alignment"
      onItemChange={(id) => router.push(`/${id}`)}
      sidebarOpen={sidebarOpen}
      onSidebarToggle={() => setSidebarOpen(!sidebarOpen)}
      customHeader={customHeader}
    >
      <div className="py-4 md:py-6 flex flex-col gap-4" style={{ height: "calc(100dvh - 56px)" }}>
        {/* Mobile-only back button — AppLayout hides `customHeader` below md. */}
        <button
          onClick={() => router.back()}
          className="md:hidden text-sm text-muted-foreground hover:text-foreground transition-colors cursor-pointer flex items-center gap-1.5"
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
          Back to labelling jobs
        </button>

        {meta && (
          <>
            <div className="flex items-center justify-between gap-3 flex-wrap">
              <span
                className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium border ${jobStatusPillClass(
                  meta.jobStatus,
                )}`}
              >
                {jobStatusLabel(meta.jobStatus)}
              </span>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={handleCopyJobLink}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[13px] font-medium border transition-colors cursor-pointer ${
                    copied
                      ? "bg-emerald-500/15 border-emerald-500/45 text-emerald-900 dark:text-emerald-200 hover:bg-emerald-500/25 dark:hover:bg-emerald-500/20"
                      : "bg-indigo-500/14 border-indigo-500/45 text-indigo-900 dark:text-indigo-200 hover:bg-indigo-500/26 dark:hover:bg-indigo-500/20"
                  }`}
                  aria-label={copied ? "Copied job link" : "Copy job link"}
                >
                  {copied ? (
                    <svg
                      className="w-3.5 h-3.5"
                      fill="none"
                      viewBox="0 0 24 24"
                      stroke="currentColor"
                      strokeWidth={2.5}
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        d="M5 13l4 4L19 7"
                      />
                    </svg>
                  ) : (
                    <svg
                      className="w-3.5 h-3.5"
                      fill="none"
                      viewBox="0 0 24 24"
                      stroke="currentColor"
                      strokeWidth={1.8}
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        d="M15.75 17.25v3.375c0 .621-.504 1.125-1.125 1.125h-9.75a1.125 1.125 0 01-1.125-1.125V7.875c0-.621.504-1.125 1.125-1.125H6.75a9.06 9.06 0 011.5.124m7.5 10.376h3.375c.621 0 1.125-.504 1.125-1.125V11.25c0-4.46-3.243-8.161-7.5-8.876a9.06 9.06 0 00-1.5-.124H9.375c-.621 0-1.125.504-1.125 1.125v3.5m7.5 10.375H9.375a1.125 1.125 0 01-1.125-1.125v-9.25m12 6.625v-1.875a3.375 3.375 0 00-3.375-3.375h-1.5a1.125 1.125 0 01-1.125-1.125v-1.5a3.375 3.375 0 00-3.375-3.375H9.75"
                      />
                    </svg>
                  )}
                  {copied ? "Copied" : "Copy job link"}
                </button>
                {meta.jobStatus === "completed" && accessToken && (
                  <ShareButton
                    entityType="annotation-job"
                    entityId={`${meta.task.uuid}:${meta.job.uuid}`}
                    accessToken={accessToken}
                    initialIsPublic={meta.job.is_public}
                    initialShareToken={meta.job.view_token}
                  />
                )}
              </div>
            </div>
            <div className="flex flex-wrap gap-3">
              <FieldRow label="Labelling task">
                <Link
                  href={`/human-alignment/tasks/${meta.task.uuid}`}
                  className="text-sm font-medium text-foreground hover:underline underline-offset-2"
                >
                  {meta.task.name}
                </Link>
              </FieldRow>
              <FieldRow label="Annotator">
                <Link
                  href={`/human-alignment/annotators/${meta.annotator.uuid}`}
                  className="text-sm font-medium text-foreground hover:underline underline-offset-2"
                >
                  {meta.annotator.name}
                </Link>
              </FieldRow>
            </div>

            {meta.evaluators.length > 0 && (
              <div className="space-y-2">
                <div className="text-[10px] uppercase tracking-wide text-muted-foreground">
                  Evaluators
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {meta.evaluators.map((ev) => (
                    <Link
                      key={ev.uuid}
                      href={`/evaluators/${ev.uuid}`}
                      title={`Open ${ev.name}`}
                      className="inline-flex items-center px-2 py-0.5 rounded-md text-xs font-medium border border-border bg-muted/40 text-foreground hover:bg-muted hover:border-foreground/30 transition-colors cursor-pointer"
                    >
                      {ev.name}
                    </Link>
                  ))}
                </div>
              </div>
            )}
          </>
        )}

        <div className="border border-border rounded-xl [overflow:clip] flex flex-col flex-1 min-h-0">
          <AnnotationJobView
            token={token}
            mode="admin"
            fillViewport={false}
            onLoaded={handleLoaded}
          />
        </div>
      </div>
    </AppLayout>
  );
}

function FieldRow({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="border border-border rounded-lg px-4 py-3 bg-background">
      <div className="text-[10px] uppercase tracking-wide text-muted-foreground mb-1">
        {label}
      </div>
      <div>{children}</div>
    </div>
  );
}
