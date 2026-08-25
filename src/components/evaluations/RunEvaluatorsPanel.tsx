"use client";

import { useEffect, useRef, useState } from "react";
import { AddEvaluatorsDialog } from "@/components/agent-tabs/AddEvaluatorsDialog";
import { CreateEvaluatorFlow } from "@/components/evaluators/CreateEvaluatorFlow";
import { EvaluatorPreviewModal } from "@/components/evaluators/EvaluatorPreviewModal";
import { PreBuiltPill } from "@/components/EvaluatorPills";
import { isDefaultEvaluator, type EvaluatorData } from "@/lib/evaluatorApi";
import type { EvaluatorType } from "@/components/EvaluatorPills";

// Same fixed tints the agent's Evaluators tab uses, so the two read alike.
const ADD_BUTTON_CLASS =
  "h-9 md:h-10 px-3 md:px-4 rounded-md text-sm md:text-base font-medium border cursor-pointer transition-colors bg-indigo-500/12 border-indigo-500/45 text-indigo-950 dark:text-indigo-100 hover:bg-indigo-500/22 dark:hover:bg-indigo-500/18";
const CREATE_BUTTON_CLASS =
  "h-9 md:h-10 px-3 md:px-4 rounded-md text-sm md:text-base font-medium border cursor-pointer transition-colors bg-emerald-500/12 border-emerald-500/45 text-emerald-950 dark:text-emerald-100 hover:bg-emerald-500/22 dark:hover:bg-emerald-500/18";

type RunEvaluatorsPanelProps = {
  /** The kind this run can use: `stt`, `tts`, or `conversation` on a simulation. */
  evaluatorType: Extract<EvaluatorType, "stt" | "tts" | "conversation">;
  /** Every evaluator of that kind in the library. */
  available: EvaluatorData[];
  isLoading: boolean;
  /** The ones chosen for this run, in the order they were added. */
  selectedUuids: string[];
  onSelectedChange: (next: string[]) => void;
  /** Re-read the library, so a newly created evaluator shows up. */
  onRefresh: () => void;
  /** One line under the tab saying what these evaluators do here. */
  description: string;
  /** Show the chosen evaluators with nothing to add, create or remove. */
  readOnly?: boolean;
  /** Anything that belongs above the cards, such as what a run always measures. */
  beforeList?: React.ReactNode;
};

/**
 * The evaluators chosen for one run, laid out like the agent's Evaluators tab
 * with the same add and create actions. Used by the Speech-to-Text and
 * Text-to-Speech Evaluators tabs and by the simulation setup.
 *
 * Nothing is saved here. A run does not exist until it is started, so the
 * choice lives in the page until then and is sent with the run.
 */
