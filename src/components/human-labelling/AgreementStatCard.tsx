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

export function AgreementStatCard(
  props:
    | {
        staticPillText: string;
        value: string;
        valueClassName?: string;
      }
    | {
        evaluatorPill: {
          href: string;
          name: string;
          versionLabel?: string | null;
        };
        value: string;
        valueClassName?: string;
      },
) {
  const { value, valueClassName = "" } = props;
  return (
    <div className="border border-border rounded-lg px-4 py-3 bg-background min-w-[160px] w-max shrink-0">
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
          <span className="text-sm font-medium text-foreground shrink-0">
            alignment
          </span>
        </div>
      )}
      <div
        className={`text-2xl font-semibold tabular-nums mt-2 ${valueClassName}`}
      >
        {value}
      </div>
    </div>
  );
}
