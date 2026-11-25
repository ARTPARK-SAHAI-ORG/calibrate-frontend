"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { toast } from "sonner";
import { AddEvaluatorsDialog } from "@/components/agent-tabs/AddEvaluatorsDialog";
import { CreateEvaluatorFlow } from "@/components/evaluators/CreateEvaluatorFlow";
import {
  addEvaluatorsToAgent,
  fetchAllEvaluators,
  type EvaluatorData,
} from "@/lib/evaluatorApi";
import { reportError } from "@/lib/reportError";

/**
 * "Add a tool call evaluator", and the picker it opens: every tool-call
 * evaluator in the workspace that this agent does not have yet, or a way to
 * create one when there are none. The windows are drawn on the page body so
 * they are not trapped inside a dialog they open from.
 */
export function AddToolCallEvaluatorButton({
  agentUuid,
  accessToken,
  linkedEvaluatorUuids,
  onAdded,
  onOpenChange,
}: {
  agentUuid: string;
  accessToken: string | null;
  linkedEvaluatorUuids: string[];
  onAdded: () => void;
  /** Told when a window this button opened appears or goes away. */
  onOpenChange?: (open: boolean) => void;
}) {
  const [pickerOpen, setPickerOpen] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);
  const [library, setLibrary] = useState<EvaluatorData[]>([]);
  const available = library.filter(
    (e) =>
      e.evaluator_type === "tool-call" &&
      !linkedEvaluatorUuids.includes(e.uuid),
  );

  const show = (picker: boolean, create: boolean) => {
    setPickerOpen(picker);
    setCreateOpen(create);
    onOpenChange?.(picker || create);
  };
  // Adding one can remove this button while a window is still open, and the
  // parent must not be left thinking it is.
  const closeOnUnmount = useRef<() => void>(() => {});
  closeOnUnmount.current = () => {
    if (pickerOpen || createOpen) onOpenChange?.(false);
  };
  useEffect(() => () => closeOnUnmount.current(), []);

  const open = async () => {
    if (!accessToken) return;
    try {
      setLibrary(await fetchAllEvaluators(accessToken));
    } catch (err) {
      reportError("Error fetching tool call evaluators:", err);
      toast.error("Could not load your evaluators. Please try again.");
      return;
    }
    show(true, false);
  };

  const add = async (uuids: string[]) => {
    if (!accessToken) return;
    await addEvaluatorsToAgent(agentUuid, uuids, accessToken);
    onAdded();
  };

  const addCreated = async (evaluator: EvaluatorData) => {
    try {
      await add([evaluator.uuid]);
    } catch (err) {
      reportError("Error attaching created evaluator:", err);
      toast.error("Could not add the new evaluator to this agent.");
    } finally {
      show(false, false);
    }
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
      {pickerOpen &&
        createPortal(
          <AddEvaluatorsDialog
            isOpen
            availableEvaluators={available}
            description="Choose tool call evaluators from your library to add to this agent"
            onClose={() => show(false, false)}
            onEvaluatorDeleted={(uuid) =>
              setLibrary((prev) => prev.filter((e) => e.uuid !== uuid))
            }
            onCreateEvaluator={() => show(false, true)}
            onAdd={add}
          />,
          document.body,
        )}
      {createOpen &&
        createPortal(
          <CreateEvaluatorFlow
            open
            onClose={() => show(false, false)}
            existingEvaluators={library}
            onCreated={(evaluator) => void addCreated(evaluator)}
            useCaseTypes={["tool-call"]}
          />,
          document.body,
        )}
    </>
  );
}
