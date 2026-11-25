"use client";

import { useState } from "react";
import { createPortal } from "react-dom";
import { AddEvaluatorsDialog } from "@/components/agent-tabs/AddEvaluatorsDialog";
import {
  addEvaluatorsToAgent,
  fetchAllEvaluators,
  type EvaluatorData,
} from "@/lib/evaluatorApi";
import { reportError } from "@/lib/reportError";

/**
 * "Add a tool call evaluator", and the picker it opens: every tool-call
 * evaluator in the workspace that this agent does not have yet. The picker is
 * drawn on the page body so it is not trapped inside a dialog it opens from.
 */
export function AddToolCallEvaluatorButton({
  agentUuid,
  accessToken,
  linkedEvaluatorUuids,
  onAdded,
}: {
  agentUuid: string;
  accessToken: string | null;
  linkedEvaluatorUuids: string[];
  onAdded: () => void;
}) {
  const [isOpen, setIsOpen] = useState(false);
  const [available, setAvailable] = useState<EvaluatorData[]>([]);

  const open = async () => {
    if (!accessToken) return;
    let all: EvaluatorData[] = [];
    try {
      all = await fetchAllEvaluators(accessToken);
    } catch (err) {
      reportError("Error fetching tool call evaluators:", err);
    }
    setAvailable(
      all.filter(
        (e) =>
          e.evaluator_type === "tool-call" &&
          !linkedEvaluatorUuids.includes(e.uuid),
      ),
    );
    setIsOpen(true);
  };

  const add = async (uuids: string[]) => {
    if (!accessToken) return;
    await addEvaluatorsToAgent(agentUuid, uuids, accessToken);
    onAdded();
  };

  return (
    <>
      <button
        type="button"
        onClick={() => void open()}
        className="font-semibold cursor-pointer hover:opacity-80"
      >
        Add a tool call evaluator
      </button>
      {isOpen &&
        createPortal(
          <AddEvaluatorsDialog
            isOpen
            availableEvaluators={available}
            description="Choose tool call evaluators from your library to add to this agent"
            onClose={() => setIsOpen(false)}
            onEvaluatorDeleted={(uuid) =>
              setAvailable((prev) => prev.filter((e) => e.uuid !== uuid))
            }
            onAdd={add}
          />,
          document.body,
        )}
    </>
  );
}
