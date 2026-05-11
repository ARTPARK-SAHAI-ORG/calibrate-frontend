"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { AppLayout } from "@/components/AppLayout";
import {
  AnnotationJobView,
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
      activeItem="human-labelling"
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
            <div className="flex flex-wrap gap-3">
              <FieldRow label="Labelling task">
                <Link
                  href={`/human-labelling/tasks/${meta.task.uuid}`}
                  className="text-sm font-medium text-foreground hover:underline underline-offset-2"
                >
                  {meta.task.name}
                </Link>
              </FieldRow>
              <FieldRow label="Annotator">
                <Link
                  href={`/human-labelling/annotators/${meta.annotator.uuid}`}
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

function jobStatusPillClass(
  status: AnnotationJobMeta["jobStatus"],
): string {
  switch (status) {
    case "completed":
      return "border-green-200 bg-green-100 text-green-700 dark:border-green-500/30 dark:bg-green-500/20 dark:text-green-400";
    case "in_progress":
      return "border-yellow-200 bg-yellow-100 text-yellow-700 dark:border-yellow-500/30 dark:bg-yellow-500/20 dark:text-yellow-400";
    default:
      return "border-gray-200 bg-gray-100 text-gray-700 dark:border-gray-500/30 dark:bg-gray-500/20 dark:text-gray-300";
  }
}

function jobStatusLabel(status: AnnotationJobMeta["jobStatus"]): string {
  if (status === "in_progress") return "In progress";
  if (status === "completed") return "Completed";
  return "Pending";
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
