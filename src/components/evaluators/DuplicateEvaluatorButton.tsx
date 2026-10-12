"use client";

import { useState } from "react";
import { createPortal } from "react-dom";
import { toast } from "sonner";
import { useAccessToken } from "@/hooks";
import { useOrgUuid } from "@/lib/nav";
import { withWorkspace } from "@/lib/routes";
import { reportError } from "@/lib/reportError";
import {
  fetchAllEvaluators,
  fetchEvaluatorDetail,
  type EvaluatorData,
  type EvaluatorDetail,
} from "@/lib/evaluatorApi";
import type { EvaluatorType } from "@/components/EvaluatorPills";
import { CopyIcon, SpinnerIcon } from "@/components/icons";
import { CreateEvaluatorFlow } from "./CreateEvaluatorFlow";

/** The card button every evaluator list draws: View, Duplicate, Delete. */
export const EVALUATOR_CARD_BUTTON_CLASS =
  "h-8 md:h-9 px-3 rounded-md text-xs md:text-sm font-medium border border-border bg-background hover:bg-muted/50 transition-colors cursor-pointer inline-flex items-center gap-1.5 disabled:cursor-not-allowed disabled:opacity-50";

type DuplicateEvaluatorButtonProps = {
  evaluator: {
    uuid: string;
    name: string;
    evaluator_type?: EvaluatorType | null;
  };
  /**
   * What happens once the copy is created. Without it, a toast names the new
   * evaluator and offers to open its page.
   */
  onCreated?: (evaluator: EvaluatorData) => void;
  className?: string;
};

/**
 * Duplicate, wherever an evaluator is shown. Creates nothing on its own: it
 * reads the evaluator in full (the lists carry no prompt text) and opens the
 * create form filled in as a copy, so the reader changes what they like
 * before pressing Create.
 */
export function DuplicateEvaluatorButton({
  evaluator,
  onCreated,
  className = EVALUATOR_CARD_BUTTON_CLASS,
}: DuplicateEvaluatorButtonProps) {
  const accessToken = useAccessToken();
  const org = useOrgUuid();
  const [isReading, setIsReading] = useState(false);
  const [source, setSource] = useState<EvaluatorDetail | null>(null);
  // For the name check in the form, read alongside the evaluator itself.
  const [existing, setExisting] = useState<EvaluatorData[]>([]);

  const start = async () => {
    if (!accessToken) return;
    try {
      setIsReading(true);
      const [detail, all] = await Promise.all([
        fetchEvaluatorDetail(evaluator.uuid, accessToken),
        fetchAllEvaluators(accessToken),
      ]);
      setExisting(all);
      // The list already says what kind it is; the detail may leave it out.
      setSource({
        ...detail,
        evaluator_type:
          detail.evaluator_type ?? evaluator.evaluator_type ?? undefined,
      });
    } catch (err) {
      reportError("Error reading evaluator:", err);
      toast.error("Could not read the evaluator to copy it");
    } finally {
      setIsReading(false);
    }
  };

  const handleCreated = (created: EvaluatorData) => {
    if (onCreated) {
      onCreated(created);
      return;
    }
    toast.success(`Created ${created.name}`, {
      action: {
        label: "Open it",
        // A new tab, the same as Open and Edit in the preview window, so
        // a test being written behind it is not lost.
        onClick: () =>
          window.open(
            withWorkspace(`/evaluators/${created.uuid}`, org),
            "_blank",
            "noopener,noreferrer",
          ),
      },
    });
  };

  return (
    <>
      <button
        type="button"
        onClick={start}
        disabled={isReading}
        className={className}
      >
        {isReading ? (
          <SpinnerIcon className="w-4 h-4 animate-spin" />
        ) : (
          <CopyIcon className="w-4 h-4" />
        )}
        Duplicate
      </button>
      {/* Drawn at the top of the page, above every window that can hold
          this button: inside a card it would sit under the next card. */}
      {source &&
        createPortal(
          <div className="relative z-[170]">
            <CreateEvaluatorFlow
              open
              duplicateOf={source}
              existingEvaluators={existing}
              onClose={() => setSource(null)}
              onCreated={handleCreated}
            />
          </div>,
          document.body,
        )}
    </>
  );
}
