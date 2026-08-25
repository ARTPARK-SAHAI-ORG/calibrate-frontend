"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useParams, useRouter } from "@/lib/nav";
import { AppLayout } from "@/components/AppLayout";
import { Breadcrumbs, type Crumb } from "@/components/ui";
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

  const crumbs: Crumb[] = [
    { label: "Human alignment", href: "/human-alignment?tab=tasks" },
    {
      label: meta?.task.name ?? "Task",
      href: meta
        ? `/human-alignment/tasks/${meta.task.uuid}?tab=jobs`
        : undefined,
    },
    { label: meta?.annotator.name ?? "Labelling job" },
  ];
  const customHeader = <Breadcrumbs items={crumbs} />;

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
        {/* AppLayout hides `customHeader` below md, so repeat the trail here. */}
        <Breadcrumbs items={crumbs} className="md:hidden" />

        {meta && (
          /* The person who labelled this job, with how far they have got
             beside their name, and the page's action buttons pinned to the
             far right of that same short line. The scores and the line
             explaining them wait until labelling has started, since there
             is nothing to count before that. The cards always get the full
             width of the page on the line below, so they are never squeezed
             into whatever space is left before the buttons. */
          <EvaluatorScoreCards
            heading={meta.annotator.name || HUMAN_SCORES_HEADING}
            description={
              meta.jobStatus === "pending" ? "" : HUMAN_SCORES_DESCRIPTION
            }
            cards={meta.jobStatus === "pending" ? NO_SCORES : meta.humanScores}
            headingAside={statusPill}
            actions={
              <>
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
              </>
            }
            showWhenEmpty
            singleRow
          />
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

