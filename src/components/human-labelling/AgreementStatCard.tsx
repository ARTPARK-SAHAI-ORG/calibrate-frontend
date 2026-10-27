"use client";

import { useState, type ReactNode } from "react";
import { Tooltip } from "@/components/Tooltip";
import { useIsNameClipped } from "@/hooks/useIsNameClipped";
import { EvaluatorPreviewModal } from "@/components/evaluators/EvaluatorPreviewModal";
import { formatAgreement, percentOf } from "@/lib/agreementKappa";
import { PILL, PILL_LINK } from "@/components/human-labelling/EvaluatorNamePill";

export function agreementColor(v: number | null | undefined): string {
  if (v == null) return "text-muted-foreground";
  const pct = v * 100;
  if (pct >= 75) return "text-green-600 dark:text-green-400";
  if (pct <= 50) return "text-red-600 dark:text-red-400";
  return "text-yellow-600 dark:text-yellow-400";
}

/** A thin bar filled to the agreement, with a tick at what chance alone
 * would agree. The fill is green when agreement beats chance, red when it
 * falls short, and muted when they are equal or chance is unknown, compared
 * as the whole percents shown so the colour never contradicts the numbers. */
export function ChanceBar({
  agreement,
  chanceAgreement,
}: {
  agreement: number;
  chanceAgreement: number | null | undefined;
}) {
  const pct = percentOf(agreement);
  const chance = chanceAgreement == null ? null : percentOf(chanceAgreement);
  const fill =
    chance == null || pct === chance
      ? "bg-muted-foreground"
      : pct > chance
        ? "bg-green-500"
        : "bg-red-500";
  return (
    <div className="relative mt-2 h-2 rounded-full bg-muted">
      <div
        data-testid="agreement-fill"
        className={`h-full rounded-full ${fill}`}
        style={{ width: `${pct}%` }}
      />
      {chance != null && (
        <div
          data-testid="chance-tick"
          className={`absolute -top-1 -bottom-1 -ml-px ${TICK}`}
          style={{ left: `${chance}%` }}
        />
      )}
    </div>
  );
}

const TICK = "w-0.5 bg-foreground";
const SWATCH = "inline-block h-2 w-4 rounded-full";

/** What the marks on a chance bar mean, drawn with the bar's own classes. */
export function ChanceLegend({ className = "" }: { className?: string }) {
  const items: [string, ReactNode][] = [
    [
      "Agreement expected by chance alone",
      <span key="tick" className={`inline-block h-3 ${TICK}`} />,
    ],
    ["Better than chance", <span key="g" className={`${SWATCH} bg-green-500`} />],
    ["Worse than chance", <span key="r" className={`${SWATCH} bg-red-500`} />],
    [
      "Same as chance, or cannot be compared",
      <span key="m" className={`${SWATCH} bg-muted-foreground`} />,
    ],
  ];
  return (
    <div
      className={`flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground ${className}`}
    >
      {items.map(([text, swatch]) => (
        <span key={text} className="inline-flex items-center gap-1.5">
          {swatch}
          {text}
        </span>
      ))}
    </div>
  );
}

/** "Chance 57%". */
export function chanceText(chanceAgreement: number): string {
  return `Chance ${formatAgreement(chanceAgreement)}`;
}

/** A large agreement percentage in the neutral text colour, or a large
 * muted dash when there is none. */
export function BigPercent({
  value,
  className = "",
}: {
  value: number | null | undefined;
  className?: string;
}) {
  return (
    <div
      className={`text-2xl font-semibold tabular-nums ${
        value == null ? "text-muted-foreground" : "text-foreground"
      } ${className}`}
    >
      {value == null ? "—" : formatAgreement(value)}
    </div>
  );
}

/** The evaluator's own summarised result across the run's items. */
export type EvaluatorResultStat = {
  /** What the number is, e.g. the "true" label or "Average score". */
  label: string;
  value: ReactNode;
  /** A binary evaluator's own name for its passing answer, e.g. "Correct". */
  passLabel?: string;
  /** Hover text, e.g. "8 of 10 items". */
  title?: string;
  /** 0–1 position of the value on its own scale. Colours the number on the
   * same thresholds as the agreement number. Null leaves it uncoloured. */
  ratio?: number | null;
};

/**
 * A pill naming what the card is about over one large number: an
 * evaluator's score, coloured by how high it is, or an agreement as a neutral
 * percentage.
 */
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
    /** The evaluator's score. Takes the place of `agreement`. */
    result?: EvaluatorResultStat | null;
    /** An agreement, 0 to 1. */
    agreement?: number | null;
  },
) {
  const { result = null, agreement = null } = props;
  // The evaluator whose prompt is on show, opened from the pill below. Null
  // until the pill is clicked.
  const [previewEvaluator, setPreviewEvaluator] = useState<{
    uuid: string;
    name: string;
  } | null>(null);
  // The plain pill shortens its text to fit the card, so the whole of it goes
  // on hover only when it is actually cut off.
  const staticPillText =
    "staticPillText" in props ? props.staticPillText : null;
  const { ref: staticPillRef, clipped: staticPillClipped } = useIsNameClipped(
    staticPillText ?? "",
  );
  const staticPill = (
    <span className={`${PILL} max-w-full min-w-0 cursor-default`}>
      <span ref={staticPillRef} className="truncate">
        {staticPillText}
      </span>
    </span>
  );
  const number = result ? (
    <div
      className={`text-2xl font-semibold tabular-nums mt-2 ${
        result.ratio == null ? "" : agreementColor(result.ratio)
      }`}
    >
      {result.value}
    </div>
  ) : (
    <BigPercent value={agreement} className="mt-2" />
  );
  return (
    <>
      <div className="border border-border rounded-lg px-4 py-3 bg-background w-max shrink-0 min-w-[160px]">
        {"staticPillText" in props ? (
          <div className="flex items-center gap-2 min-w-0">
            {staticPillClipped ? (
              <Tooltip content={props.staticPillText} className="min-w-0">
                {staticPill}
              </Tooltip>
            ) : (
              <div className="relative min-w-0">{staticPill}</div>
            )}
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
              className={`${PILL} gap-1 flex-wrap shrink-0 text-left ${PILL_LINK}`}
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
          </div>
        )}
        {result?.title ? (
          // The hover text says what the number counts, which is nowhere on
          // screen, so it is always worth showing. Below the number, since
          // above it is the evaluator's own name.
          <Tooltip content={result.title} position="bottom">
            {number}
          </Tooltip>
        ) : (
          number
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
