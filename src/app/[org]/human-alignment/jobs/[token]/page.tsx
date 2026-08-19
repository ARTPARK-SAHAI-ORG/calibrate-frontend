"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useParams, useRouter } from "@/lib/nav";
import { AppLayout } from "@/components/AppLayout";
import {
  AnnotationJobView,
  jobStatusLabel,
  jobStatusPillClass,
  type AnnotationJobMeta,
} from "@/components/human-labelling/AnnotationJobView";
import {
  EvaluatorScoreCards,
  HUMAN_SCORES_DESCRIPTION,
  HUMAN_SCORES_HEADING,
} from "@/components/human-labelling/EvaluatorScoreCards";
import {
  SendForReviewFlow,
  type ReviewItem,
} from "@/components/human-labelling/SendForReviewFlow";
import { ShareButton } from "@/components/ShareButton";
import { useAccessToken } from "@/hooks";
import { apiClient } from "@/lib/api";
import { reportError } from "@/lib/reportError";
import { useSidebarState } from "@/lib/sidebar";

/**
 * The parts of the task this page needs to send items for review. The job
 * carries its own copy of the items and labels, frozen at the moment it was
 * created, so an item or a label removed from the task since then is still
 * on screen. Only what is still on the task can go into a new job.
 */
type TaskForReview = {
  items?: { uuid: string }[];
  evaluators?: { uuid: string; name: string; description?: string | null }[];
};

/** Nothing scored yet. A constant so the row is not handed a new array on
 * every render. */
const NO_SCORES: never[] = [];

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

  // Fetched only to work out what can still be sent for review, so a failure
  // here just hides that button and leaves the rest of the page alone.
  const [task, setTask] = useState<TaskForReview | null>(null);
  const taskUuid = meta?.task.uuid ?? "";
  useEffect(() => {
    if (!accessToken || !taskUuid) return;
    let cancelled = false;
    apiClient<TaskForReview>(`/annotation-tasks/${taskUuid}`, accessToken)
      .then((data) => {
        if (!cancelled) setTask(data);
      })
      .catch((err) => {
        reportError("Failed to load task for the review button", err);
      });
    return () => {
      cancelled = true;
    };
  }, [accessToken, taskUuid]);

  const taskItemIds = useMemo(
    () => new Set((task?.items ?? []).map((it) => it.uuid)),
    [task?.items],
  );

  // The items the job view's filters currently leave visible, reported up so
  // the header can offer to send exactly those for review.
  const [visibleItems, setVisibleItems] = useState<ReviewItem[]>([]);
  const handleVisibleItemsChange = useCallback(
    (items: ReviewItem[]) => setVisibleItems(items),
    [],
  );

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

  const statusPill = meta ? (
    <span
      className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium border ${jobStatusPillClass(
        meta.jobStatus,
      )}`}
    >
      {jobStatusLabel(meta.jobStatus)}
    </span>
  ) : null;

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
      <div
        className="py-4 md:py-6 flex flex-col gap-4"
        style={{ height: "calc(100dvh - 56px)" }}
      >
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
            <div className="flex items-start justify-between gap-3 flex-wrap">
              {/* The person who labelled this job, with how far they have
                  got beside their name. Both show from the moment the job
                  exists. The scores and the line explaining them wait until
                  labelling has started, since there is nothing to count
                  before that. The status rides on the heading rather than
                  taking a row of its own: this page fills the window height,
                  so anything taller is taken from the item being read. */}
              <div className="min-w-0">
                <EvaluatorScoreCards
                  heading={meta.annotator.name || HUMAN_SCORES_HEADING}
                  description={
                    meta.jobStatus === "pending" ? "" : HUMAN_SCORES_DESCRIPTION
                  }
                  cards={
                    meta.jobStatus === "pending" ? NO_SCORES : meta.humanScores
                  }
                  headingAside={statusPill}
                  showWhenEmpty
                  singleRow
                />
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <SendForReviewFlow
                  accessToken={accessToken}
                  taskUuid={taskUuid}
                  visibleItems={visibleItems}
                  taskItemIds={taskItemIds}
                  evaluators={task?.evaluators ?? []}
                />
                <button
                  type="button"
                  onClick={handleCopyJobLink}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[13px] font-medium border transition-colors cursor-pointer ${
                    copied
                      ? "bg-emerald-500/15 border-emerald-500/45 text-emerald-900 dark:text-emerald-200 hover:bg-emerald-500/25 dark:hover:bg-emerald-500/20"
                      : "bg-amber-500/16 border-amber-500/50 text-amber-950 dark:text-amber-100 hover:bg-amber-500/28 dark:hover:bg-amber-500/22"
                  }`}
                  title="Copy job link"
                >
                  {copied ? (
                    <>
                      <svg
                        className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-300"
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
                      <span>Copied</span>
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
                      Copy job link
                    </>
                  )}
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
          </>
        )}

        <div className="border border-border rounded-xl [overflow:clip] flex flex-col flex-1 min-h-0">
          <AnnotationJobView
            token={token}
            mode="admin"
            fillViewport={false}
            onLoaded={handleLoaded}
            onVisibleItemsChange={handleVisibleItemsChange}
          />
        </div>
      </div>
    </AppLayout>
  );
}

