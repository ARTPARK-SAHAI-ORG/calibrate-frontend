"use client";

import React, { useState } from "react";
import { useHideFloatingButton } from "@/components/AppLayout";
import { CreateEvaluatorFlow } from "@/components/evaluators/CreateEvaluatorFlow";
import { EvaluatorPicker } from "@/components/evaluators/EvaluatorPicker";
import { LoadingState } from "@/components/ui";
import { useAgentLlmEvaluators } from "@/hooks/useAgentLlmEvaluators";

type TraceLabellingEvaluatorsDialogProps = {
  isOpen: boolean;
  onClose: () => void;
  /** The agent whose traces are being sent, used to seed the selection. */
  agentUuid: string;
  /** Decides which kind of evaluator can judge these traces. */
  agentNature?: "conversation" | "general";
  accessToken: string | null;
  /** Called with the chosen evaluators when the reader continues. */
  onChosen: (evaluators: { uuid: string; name?: string }[]) => void;
};

function toggle(set: Set<string>, uuid: string): Set<string> {
  const next = new Set(set);
  if (next.has(uuid)) next.delete(uuid);
  else next.add(uuid);
  return next;
}

/**
 * The first step of sending traces for labelling: which evaluators annotators
 * should score each trace against. Kept separate from the add-to-task dialog
 * because that one needs its items ready before it opens.
 */
export function TraceLabellingEvaluatorsDialog({
  isOpen,
  onClose,
  agentUuid,
  agentNature = "conversation",
  accessToken,
  onChosen,
}: TraceLabellingEvaluatorsDialogProps) {
  useHideFloatingButton(isOpen);

  const { evaluators, preselectedUuids, isLoading, error, addEvaluator } =
    useAgentLlmEvaluators({
      agentUuid,
      accessToken,
      enabled: isOpen,
      agentNature,
    });
  // Null until the reader ticks something: until then the agent's own
  // evaluators are what is selected.
  const [picked, setPicked] = useState<Set<string> | null>(null);
  const [createFlowOpen, setCreateFlowOpen] = useState(false);
  // The evaluator made from inside this dialog, so its prompt opens on the
  // right as well as its box being ticked.
  const [createdUuid, setCreatedUuid] = useState<string | null>(null);
  const selected = picked ?? preselectedUuids;

  if (!isOpen) return null;

  const canContinue = !isLoading && selected.size > 0;

  return (
    <>
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
        <div className="bg-background rounded-xl w-full max-w-6xl max-h-[90vh] md:h-[85vh] flex flex-col shadow-2xl">
          <div className="p-5 md:p-6 border-b border-border">
            <h2 className="text-base md:text-lg font-semibold text-foreground">
              Submit traces for labelling
            </h2>
            <p className="text-sm text-muted-foreground mt-1">
              Pick at least one evaluator. Annotators score the agent&apos;s{" "}
              {agentNature === "general" ? "output" : "reply"} against these.
            </p>
          </div>

          <div className="flex-1 min-h-0 overflow-y-auto md:overflow-hidden p-5 md:p-6 flex flex-col gap-2">
            {isLoading ? (
              <LoadingState />
            ) : (
              <>
                {evaluators.length > 0 && (
                  <div className="flex items-center justify-between gap-3">
                    <div className="text-sm font-semibold text-foreground">
                      Evaluators
                    </div>
                    {/* The same offer the empty picker makes, kept in reach
                        once there is a list to read. */}
                    <button
                    type="button"
                    onClick={() => setCreateFlowOpen(true)}
                    className="h-8 px-3 rounded-md text-xs md:text-sm font-medium border cursor-pointer transition-colors bg-emerald-500/12 border-emerald-500/45 text-emerald-950 dark:text-emerald-100 hover:bg-emerald-500/22 dark:hover:bg-emerald-500/18"
                    >
                    Create evaluator
                  </button>
                  </div>
                )}
                <div className="flex-1 min-h-0">
                  <EvaluatorPicker
                    evaluators={evaluators}
                    selectedIds={selected}
                    onToggle={(uuid) =>
                      setPicked((prev) =>
                        toggle(prev ?? preselectedUuids, uuid),
                      )
                    }
                    emptyMessage={
                      agentNature === "general"
                        ? "Annotators score each trace against at least one evaluator. Your workspace has none that score a single output, so create one to continue."
                        : "Annotators score each trace against at least one evaluator. Your workspace has none that score a reply in a conversation, so create one to continue."
                    }
                    emptyAction={
                      <button
                        type="button"
                        onClick={() => setCreateFlowOpen(true)}
                        className="h-9 md:h-10 px-3 md:px-4 rounded-md text-sm md:text-base font-medium border cursor-pointer transition-colors bg-emerald-500/12 border-emerald-500/45 text-emerald-950 dark:text-emerald-100 hover:bg-emerald-500/22 dark:hover:bg-emerald-500/18"
                      >
                        Create evaluator
                      </button>
                    }
                    previewUuid={createdUuid}
                    fillHeight
                  />
                </div>

                {error && (
                  <p className="text-sm text-red-600 dark:text-red-400">
                    {error}
                  </p>
                )}
              </>
            )}
          </div>

          <div className="flex items-center justify-end gap-2 md:gap-3 p-5 md:p-6 border-t border-border">
            <button
              type="button"
              onClick={onClose}
              className="h-9 md:h-10 px-4 rounded-md text-xs md:text-sm font-medium border border-border bg-background hover:bg-muted/50 transition-colors cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={() =>
                onChosen(
                  evaluators
                    .filter((e) => selected.has(e.uuid))
                    .map((e) => ({ uuid: e.uuid, name: e.name })),
                )
              }
              disabled={!canContinue}
              className="h-9 md:h-10 px-4 rounded-md text-xs md:text-sm font-medium bg-foreground text-background hover:opacity-90 transition-opacity cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Continue
            </button>
          </div>
        </div>
      </div>

      <CreateEvaluatorFlow
        open={createFlowOpen}
        onClose={() => setCreateFlowOpen(false)}
        existingEvaluators={evaluators}
        onCreated={(created) => {
          addEvaluator(created);
          setCreatedUuid(created.uuid);
          // Ticking already started, so the new one has to join that set
          // rather than the untouched default.
          setPicked((prev) => (prev ? new Set(prev).add(created.uuid) : prev));
          setCreateFlowOpen(false);
        }}
        // Single type only, so the flow skips the "what is this for?" step.
        useCaseTypes={agentNature === "general" ? ["llm-general"] : ["llm"]}
      />
    </>
  );
}