export function RunEvaluatorsPanel({
  evaluatorType,
  available,
  isLoading,
  selectedUuids,
  onSelectedChange,
  onRefresh,
  description,
  readOnly = false,
  beforeList,
}: RunEvaluatorsPanelProps) {
  const [addDialogOpen, setAddDialogOpen] = useState(false);
  const [createFlowOpen, setCreateFlowOpen] = useState(false);
  const [previewEvaluator, setPreviewEvaluator] = useState<{
    uuid: string;
    name: string;
  } | null>(null);

  const byUuid = new Map(available.map((e) => [e.uuid, e]));
  // Keep the order they were added in, and drop any that no longer exist.
  const selected = selectedUuids
    .map((uuid) => byUuid.get(uuid))
    .filter((e): e is EvaluatorData => !!e);

  // A chosen evaluator that is not in the library any more (deleted since a
  // simulation was set up, say) would have no card yet still be sent with the
  // run. Take it out of the choice, once, so the cards and what is sent agree.
  // Only after a library has actually arrived, and only once, so a re-read
  // after creating an evaluator cannot drop the new one.
  const prunedRef = useRef(false);
  useEffect(() => {
    if (prunedRef.current || isLoading || available.length === 0) return;
    prunedRef.current = true;
    const known = new Set(available.map((e) => e.uuid));
    const kept = selectedUuids.filter((uuid) => known.has(uuid));
    if (kept.length !== selectedUuids.length) onSelectedChange(kept);
  }, [isLoading, available, selectedUuids, onSelectedChange]);
  const unselected = available.filter((e) => !selectedUuids.includes(e.uuid));

  const headerButtons = readOnly ? null : (
    <div className="flex flex-wrap items-center gap-2 md:gap-3">
      <button
        type="button"
        onClick={() => setAddDialogOpen(true)}
        className={ADD_BUTTON_CLASS}
      >
        Add evaluators
      </button>
      <button
        type="button"
        onClick={() => setCreateFlowOpen(true)}
        className={CREATE_BUTTON_CLASS}
      >
        Create evaluator
      </button>
    </div>
  );

  return (
    <div className="flex flex-col">
      {selected.length > 0 && (
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-5 md:mb-6">
          <p className="text-sm md:text-base font-medium text-foreground">
            {description}
          </p>
          {headerButtons}
        </div>
      )}

      {beforeList && <div className="mb-5 md:mb-6">{beforeList}</div>}

      {isLoading ? (
        <div className="flex-1 border border-border rounded-xl p-6 md:p-12 flex items-center justify-center bg-muted/20">
          <svg className="w-5 h-5 animate-spin" fill="none" viewBox="0 0 24 24">
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
        </div>
      ) : selected.length === 0 ? (
        <div className="flex-1 border border-border rounded-xl p-6 md:p-12 flex flex-col items-center justify-center bg-muted/20">
          <h3 className="text-base md:text-lg font-semibold text-foreground mb-1">
            No evaluators added
          </h3>
          <p className="text-sm md:text-base text-muted-foreground mb-3 md:mb-4 text-center max-w-md">
            {description}
            {readOnly
              ? "."
              : ". Add one from your library or create a new one."}
          </p>
          {headerButtons}
        </div>
      ) : (
        <div className="space-y-3 md:space-y-4">
          {selected.map((evaluator) => (
            <div
              key={evaluator.uuid}
              className="relative border border-border rounded-xl bg-background dark:bg-muted px-4 py-3 md:px-5 md:py-3 transition-colors cursor-pointer hover:bg-muted/20 dark:hover:bg-accent"
            >
              {/* Covers the whole card so it behaves like a button: clicking
                  anywhere opens how the evaluator judges, and the buttons
                  still sit above it. */}
              <button
                type="button"
                aria-label={`Open ${evaluator.name}`}
                onClick={() =>
                  setPreviewEvaluator({
                    uuid: evaluator.uuid,
                    name: evaluator.name,
                  })
                }
                className="absolute inset-0 rounded-xl z-0 cursor-pointer"
              />
              <div className="relative z-10 pointer-events-none flex items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <h3 className="text-base font-semibold text-foreground">
                      {evaluator.name}
                    </h3>
                    {isDefaultEvaluator(evaluator) && <PreBuiltPill />}
                  </div>
                  {evaluator.description && (
                    <p className="text-sm text-muted-foreground mt-0.5">
                      {evaluator.description}
                    </p>
                  )}
                </div>
                <div className="flex items-center gap-1 flex-shrink-0 pointer-events-auto">
                  {/* Same buttons as the agent's Evaluators tab. Opens over
                      the run being set up rather than leaving the page. */}
                  <button
                    type="button"
                    onClick={() =>
                      setPreviewEvaluator({
                        uuid: evaluator.uuid,
                        name: evaluator.name,
                      })
                    }
                    className="h-8 md:h-9 px-3 rounded-md text-xs md:text-sm font-medium border border-border bg-background hover:bg-muted/50 transition-colors cursor-pointer inline-flex items-center"
                    title="View evaluator"
                  >
                    View
                  </button>
                  {!readOnly && (
                    <button
                      type="button"
                      onClick={() =>
                        onSelectedChange(
                          selectedUuids.filter(
                            (uuid) => uuid !== evaluator.uuid,
                          ),
                        )
                      }
                      className="h-8 md:h-9 px-3 rounded-md text-xs md:text-sm font-medium border border-border bg-background hover:bg-muted/50 transition-colors cursor-pointer"
                      title="Remove from this run"
                    >
                      Remove
                    </button>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      <AddEvaluatorsDialog
        isOpen={addDialogOpen}
        availableEvaluators={unselected}
        description="Choose evaluators from your library to use in this run"
        allowConversationType={evaluatorType === "conversation"}
        onClose={() => setAddDialogOpen(false)}
        onCreateEvaluator={() => setCreateFlowOpen(true)}
        onAdd={(uuids) => {
          onSelectedChange([...selectedUuids, ...uuids]);
          setAddDialogOpen(false);
        }}
      />

      <CreateEvaluatorFlow
        open={createFlowOpen}
        onClose={() => setCreateFlowOpen(false)}
        existingEvaluators={available}
        useCaseTypes={[evaluatorType]}
        onCreated={(evaluator) => {
          setCreateFlowOpen(false);
          // A new evaluator is chosen for this run straight away, and the
          // library is re-read so its card can be drawn.
          onSelectedChange([...selectedUuids, evaluator.uuid]);
          onRefresh();
        }}
      />

      <EvaluatorPreviewModal
        evaluatorUuid={previewEvaluator?.uuid ?? null}
        evaluatorName={previewEvaluator?.name}
        onClose={() => setPreviewEvaluator(null)}
      />
    </div>
  );
}
