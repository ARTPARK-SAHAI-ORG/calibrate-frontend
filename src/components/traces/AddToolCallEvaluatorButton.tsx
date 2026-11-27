"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { toast } from "sonner";
import { AddEvaluatorsDialog } from "@/components/agent-tabs/AddEvaluatorsDialog";
import { CreateEvaluatorFlow } from "@/components/evaluators/CreateEvaluatorFlow";
import { Button } from "@/components/ui/Button";
import {
  addEvaluatorsToAgent,
  fetchAllEvaluators,
  type EvaluatorData,
} from "@/lib/evaluatorApi";
import { reportError } from "@/lib/reportError";

/**
 * "Add a tool call evaluator", and the picker it opens: every tool-call
 * evaluator in the workspace, or a way to create one when there are none.
 * It is shown only while the agent has none linked. The windows are drawn on
 * the page body so they are not trapped inside a dialog they open from.
 */
export function AddToolCallEvaluatorButton({
  agentUuid,
  accessToken,
  onAdded,
  onOpenChange,
  asButton = false,
}: {
  agentUuid: string;
  accessToken: string | null;
  onAdded: () => void;
  /** Told when a window this button opened appears or goes away. */
  onOpenChange?: (open: boolean) => void;
  /** A button on its own, rather than a link inside a sentence. */
  asButton?: boolean;
}) {
  const [pickerOpen, setPickerOpen] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);
  const [library, setLibrary] = useState<EvaluatorData[]>([]);
  const available = library.filter((e) => e.evaluator_type === "tool-call");

  const windowOpen = pickerOpen || createOpen;
  useEffect(() => {
    if (!windowOpen) return;
    onOpenChange?.(true);
    return () => onOpenChange?.(false);
  }, [windowOpen, onOpenChange]);

  const add = async (uuids: string[]) => {
    if (!accessToken) return;
    await addEvaluatorsToAgent(agentUuid, uuids, accessToken);
    onAdded();
  };

  const [loading, setLoading] = useState(false);
  // With exactly one tool call evaluator there is nothing to choose, so it is
  // added straight away. With none or several, the picker opens.
  const open = async () => {
    if (!accessToken || loading) return;
    setLoading(true);
    try {
      const all = await fetchAllEvaluators(accessToken);
      setLibrary(all);
      const toolCall = all.filter((e) => e.evaluator_type === "tool-call");
      if (toolCall.length === 1) {
        try {
          await add([toolCall[0].uuid]);
          toast.success(`Added ${toolCall[0].name} to this agent`);
        } catch (err) {
          reportError("Error adding the tool call evaluator:", err);
          toast.error(
            "Could not add the tool call evaluator. Please try again.",
          );
        }
        return;
      }
    } catch (err) {
      reportError("Error fetching tool call evaluators:", err);
      toast.error("Could not load your evaluators. Please try again.");
      return;
    } finally {
      setLoading(false);
    }
    setPickerOpen(true);
  };

  const addCreated = async (evaluator: EvaluatorData) => {
    setLibrary((prev) => [...prev, evaluator]);
    try {
      await add([evaluator.uuid]);
      toast.success(`Added ${evaluator.name} to this agent`);
    } catch (err) {
      reportError("Error attaching created evaluator:", err);
      toast.error("Could not add the new evaluator to this agent.");
    }
  };

  return (
    <>
      {asButton ? (
        <Button size="sm" onClick={() => void open()} isLoading={loading}>
          Add a tool call evaluator
        </Button>
      ) : (
        <button
          type="button"
          onClick={() => void open()}
          className="font-semibold cursor-pointer hover:opacity-80"
        >
          Add a tool call evaluator
        </button>
      )}
      {pickerOpen &&
        createPortal(
          <AddEvaluatorsDialog
            isOpen
            availableEvaluators={available}
            description="Choose tool call evaluators from your library to add to this agent"
            emptyMessage="Your workspace has no tool call evaluators yet."
            onClose={() => setPickerOpen(false)}
            onEvaluatorDeleted={(uuid) =>
              setLibrary((prev) => prev.filter((e) => e.uuid !== uuid))
            }
            onCreateEvaluator={() => setCreateOpen(true)}
            onAdd={add}
          />,
          document.body,
        )}
      {createOpen &&
        createPortal(
          <CreateEvaluatorFlow
            open
            onClose={() => setCreateOpen(false)}
            existingEvaluators={library}
            onCreated={(evaluator) => void addCreated(evaluator)}
            useCaseTypes={["tool-call"]}
          />,
          document.body,
        )}
    </>
  );
}
