"use client";

import Link from "next/link";

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
          href: string;
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
  },
) {
  const { value, valueClassName = "", result = null } = props;
  return (
    <div className="border border-border rounded-lg px-4 py-3 bg-background w-max shrink-0 min-w-[160px]">
      {"staticPillText" in props ? (
        <span
          className={`${agreementStatPillBase} cursor-default`}
          title={props.staticPillText}
        >
          <span className="truncate">{props.staticPillText}</span>
        </span>
      ) : (
        <div className="flex items-center gap-2 min-w-0 flex-wrap">
          <Link
            href={props.evaluatorPill.href}
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
          </Link>
          {!result && (
            <span className="text-sm font-medium text-foreground shrink-0">
              alignment
            </span>
          )}
        </div>
      )}
      {result && value != null ? (
        // Both numbers on one card, so each needs its own label.
        <div className="mt-2 flex items-start gap-6">
          <Stat
            label={result.label}
            value={result.value}
            valueClassName={
              result.ratio == null ? "" : agreementColor(result.ratio)
            }
            title={result.title}
          />
          <Stat
            label="Human agreement"
            value={value}
            valueClassName={valueClassName}
          />
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
  );
}
