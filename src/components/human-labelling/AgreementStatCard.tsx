"use client";

import { useState, type ReactNode } from "react";
import { Tooltip } from "@/components/Tooltip";
import { useIsNameClipped } from "@/hooks/useIsNameClipped";
import { EvaluatorPreviewModal } from "@/components/evaluators/EvaluatorPreviewModal";
import { type KappaFields } from "@/lib/agreementKappa";
import {
  agreementStatPillBase,
  KappaCell,
} from "@/components/human-labelling/KappaCell";

export function agreementColor(v: number | null | undefined): string {
  if (v == null) return "text-muted-foreground";
  const pct = v * 100;
  if (pct >= 75) return "text-green-600 dark:text-green-400";
  if (pct <= 50) return "text-red-600 dark:text-red-400";
  return "text-yellow-600 dark:text-yellow-400";
}

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
  label?: ReactNode;
  value: ReactNode;
  valueClassName?: string;
  title?: string;
}) {
  const body = (
    <div className="min-w-0">
      {label != null && (
        <div className="text-sm font-medium text-muted-foreground whitespace-nowrap">
          {label}
        </div>
      )}
      <div
        className={`text-2xl font-semibold tabular-nums mt-0.5 whitespace-nowrap ${valueClassName}`}
      >
        {value}
      </div>
    </div>
  );
  // The hover text says what the number counts, e.g. "8 of 10 items", which
  // is nowhere on screen, so it is always worth showing. It sits below: above
  // the number is the evaluator's own name, and the box covered it.
  return title ? (
    <Tooltip content={title} position="bottom" className="min-w-0">
      {body}
    </Tooltip>
  ) : (
    body
  );
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
  const pct = Math.round(agreement * 100);
  const chance =
    chanceAgreement == null ? null : Math.round(chanceAgreement * 100);
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
      "Cannot be compared with chance",
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

/** The chance bar, and under it the chance and the kappa. */
function AgreementBar({
  agreement,
  kappa,
}: {
  agreement: number;
  kappa: KappaFields;
}) {
  const chance = kappa.chance_agreement;
  return (
    <>
      <ChanceBar agreement={agreement} chanceAgreement={chance} />
      <div className="flex items-center justify-between gap-4 mt-1.5 text-[11px] text-muted-foreground tabular-nums whitespace-nowrap">
        {chance != null ? (
          <span>Chance {Math.round(chance * 100)}%</span>
        ) : (
          <span />
        )}
        <span className="inline-flex items-center gap-1">
          Kappa
          <KappaCell fields={kappa} />
        </span>
      </div>
    </>
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
    /** Human agreement, 0 to 1, shown as a neutral percentage, and with
     * `kappa` as a bar against chance. Without it the card shows a dash, or
     * only the score when it has one. */
    agreement?: number | null;
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
    /** Shown beside the human agreement number when there is one. */
    kappa?: KappaFields | null;
    /** Several agreement numbers, each under its own title and drawn as a
     * bar against chance. Takes the place of `agreement` and `kappa`. */
    sections?: {
      title: string;
      agreement: number | null;
      kappa: KappaFields | null | undefined;
    }[];
  },
) {
  const {
    result = null,
    showResultLabel = true,
    showAlignmentLabel = true,
    warning = null,
    kappa = null,
    agreement = null,
    sections = null,
  } = props;
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
    <span className={`${agreementStatPillBase} cursor-default`}>
      <span ref={staticPillRef} className="truncate">
        {staticPillText}
      </span>
    </span>
  );
  const percent = agreement == null ? null : `${Math.round(agreement * 100)}%`;
  // One number, named by the section the card sits in.
  const singleNumber = (
    <div
      className={`text-2xl font-semibold tabular-nums mt-2 ${
        result
          ? result.ratio == null
            ? ""
            : agreementColor(result.ratio)
          : percent == null
            ? "text-muted-foreground"
            : "text-foreground"
      }`}
    >
      {result ? result.value : (percent ?? "—")}
    </div>
  );
  const agreementBlock =
    agreement != null && percent != null ? (
      <div className="min-w-0">
        <Stat
          label={result ? "Human agreement" : undefined}
          value={percent}
          valueClassName="text-foreground"
        />
        {kappa && <AgreementBar agreement={agreement} kappa={kappa} />}
      </div>
    ) : null;
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
            {staticPillClipped ? (
              <Tooltip content={props.staticPillText} className="min-w-0">
                {staticPill}
              </Tooltip>
            ) : (
              <div className="relative min-w-0">{staticPill}</div>
            )}
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
        {sections ? (
          <div className="mt-2 flex items-start gap-6">
            {sections.map((section) => (
              <div key={section.title} className="min-w-0">
                <Stat
                  label={section.title}
                  value={
                    section.agreement == null
                      ? "—"
                      : `${Math.round(section.agreement * 100)}%`
                  }
                  valueClassName={
                    section.agreement == null
                      ? "text-muted-foreground"
                      : "text-foreground"
                  }
                />
                {section.agreement != null && (
                  <AgreementBar
                    agreement={section.agreement}
                    kappa={section.kappa ?? {}}
                  />
                )}
              </div>
            ))}
          </div>
        ) : result && (percent != null || showResultLabel) ? (
          // Each number is labelled, so the card reads the same whether or not
          // there is a human agreement number to sit beside the score. On its
          // own the score sits in the middle of the card.
          <div
            className={`mt-2 flex items-start gap-6 ${
              percent == null ? "justify-center text-center" : ""
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
            {agreementBlock}
          </div>
        ) : !result && kappa && agreementBlock ? (
          <div className="mt-2">{agreementBlock}</div>
        ) : result?.title ? (
          // The hover text says what the number counts, which is nowhere on
          // screen, so it is always worth showing. Below the number, since
          // above it is the evaluator's own name.
          <Tooltip content={result.title} position="bottom">
            {singleNumber}
          </Tooltip>
        ) : (
          singleNumber
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

/** The two whole-workspace or whole-task numbers, drawn like the score cards
 * beside them: a pill label over a large percentage in the agreement colour. */
export function OverallAgreementCards({
  interAnnotator,
  withHumans,
}: {
  interAnnotator: { current: number | null } | null | undefined;
  withHumans: { current: number | null } | null | undefined;
}) {
  return (
    <>
      {(
        [
          ["Inter-annotator agreement", interAnnotator],
          ["Evaluator agreement with humans", withHumans],
        ] as const
      ).map(([title, group]) => (
        <AgreementStatCard
          key={title}
          staticPillText={title}
          result={{
            label: title,
            value:
              group?.current != null
                ? `${Math.round(group.current * 100)}%`
                : "—",
            ratio: group?.current ?? null,
          }}
          showResultLabel={false}
          showAlignmentLabel={false}
        />
      ))}
    </>
  );
}

type ReliabilityGroup = KappaFields & { current: number | null };

/** Score reliability on a task: the two overall numbers, then a card for
 * every linked evaluator with its inter-annotator agreement and its
 * agreement with humans. */
export function ScoreReliabilityCards({
  agreement,
}: {
  agreement: {
    human_human?: { current: number | null } | null;
    evaluators_with_humans?: { current: number | null } | null;
    evaluators?: (ReliabilityGroup & {
      evaluator_id: string;
      name: string;
      inter_annotator?: ReliabilityGroup | null;
    })[];
  };
}) {
  const evaluators = agreement.evaluators ?? [];
  const hasBar = evaluators.some(
    (ev) => ev.current != null || ev.inter_annotator?.current != null,
  );
  return (
    <>
      {hasBar && <ChanceLegend className="mt-3" />}
      <div className="flex flex-wrap items-stretch gap-3 mt-3">
        <OverallAgreementCards
          interAnnotator={agreement.human_human}
          withHumans={agreement.evaluators_with_humans}
        />
        {evaluators.map((ev) => (
          <AgreementStatCard
            key={ev.evaluator_id}
            evaluatorPill={{ uuid: ev.evaluator_id, name: ev.name }}
            showAlignmentLabel={false}
            sections={[
              {
                title: "Inter-annotator agreement",
                agreement: ev.inter_annotator?.current ?? null,
                kappa: ev.inter_annotator,
              },
              {
                title: "Evaluator agreement with humans",
                agreement: ev.current,
                kappa: ev,
              },
            ]}
          />
        ))}
      </div>
    </>
  );
}

