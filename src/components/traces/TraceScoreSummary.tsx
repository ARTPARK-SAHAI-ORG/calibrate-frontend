"use client";

import { AgreementStatCard } from "@/components/human-labelling/AgreementStatCard";

/**
 * The live score above the traces list: how each evaluator is scoring the
 * traces that have come in.
 *
 * ponytail: the numbers below are made up. Nothing scores traces yet, so this
 * is the shape of the section, not real results. Replace DUMMY_SCORES and
 * DUMMY_LAST_CHECKED with the summary the backend returns once traces are
 * evaluated on a schedule.
 */
const DUMMY_SCORES = [
  { name: "Accuracy", passed: 1647, evaluated: 1790 },
  { name: "Safety", passed: 1773, evaluated: 1790 },
  { name: "Clarity", passed: 1289, evaluated: 1790 },
];

const DUMMY_LAST_CHECKED = "12 minutes ago";

export function TraceScoreSummary() {
  return (
    <section className="space-y-2">
      <div>
        <h3 className="text-sm font-semibold text-foreground">Live score</h3>
        <p className="text-xs text-muted-foreground">
          Share of traces that passed each evaluator over the last 7 days. Last
          checked {DUMMY_LAST_CHECKED}.
        </p>
      </div>
      <div className="flex flex-wrap gap-3">
        {DUMMY_SCORES.map((score) => {
          const ratio = score.passed / score.evaluated;
          return (
            <AgreementStatCard
              key={score.name}
              staticPillText={score.name}
              value={null}
              showResultLabel={false}
              result={{
                label: score.name,
                value: `${Math.round(ratio * 100)}%`,
                title: `${score.passed.toLocaleString()} of ${score.evaluated.toLocaleString()} traces passed`,
                ratio,
              }}
            />
          );
        })}
      </div>
    </section>
  );
}
