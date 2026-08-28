"use client";

import { useState } from "react";
import { Tooltip } from "@/components/Tooltip";
import { EvaluatorPreviewModal } from "@/components/evaluators/EvaluatorPreviewModal";

export function agreementColor(v: number | null | undefined): string {
  if (v == null) return "text-muted-foreground";
  const pct = v * 100;
  if (pct >= 75) return "text-green-600 dark:text-green-400";
  if (pct <= 50) return "text-red-600 dark:text-red-400";
  return "text-yellow-600 dark:text-yellow-400";
}

const agreementStatPillBase =
  "inline-flex items-center max-w-full min-w-0 px-2 py-0.5 rounded-md text-xs font-medium border border-border bg-muted/40 text-foreground";

/** Evaluator name pills should show in full (wrap / grow); avoid min-w-0 + truncate. */
const evaluatorAgreementPillLink =
  "inline-flex items-center gap-1 flex-wrap px-2 py-0.5 rounded-md text-xs font-medium border border-border bg-muted/40 text-foreground shrink-0 text-left";

/** One labelled number inside the card. */
function Stat({
  label,
  value,
  valueClassName = "",
  title,
}: {
  label: string;
  value: string;
  valueClassName?: string;
  title?: string;
}) {
  return (
    <div className="min-w-0" title={title}>
      <div className="text-[11px] text-muted-foreground whitespace-nowrap">
        {label}
      </div>
      <div
        className={`text-2xl font-semibold tabular-nums mt-0.5 whitespace-nowrap ${valueClassName}`}
      >
        {value}
      </div>
    </div>
  );
}

/** The evaluator's own summarised result across the run's items. */
export type EvaluatorResultStat = {
  /** What the number is, e.g. the "true" label or "Average score". */
  label: string;
  value: string;
  /** Hover text, e.g. "8 of 10 items". */
  title?: string;
  /** 0–1 position of the value on its own scale. Colours the number on the
   * same thresholds as the agreement number. Null leaves it uncoloured. */
  ratio?: number | null;
};

export function AgreementStatCard(
  props: (
    | {
        staticPillText: string;
      }
    | {
        evaluatorPill: {
          uuid: string;
          name: string;
          versionLabel?: string | null;
        };
      }
  ) & {
    /** Human agreement, or an em dash when there is nothing to compare
     * against yet. Null only where the score has a card of its own, so
     * agreement is not this card's subject. */
    value: string | null;
    valueClassName?: string;
    /** When present, the card shows this in place of, or next to, the
     * agreement number. */
    result?: EvaluatorResultStat | null;
    /** Name the score above the number. Off where the section heading
     * already says what the number is, so the card is just the evaluator's
     * name and its number. Ignored when the human agreement number is also
     * on the card: two numbers side by side always need their own names. */
    showResultLabel?: boolean;
    /** Name the number beside the evaluator when the card has no score on
     * it. On for the reliability cards, whose number is the agreement with
     * humans. Off where the section heading already says what the card is,
     * so an evaluator with nothing to show reads as empty, not as an
     * agreement number. */
    showAlignmentLabel?: boolean;
    /** Why this evaluator has no human agreement number. Shown as a small
     * mark beside the name that explains itself on hover, so a run with
     * unlabelled evaluators does not need a banner above the cards. */
    warning?: string | null;
  },
) {
  const {
    value,
    valueClassName = "",
    result = null,
    showResultLabel = true,
    showAlignmentLabel = true,
    warning = null,
  } = props;
  // The evaluator whose prompt is on show, opened from the pill below. Null
  // until the pill is clicked.
  const [previewEvaluator, setPreviewEvaluator] = useState<{
    uuid: string;
    name: string;
  } | null>(null);
  const warningMark = warning ? (
    <Tooltip content={warning} position="top">
      <span
        role="img"
        aria-label={warning}
        className="inline-flex shrink-0 text-amber-600 dark:text-amber-400 cursor-pointer"
      >
        <svg
          className="w-4 h-4"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          strokeWidth={2}
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M12 9v3.75m9-.75a9 9 0 11-18 0 9 9 0 0118 0zm-9 3.75h.008v.008H12v-.008z"
          />
        </svg>
      </span>
    </Tooltip>
  ) : null;
  return (
    <>
      <div className="border border-border rounded-lg px-4 py-3 bg-background w-max shrink-0 min-w-[160px]">
        {"staticPillText" in props ? (
          <div className="flex items-center gap-2 min-w-0">
            <span
              className={`${agreementStatPillBase} cursor-default`}
              title={props.staticPillText}
            >
              <span className="truncate">{props.staticPillText}</span>
            </span>
            {warningMark}
          </div>
        ) : (
          <div className="flex items-center gap-2 min-w-0 flex-wrap">
            <button
              type="button"
              onClick={() =>
                setPreviewEvaluator({
                  uuid: props.evaluatorPill.uuid,
                  name: props.evaluatorPill.name,
                })
              }
              className={`${evaluatorAgreementPillLink} hover:bg-muted hover:border-foreground/30 transition-colors cursor-pointer`}
              title={`Open ${props.evaluatorPill.name}`}
            >
              <span className="break-words whitespace-normal">
                {props.evaluatorPill.name}
              </span>
              {props.evaluatorPill.versionLabel && (
                <span className="font-mono text-[11px] text-muted-foreground">
                  {props.evaluatorPill.versionLabel}
                </span>
              )}
            </button>
            {!result && showAlignmentLabel && (
              <span className="text-sm font-medium text-foreground shrink-0">
                alignment
              </span>
            )}
            {warningMark}
          </div>
        )}
        {result && (value != null || showResultLabel) ? (
          // Each number is labelled, so the card reads the same whether or not
          // there is a human agreement number to sit beside the score. On its
          // own the score sits in the middle of the card.
          <div
            className={`mt-2 flex items-start gap-6 ${
              value == null ? "justify-center text-center" : ""
            }`}
          >
            <Stat
              label={result.label}
              value={result.value}
              valueClassName={
                result.ratio == null ? "" : agreementColor(result.ratio)
              }
              title={result.title}
            />
            {value != null && (
              <Stat
                label="Human agreement"
                value={value}
                valueClassName={valueClassName}
              />
            )}
          </div>
        ) : (
          // One number, named by the section the card sits in.
          <div
            className={`text-2xl font-semibold tabular-nums mt-2 ${
              result
                ? result.ratio == null
                  ? ""
                  : agreementColor(result.ratio)
                : valueClassName
            }`}
            title={result?.title}
          >
            {result ? result.value : (value ?? "—")}
          </div>
        )}
      </div>
      <EvaluatorPreviewModal
        evaluatorUuid={previewEvaluator?.uuid ?? null}
        evaluatorName={previewEvaluator?.name}
        onClose={() => setPreviewEvaluator(null)}
      />
    </>
  );
}
