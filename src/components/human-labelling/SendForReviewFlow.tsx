"use client";

import { useState } from "react";
import { apiClient } from "@/lib/api";
import { AssignAnnotatorsDialog } from "./AssignAnnotatorsDialog";
import { JobsCreatedDialog, type CreatedJob } from "./JobsCreatedDialog";

/**
 * "Send for review" — turns the items a page is currently showing into new
 * labelling jobs.
 *
 * The evaluation run page and the labelling job page both let you narrow the
 * items down (by score, or to disagreements only) but had no way to hand that
 * shortlist to a person. This button closes that gap: it takes the items the
 * filters leave visible and reuses the same annotator picker and the same
 * create call as the task page, so a job made here is identical to one made
 * there. Narrowing the set is done with the page's own filters, so the button
 * goes straight to choosing annotators.
 */

export type ReviewItem = {
  uuid: string;
  payload?: unknown;
};

export type ReviewEvaluator = {
  uuid: string;
  name: string;
  description?: string | null;
};

type SendForReviewFlowProps = {
  accessToken: string | null | undefined;
  taskUuid: string;
  /** The items the page's filters currently leave visible. */
  visibleItems: ReviewItem[];
  /**
   * The items still on the task. Both pages show items from their own saved
   * copy, which can include items since removed from the task, and those
   * cannot go into a new job.
   */
  taskItemIds: Set<string>;
  /** The labels on screen — the pool a new job can be limited to. */
  evaluators: ReviewEvaluator[];
};

export function SendForReviewFlow({
  accessToken,
  taskUuid,
  visibleItems,
  taskItemIds,
  evaluators,
}: SendForReviewFlowProps) {
  const [assignOpen, setAssignOpen] = useState(false);
  const [createdJobs, setCreatedJobs] = useState<CreatedJob[] | null>(null);

  const sendable = visibleItems.filter((it) => taskItemIds.has(it.uuid));
  const droppedCount = visibleItems.length - sendable.length;

  const handleConfirm = async (
    annotatorIds: string[],
    evaluatorIds: string[],
  ) => {
    if (!accessToken) return;
    // Errors thrown here are caught and shown by AssignAnnotatorsDialog.
    const result = await apiClient<{ jobs: CreatedJob[] }>(
      `/annotation-tasks/${taskUuid}/jobs`,
      accessToken,
      {
        method: "POST",
        body: {
          annotator_ids: annotatorIds,
          ...(evaluatorIds.length > 0 ? { evaluator_ids: evaluatorIds } : {}),
          item_ids: sendable.map((it) => it.uuid),
        },
      },
    );
    setAssignOpen(false);
    setCreatedJobs(result.jobs ?? []);
  };

  if (!accessToken || !taskUuid || sendable.length === 0) return null;

  return (
    <>
      <button
        type="button"
        onClick={() => setAssignOpen(true)}
        title={
          droppedCount > 0
            ? `Send the items shown to annotators. ${droppedCount} more ${droppedCount === 1 ? "is" : "are"} no longer in this task and cannot be sent.`
            : "Send the items shown to annotators"
        }
        /* Pink, chosen against every colour already on these two rows: teal
           Export, violet Share, blue Public, amber Copy link, and the amber
           warning mark on the cards below. Red and orange are out because
           they read as an error, green because it reads as a status. */
        className="inline-flex items-center gap-1.5 h-8 px-3 rounded-lg text-[13px] font-medium border bg-pink-500/14 border-pink-500/45 text-pink-950 dark:text-pink-100 hover:bg-pink-500/26 dark:hover:bg-pink-500/20 transition-colors cursor-pointer"
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
            d="M15 19.128a9.38 9.38 0 002.625.372 9.337 9.337 0 004.121-.952 4.125 4.125 0 00-7.533-2.493M15 19.128v-.003c0-1.113-.285-2.16-.786-3.07M15 19.128v.106A12.318 12.318 0 018.624 21c-2.331 0-4.512-.645-6.374-1.766l-.001-.109a6.375 6.375 0 0111.964-3.07M12 6.375a3.375 3.375 0 11-6.75 0 3.375 3.375 0 016.75 0zm8.25 2.25a2.625 2.625 0 11-5.25 0 2.625 2.625 0 015.25 0z"
          />
        </svg>
        {/* The explicit space matters: without it the browser reads the label
            and the count as one word, so the button is announced as "Send for
            review3". The count sits in its own chip so the label stays a short
            verb phrase like its neighbours, while still showing that the
            page's filters changed how much would be sent. */}
        Send for review{" "}
        <span className="text-[11px] leading-none px-1.5 py-0.5 rounded-full bg-pink-500/25 text-pink-950 dark:text-pink-100">
          {sendable.length}
        </span>
      </button>

      <AssignAnnotatorsDialog
        isOpen={assignOpen}
        accessToken={accessToken}
        evaluators={evaluators}
        onClose={() => setAssignOpen(false)}
        onConfirm={handleConfirm}
      />

      <JobsCreatedDialog
        isOpen={createdJobs !== null}
        jobs={createdJobs ?? []}
        onClose={() => setCreatedJobs(null)}
      />
    </>
  );
}
