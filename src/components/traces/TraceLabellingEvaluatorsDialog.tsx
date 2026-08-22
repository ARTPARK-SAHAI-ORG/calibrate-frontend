"use client";

import React, { useState } from "react";
import { useHideFloatingButton } from "@/components/AppLayout";
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

  const { evaluators, preselectedUuids, isLoading, error } =
    useAgentLlmEvaluators({
      agentUuid,
      accessToken,
      enabled: isOpen,
      agentNature,
    });
  // Null until the reader ticks something: until then the agent's own
  // evaluators are what is selected.
  const [picked, setPicked] = useState<Set<string> | null>(null);
  const selected = picked ?? preselectedUuids;

  if (!isOpen) return null;

  const canContinue = !isLoading && selected.size > 0;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
      <div className="bg-background rounded-xl w-full max-w-6xl max-h-[85vh] flex flex-col shadow-2xl">
        <div className="p-5 md:p-6 border-b border-border">
          <h2 className="text-base md:text-lg font-semibold text-foreground">
            Submit traces for labelling
          </h2>
          <p className="text-sm text-muted-foreground mt-1">
            Pick at least one evaluator. Annotators score the agent&apos;s{" "}
            {agentNature === "general" ? "output" : "reply"} against these.
          </p>
        </div>

        <div className="flex-1 overflow-y-auto p-5 md:p-6 space-y-5">
          {isLoading ? (
            <LoadingState />
          ) : (
            <>
              <div className="space-y-2">
                <div className="text-sm font-semibold text-foreground">
                  Evaluators
                </div>
                <EvaluatorPicker
                  evaluators={evaluators}
                  selectedIds={selected}
                  onToggle={(uuid) =>
                    setPicked((prev) => toggle(prev ?? preselectedUuids, uuid))
                  }
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
  );
}
