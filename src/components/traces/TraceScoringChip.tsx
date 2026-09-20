"use client";

import React, { useState } from "react";
import { Tooltip } from "@/components/Tooltip";
import { CheckIcon, XIcon } from "@/components/icons";
import { TraceScoringConfirmDialog } from "@/components/traces/TraceScoringConfirmDialog";
import { EvaluatorPillList } from "@/components/EvaluatorPillList";
import { EvaluatorPreviewModal } from "@/components/evaluators/EvaluatorPreviewModal";
import type { TraceScoringControls } from "@/hooks/useAgentTraceScoring";
import { ineligibleReasonCopy } from "@/lib/traceScoring";

type TraceScoringChipProps = {
  traceScoring: TraceScoringControls;
};

/**
 * Whether this agent watches its new traces, in two words above the table,
 * with the evaluators behind it under the pill on hover. The switch itself
 * lives in Settings, so this only shows what is happening and the way there.
 */
export function TraceScoringChip({ traceScoring }: TraceScoringChipProps) {
  // What a click on the pill is asking to do, while the confirmation is up.
  const [pending, setPending] = useState<boolean | null>(null);
  // The preview is held here, not in the pill list: the pills live inside the
  // hover popup, which closes on the click that opens the preview.
  const [preview, setPreview] = useState<{ uuid: string; name: string } | null>(
    null,
  );
  const eligible = traceScoring.eligibility?.eligible ?? [];
  const ineligible = traceScoring.eligibility?.ineligible ?? [];

  const panel = (
    <div className="space-y-6 text-left">
      {/* The blue note the trace setup steps use, so a point of information
          reads the same wherever it appears. */}
      <div className="flex items-start gap-2 rounded-md border border-blue-500/20 bg-blue-500/5 p-3 text-xs leading-relaxed text-blue-900">
        <svg
          className="w-4 h-4 mt-0.5 flex-shrink-0 text-blue-600"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          strokeWidth={1.75}
          aria-hidden
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
          />
        </svg>
        <span>
          {traceScoring.enabled
            ? "Click to turn off. New traces will no longer be scored automatically. Past traces with existing scores remain unaffected."
            : "Click to turn on. New traces will be scored using the evaluators below. Past traces with no scores remain unaffected."}
        </span>
      </div>

      {eligible.length > 0 && (
        <div className="space-y-1.5">
          <p className="flex items-center gap-2 text-xs font-medium text-gray-900">
            <CheckIcon className="w-3.5 h-3.5 flex-shrink-0 text-green-600" />
            Evaluators used for scoring
          </p>
          <EvaluatorPillList
            onOpenEvaluator={setPreview}
            layout="flow"
            evaluators={eligible.map((item) => ({
              uuid: item.evaluator_uuid,
              name: item.name,
            }))}
          />
        </div>
      )}

      {ineligible.length > 0 && (
        <div className="space-y-1.5">
          <p className="flex items-center gap-2 text-xs font-medium text-gray-900">
            <XIcon className="w-3.5 h-3.5 flex-shrink-0 text-red-600" />
            Evaluators not used for scoring
          </p>
          {/* Grouped by reason, so a name is never filed under the wrong one.
              A reason sits right under the heading it belongs to, and the
              groups themselves stay apart. */}
          <div className="space-y-4">
            {[...new Set(ineligible.map((item) => item.reason))].map(
              (reason) => (
                <div key={reason} className="space-y-2">
                  <p className="text-xs text-gray-600 leading-relaxed">
                    {ineligibleReasonCopy(reason)}
                  </p>
                  <EvaluatorPillList
                    onOpenEvaluator={setPreview}
                    layout="flow"
                    evaluators={ineligible
                      .filter((item) => item.reason === reason)
                      .map((item) => ({
                        uuid: item.evaluator_uuid,
                        name: item.name,
                      }))}
                  />
                </div>
              ),
            )}
          </div>
        </div>
      )}

      {traceScoring.saveError && (
        <p className="text-xs text-red-600">{traceScoring.saveError}</p>
      )}
    </div>
  );

  const tone = traceScoring.enabled
    ? {
        pill: "border-green-500/40 bg-green-500/10 text-green-700 dark:text-green-400",
        dot: "bg-green-500",
      }
    : {
        pill: "border-amber-500/40 bg-amber-500/10 text-amber-700 dark:text-amber-300",
        dot: "bg-amber-500",
      };

  // Same guard the Settings switch uses: until the eligibility answer lands
  // there is nothing to say yes to, and turning on would quietly do nothing.

  return (
    <>
      <EvaluatorPreviewModal
        evaluatorUuid={preview?.uuid ?? null}
        evaluatorName={preview?.name}
        onClose={() => setPreview(null)}
      />
      <TraceScoringConfirmDialog
        pending={pending}
        onClose={() => setPending(null)}
        onConfirm={(next) => void traceScoring.setEnabled(next)}
      />
      <Tooltip
        content={panel}
        position="bottom"
        className="inline-block"
        alignEnd
        // Width and padding as styles, not classes: the popup sets its own
        // px-3 py-2, and whichever class the stylesheet emits last would win.
        // The line around it is here too: the popup is white on a white page,
        // so a shadow alone leaves its top edge invisible.
        contentStyle={{
          width: "460px",
          maxWidth: "none",
          padding: "24px",
          border: "1px solid var(--color-gray-200, #e5e7eb)",
        }}
      >
        <button
          type="button"
          disabled={traceScoring.saving || traceScoring.cannotEnable}
          onClick={() => setPending(!traceScoring.enabled)}
          className={`inline-flex items-center gap-2 h-7 px-2.5 rounded-full border text-xs font-medium whitespace-nowrap cursor-pointer disabled:cursor-not-allowed ${tone.pill}`}
        >
          <span
            aria-hidden
            className={`w-1.5 h-1.5 rounded-full ${tone.dot}`}
          />
          {traceScoring.enabled
            ? "Continuous monitoring on"
            : "Continuous monitoring off"}
        </button>
      </Tooltip>
    </>
  );
}
