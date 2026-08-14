"use client";

import { useState } from "react";
import { useHideFloatingButton } from "@/components/AppLayout";
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
 * filters leave visible, lets you untick any you do not want, and then reuses
 * the same annotator picker and the same create call as the task page, so a
 * job made here is identical to one made there.
 */

export type ReviewItem = {
  uuid: string;
  payload: unknown;
};

export type ReviewEvaluator = {
  uuid: string;
  name: string;
  description?: string | null;
};

/**
 * A page hands its visible items to this slot. Kept structural (uuid +
 * payload) so both pages can pass their own item type unchanged.
 */
export type ReviewSlot = (visibleItems: ReviewItem[]) => React.ReactNode;

type SendForReviewFlowProps = {
  accessToken: string;
  taskUuid: string;
  /** The items the page's filters currently leave visible. */
  items: ReviewItem[];
  /** The labels on screen — the pool a new job can be limited to. */
  evaluators: ReviewEvaluator[];
  /**
   * Items the page was showing that are no longer part of the task, so cannot
   * go into a new job. Reported to the user rather than silently dropped.
   */
  droppedCount?: number;
};

/**
 * Builds the slot the labelling job page and the evaluation run page hand to
 * their item view. Both pages show items from their own saved copy, which can
 * include items since removed from the task, and neither can send those. This
 * keeps that rule, and the decision to draw nothing at all, in one place.
 *
 * Returning `undefined` (page not ready) or `null` (nothing to show) matters:
 * the pages use it to decide whether the filter row appears, and a row with
 * nothing in it is a bare strip on screen.
 */
export function buildSendForReviewSlot({
  accessToken,
  taskUuid,
  taskItemIds,
  evaluators,
}: {
  accessToken: string | null | undefined;
  taskUuid: string;
  /** The items still on the task. */
  taskItemIds: Set<string>;
  evaluators: ReviewEvaluator[];
}): ReviewSlot | undefined {
  if (!accessToken || !taskUuid) return undefined;
  const token: string = accessToken;
  function renderSendForReview(visibleItems: ReviewItem[]): React.ReactNode {
    const sendable = visibleItems.filter((it) => taskItemIds.has(it.uuid));
    const droppedCount = visibleItems.length - sendable.length;
    if (sendable.length === 0 && droppedCount === 0) return null;
    return (
      <SendForReviewFlow
        accessToken={token}
        taskUuid={taskUuid}
        items={sendable}
        evaluators={evaluators}
        droppedCount={droppedCount}
      />
    );
  }
  return renderSendForReview;
}

/** One wording for the removed-items note, wherever it is shown. */
function droppedNote(count: number): string {
  return count === 1
    ? "1 item was removed from this task, so it cannot be sent for review."
    : `${count} items were removed from this task, so they cannot be sent for review.`;
}

/** The item's own name when it has one, otherwise its position in the list. */
export function reviewItemLabel(item: ReviewItem, index: number): string {
  const payload = item.payload;
  if (payload && typeof payload === "object") {
    const name = (payload as { name?: unknown }).name;
    if (typeof name === "string" && name.trim()) return name.trim();
  }
  return `Item ${index + 1}`;
}

