"use client";

import {
  AgreementStatCard,
  type EvaluatorResultStat,
} from "@/components/human-labelling/AgreementStatCard";

export type EvaluatorScoreCard = {
  evaluatorId: string;
  name: string;
  /** Null when the evaluator has no score to show. The card stays, with a
   * dash in place of the number. */
  stat: EvaluatorResultStat | null;
};

/** The words above the cards on a labelling job. The heading is the name of
 * the person who labelled the job, and this stands in when the job has no
 * name for them. Written once so the two job pages cannot drift apart. */
export const HUMAN_SCORES_HEADING = "Human scores";
export const HUMAN_SCORES_DESCRIPTION =
  "The scores the annotator gave across the items they have labelled in this job";

/** A titled row of one card per evaluator, each showing a single number.
 *
 * Used wherever a screen answers "what was scored here": the evaluators' own
 * scores and the scores annotators gave, on the labelling task overview and
 * on a labelling job. One component so the same question always looks the
 * same. A row with no cards does not appear at all.
 */
export function EvaluatorScoreCards({
  heading,
  description,
  cards,
  headingAside,
  actions,
  linkEvaluators = true,
  singleRow = false,
  showWhenEmpty = false,
}: {
  heading: string;
  description: string;
  cards: EvaluatorScoreCard[];
  /** Sits on the heading row, to the right of the heading. Used for the
   * labelling job's status, which belongs beside the words rather than on a
   * line of its own. */
  headingAside?: React.ReactNode;
  /** Sits on the heading row, pinned to the far right. Used for a labelling
   * job's page-level buttons (send for review, copy link, share) — they stay
   * beside the short heading line instead of sharing a row with the cards,
   * so the cards always get the full width to scroll or wrap in below. */
  actions?: React.ReactNode;
  /** Link each evaluator name to its own page. Off on pages anyone can open
   * with a link, where there is nothing to send the reader to. */
  linkEvaluators?: boolean;
  /** Keep the cards on one row that scrolls sideways instead of wrapping.
   * On for pages that fill the window height, where every extra row of cards
   * is taken straight out of the item the person is reading. */
  singleRow?: boolean;
  /** Keep the heading on screen even with no cards to show. On for a
   * labelling job, where the name of the person labelling it and the state
   * of their work are worth showing before any answer has been saved. */
  showWhenEmpty?: boolean;
}) {
  if (cards.length === 0 && !showWhenEmpty) return null;
  return (
    <section>
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-2 flex-wrap">
          <h2 className="text-sm font-semibold">{heading}</h2>
          {headingAside}
        </div>
        {actions && (
          <div className="flex items-center gap-2 shrink-0">{actions}</div>
        )}
      </div>
      {description && (
        <p className="text-xs text-muted-foreground mt-1">{description}</p>
      )}
      <div
        className={`flex items-stretch gap-3 mt-3 ${
          singleRow ? "overflow-x-auto pb-1" : "flex-wrap"
        }`}
      >
        {cards.map((card) => (
          <AgreementStatCard
            key={card.evaluatorId}
            {...(linkEvaluators
              ? {
                  evaluatorPill: {
                    uuid: card.evaluatorId,
                    name: card.name,
                  },
                }
              : { staticPillText: card.name })}
            value={null}
            result={card.stat}
            showResultLabel={false}
            showAlignmentLabel={false}
          />
        ))}
      </div>
    </section>
  );
}
