"use client";

import type { EvaluatorType } from "@/components/EvaluatorPills";

// The evaluator kinds a create flow can offer, in order. The words on each
// card live in EvaluatorTypeQuestions, the one place that draws them.
export const EVALUATOR_USE_CASE_OPTIONS: EvaluatorType[] = [
  "llm",
  "conversation",
  "llm-general",
  "tool-call",
  "stt",
  "tts",
];

/** The colours a card can be painted. One per answer on screen, so no two
 *  cards a reader can see at once share a colour. */
export type CardTone =
  | "blue"
  | "purple"
  | "orange"
  | "teal"
  | "pink"
  | "amber"
  | "rose"
  | "indigo"
  | "neutral";

const TONE_INACTIVE_CLASSES: Record<CardTone, string> = {
  purple:
    "border-purple-500/20 bg-purple-500/[0.04] hover:bg-purple-500/10 hover:border-purple-500/40",
  blue: "border-blue-500/20 bg-blue-500/[0.04] hover:bg-blue-500/10 hover:border-blue-500/40",
  orange:
    "border-orange-500/20 bg-orange-500/[0.04] hover:bg-orange-500/10 hover:border-orange-500/40",
  teal: "border-teal-500/20 bg-teal-500/[0.04] hover:bg-teal-500/10 hover:border-teal-500/40",
  pink: "border-pink-500/20 bg-pink-500/[0.04] hover:bg-pink-500/10 hover:border-pink-500/40",
  amber:
    "border-amber-500/20 bg-amber-500/[0.04] hover:bg-amber-500/10 hover:border-amber-500/40",
  rose: "border-rose-500/20 bg-rose-500/[0.04] hover:bg-rose-500/10 hover:border-rose-500/40",
  indigo:
    "border-indigo-500/20 bg-indigo-500/[0.04] hover:bg-indigo-500/10 hover:border-indigo-500/40",
  neutral:
    "border-border bg-muted/20 hover:bg-muted/40 hover:border-muted-foreground",
};

const TONE_ACTIVE_CLASSES: Record<CardTone, string> = {
  purple: "border-purple-500/60 bg-purple-500/15 ring-1 ring-purple-500/40",
  blue: "border-blue-500/60 bg-blue-500/15 ring-1 ring-blue-500/40",
  orange: "border-orange-500/60 bg-orange-500/15 ring-1 ring-orange-500/40",
  teal: "border-teal-500/60 bg-teal-500/15 ring-1 ring-teal-500/40",
  pink: "border-pink-500/60 bg-pink-500/15 ring-1 ring-pink-500/40",
  amber: "border-amber-500/60 bg-amber-500/15 ring-1 ring-amber-500/40",
  rose: "border-rose-500/60 bg-rose-500/15 ring-1 ring-rose-500/40",
  indigo: "border-indigo-500/60 bg-indigo-500/15 ring-1 ring-indigo-500/40",
  neutral: "border-foreground bg-muted/40 ring-1 ring-foreground/20",
};

const TONE_TITLE_CLASSES: Record<CardTone, string> = {
  purple: "text-purple-700 dark:text-purple-300",
  blue: "text-blue-700 dark:text-blue-300",
  orange: "text-orange-700 dark:text-orange-300",
  teal: "text-teal-700 dark:text-teal-300",
  pink: "text-pink-700 dark:text-pink-300",
  amber: "text-amber-700 dark:text-amber-300",
  rose: "text-rose-700 dark:text-rose-300",
  indigo: "text-indigo-700 dark:text-indigo-300",
  neutral: "text-foreground",
};

/** An answer the reader passed over keeps its own colour, just turned down, so
 *  the chosen one is what the eye lands on. */
const DIMMED_CLASSES = "opacity-45 hover:opacity-90";

type ChoiceCardProps = {
  title: string;
  description?: string;
  selected: boolean;
  onSelect: () => void;
  /** The colour to paint the card. */
  tone: CardTone;
  /** Another answer to the same question was chosen, so this one steps back. */
  dimmed?: boolean;
};

// One selectable answer card, drawn by EvaluatorTypeQuestions.
export function ChoiceCard({
  title,
  description,
  selected,
  onSelect,
  tone,
  dimmed,
}: ChoiceCardProps) {
  const toneClasses = selected
    ? TONE_ACTIVE_CLASSES[tone]
    : `${TONE_INACTIVE_CLASSES[tone]} ${dimmed ? DIMMED_CLASSES : ""}`;
  const titleClasses = TONE_TITLE_CLASSES[tone];

  return (
    <button
      type="button"
      onClick={onSelect}
      aria-pressed={selected}
      className={`flex flex-col items-start text-left p-4 rounded-md border transition-colors cursor-pointer ${toneClasses}`}
    >
      <div className={`text-sm md:text-base font-medium ${titleClasses}`}>
        {title}
      </div>
      <div className="text-xs md:text-sm text-muted-foreground mt-1 leading-relaxed">
        {description}
      </div>
    </button>
  );
}