export function SendForReviewFlow({
  accessToken,
  taskUuid,
  items,
  evaluators,
  droppedCount = 0,
}: SendForReviewFlowProps) {
  const [step, setStep] = useState<"closed" | "items" | "annotators">("closed");
  const [ticked, setTicked] = useState<Set<string>>(() => new Set());
  const [createdJobs, setCreatedJobs] = useState<CreatedJob[] | null>(null);

  useHideFloatingButton(step === "items");

  // Every item starts ticked: sending the whole filtered set is the common
  // case, unticking a few is the exception. Seeded here rather than whenever
  // the picker shows, so stepping back from the annotator step to change the
  // ticks does not throw away the ones already taken off.
  const openPicker = () => {
    setTicked(new Set(items.map((it) => it.uuid)));
    setStep("items");
  };

  const tickedItems = items.filter((it) => ticked.has(it.uuid));

  const allTicked = items.length > 0 && tickedItems.length === items.length;

  const toggle = (uuid: string) =>
    setTicked((prev) => {
      const next = new Set(prev);
      if (next.has(uuid)) next.delete(uuid);
      else next.add(uuid);
      return next;
    });

  const toggleAll = () =>
    setTicked(allTicked ? new Set() : new Set(items.map((it) => it.uuid)));

  const handleConfirm = async (
    annotatorIds: string[],
    evaluatorIds: string[] | null,
  ) => {
    // Errors thrown here are caught and shown by AssignAnnotatorsDialog.
    const result = await apiClient<{ jobs: CreatedJob[] }>(
      `/annotation-tasks/${taskUuid}/jobs`,
      accessToken,
      {
        method: "POST",
        body: {
          annotator_ids: annotatorIds,
          ...(evaluatorIds && evaluatorIds.length > 0
            ? { evaluator_ids: evaluatorIds }
            : {}),
          item_ids: tickedItems.map((it) => it.uuid),
        },
      },
    );
    setStep("closed");
    setCreatedJobs(result.jobs ?? []);
  };

  if (items.length === 0) {
    // Nothing can be sent. When that is because the items were taken out of
    // the task, say so here: the button would be dead and its explanation is
    // inside a dialog the user could not open.
    if (droppedCount === 0) return null;
    return (
      <p className="text-xs text-amber-600 dark:text-amber-400">
        {droppedNote(droppedCount)}
      </p>
    );
  }

  return (
    <>
      <button
        type="button"
        onClick={openPicker}
        title="Create labelling jobs from the items shown"
        className="h-8 px-3 rounded-md text-xs font-medium border border-foreground/20 bg-muted/60 text-foreground hover:bg-muted hover:border-foreground/30 transition-colors cursor-pointer"
      >
        Send {items.length} item{items.length === 1 ? "" : "s"} for review
      </button>

      {step === "items" && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4"
          onClick={() => setStep("closed")}
        >
          <div
            className="bg-background border border-border rounded-xl shadow-2xl w-full max-w-lg flex flex-col max-h-[90vh]"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="px-6 py-4 border-b border-border flex items-center justify-between">
              <div>
                <h2 className="text-lg font-semibold">Send for review</h2>
                <p className="text-xs text-muted-foreground mt-1">
                  Pick the items to send. Annotators are chosen next.
                </p>
              </div>
              <button
                type="button"
                aria-label="Close"
                onClick={() => setStep("closed")}
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

            <div className="p-4 md:p-6 space-y-2 overflow-y-auto">
              {droppedCount > 0 && (
                <p className="text-xs text-amber-600 dark:text-amber-400">
                  {droppedNote(droppedCount)}
                </p>
              )}
              {items.length > 1 && (
                <label className="flex items-center gap-3 px-3 py-2 cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={allTicked}
                    ref={(el) => {
                      if (el)
                        el.indeterminate = tickedItems.length > 0 && !allTicked;
                    }}
                    onChange={toggleAll}
                    aria-label={allTicked ? "Unselect all" : "Select all"}
                    className="w-4 h-4 cursor-pointer accent-foreground"
                  />
                  <span className="text-xs font-medium text-muted-foreground">
                    {allTicked ? "Unselect all" : "Select all"}
                  </span>
                </label>
              )}
              {items.map((item, index) => (
                <label
                  key={item.uuid}
                  className="flex items-center gap-3 px-3 py-2 rounded-md border border-border hover:bg-muted/30 transition-colors cursor-pointer"
                >
                  <input
                    type="checkbox"
                    checked={ticked.has(item.uuid)}
                    onChange={() => toggle(item.uuid)}
                    className="w-4 h-4 cursor-pointer accent-foreground"
                  />
                  <span className="text-sm font-medium truncate">
                    {reviewItemLabel(item, index)}
                  </span>
                </label>
              ))}
            </div>

            <div className="px-6 py-4 border-t border-border flex items-center justify-between gap-3">
              <span className="text-xs text-muted-foreground">
                {tickedItems.length} of {items.length} selected
              </span>
              <div className="flex items-center gap-3">
                <button
                  type="button"
                  onClick={() => setStep("closed")}
                  className="h-10 px-4 rounded-md text-sm font-medium border border-border bg-background hover:bg-muted/50 transition-colors cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={() => setStep("annotators")}
                  disabled={tickedItems.length === 0}
                  className="h-10 px-4 rounded-md text-sm font-medium bg-foreground text-background hover:opacity-90 transition-opacity cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  Next
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      <AssignAnnotatorsDialog
        isOpen={step === "annotators"}
        accessToken={accessToken}
        evaluators={evaluators}
        onClose={() => setStep("items")}
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
