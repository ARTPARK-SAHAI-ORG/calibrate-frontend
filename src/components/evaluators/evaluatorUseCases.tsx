"use client";

import type { EvaluatorType } from "@/components/EvaluatorPills";

// A selectable use-case card shared by the new-evaluator picker
// (UseCasePickerDialog) and the labelling-task creator
// (CreateLabellingTaskDialog) so both read identically. `group` drives the
// section header; `recommended` flags an optional "Most common" badge.
export type EvaluatorUseCaseOption = {
  value: EvaluatorType;
  title: string;
  description: string;
  group: "conversation" | "text" | "audio";
  recommended?: boolean;
};

// Canonical, ordered list of evaluator use cases. The evaluator picker shows
// all of these; the labelling-task creator reuses the same list but filters
// out `tts` (labelling has no text-to-speech tasks). Keep descriptions to one
// short, plain-language line so the pickers stay scannable for new users.
export const EVALUATOR_USE_CASE_OPTIONS: EvaluatorUseCaseOption[] = [
  {
    value: "llm",
    title: "LLM reply",
    description: "Judge an agent's next reply in a conversation",
    group: "conversation",
  },
  {
    value: "conversation",
    title: "Full conversation",
    description: "Judge the agent's performance in a whole conversation",
    group: "conversation",
  },
  {
    value: "llm-general",
    title: "LLM response",
    description: "Judge the output of an LLM given a text input",
    group: "text",
  },
  {
    value: "stt",
    title: "Speech to Text",
    description: "Judge transcription accuracy against a reference transcript",
    group: "audio",
  },
  {
    value: "tts",
    title: "Text to Speech (TTS)",
    description: "Judge the quality of generated audio",
    group: "audio",
  },
];

// Section headers shown above each group of cards, in render order.
const GROUP_ORDER: { key: EvaluatorUseCaseOption["group"]; label: string }[] = [
  { key: "conversation", label: "Conversation" },
  { key: "text", label: "Text" },
  { key: "audio", label: "Audio" },
];

// Per-type tints, keyed by EvaluatorType so the cards read as the same "type"
// affordance the user sees on evaluator pills elsewhere.
const TYPE_INACTIVE_CLASSES: Record<EvaluatorType, string> = {
  tts: "border-purple-500/20 bg-purple-500/[0.04] hover:bg-purple-500/10 hover:border-purple-500/40",
  stt: "border-blue-500/20 bg-blue-500/[0.04] hover:bg-blue-500/10 hover:border-blue-500/40",
  llm: "border-orange-500/20 bg-orange-500/[0.04] hover:bg-orange-500/10 hover:border-orange-500/40",
  "llm-general":
    "border-teal-500/20 bg-teal-500/[0.04] hover:bg-teal-500/10 hover:border-teal-500/40",
  conversation:
    "border-pink-500/20 bg-pink-500/[0.04] hover:bg-pink-500/10 hover:border-pink-500/40",
};

const TYPE_ACTIVE_CLASSES: Record<EvaluatorType, string> = {
  tts: "border-purple-500/60 bg-purple-500/15 ring-1 ring-purple-500/40",
  stt: "border-blue-500/60 bg-blue-500/15 ring-1 ring-blue-500/40",
  llm: "border-orange-500/60 bg-orange-500/15 ring-1 ring-orange-500/40",
  "llm-general": "border-teal-500/60 bg-teal-500/15 ring-1 ring-teal-500/40",
  conversation: "border-pink-500/60 bg-pink-500/15 ring-1 ring-pink-500/40",
};

const TYPE_TITLE_CLASSES: Record<EvaluatorType, string> = {
  tts: "text-purple-700 dark:text-purple-300",
  stt: "text-blue-700 dark:text-blue-300",
  llm: "text-orange-700 dark:text-orange-300",
  "llm-general": "text-teal-700 dark:text-teal-300",
  conversation: "text-pink-700 dark:text-pink-300",
};

// Plain-token version of the same card, for an answer that is not an
// evaluator type of its own.
const NEUTRAL_INACTIVE_CLASSES =
  "border-border bg-muted/20 hover:bg-muted/40 hover:border-muted-foreground";
const NEUTRAL_ACTIVE_CLASSES =
  "border-foreground bg-muted/40 ring-1 ring-foreground/20";

type ChoiceCardProps = {
  title: string;
  description?: string;
  selected: boolean;
  onSelect: () => void;
  /** An evaluator type paints the card in that type's colour. "neutral" is for
   *  an answer that is not a type of its own. */
  tone: EvaluatorType | "neutral";
  recommended?: boolean;
};

// One selectable answer card. Shared by the evaluator use-case grid below and
// the labelling-task questions so both read identically.
export function ChoiceCard({
  title,
  description,
  selected,
  onSelect,
  tone,
  recommended,
}: ChoiceCardProps) {
  const neutral = tone === "neutral";
  const toneClasses = neutral
    ? selected
      ? NEUTRAL_ACTIVE_CLASSES
      : NEUTRAL_INACTIVE_CLASSES
    : selected
      ? TYPE_ACTIVE_CLASSES[tone]
      : TYPE_INACTIVE_CLASSES[tone];
  const titleClasses = neutral ? "text-foreground" : TYPE_TITLE_CLASSES[tone];

  return (
    <button
      type="button"
      onClick={onSelect}
      aria-pressed={selected}
      className={`flex flex-col items-start text-left p-4 rounded-md border transition-colors cursor-pointer ${toneClasses}`}
    >
      <div className="flex items-start justify-between gap-2 w-full">
        <div className={`text-sm md:text-base font-medium ${titleClasses}`}>
          {title}
        </div>
        {recommended && (
          <span className="shrink-0 inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold uppercase tracking-wide bg-teal-500/15 text-teal-700 dark:text-teal-300 border border-teal-500/30">
            Most common
          </span>
        )}
      </div>
      <div className="text-xs md:text-sm text-muted-foreground mt-1 leading-relaxed">
        {description}
      </div>
    </button>
  );
}

type EvaluatorUseCaseCardsProps = {
  options: EvaluatorUseCaseOption[];
  selected: EvaluatorType | null;
  onSelect: (value: EvaluatorType) => void;
};

// Grouped grid of selectable use-case cards. Renders one section per
// non-empty group (Conversation / Text / Audio), each as a 2-up grid.
// Section headers are omitted when every option belongs to the same group.
export function EvaluatorUseCaseCards({
  options,
  selected,
  onSelect,
}: EvaluatorUseCaseCardsProps) {
  const visibleGroups = GROUP_ORDER.filter(({ key }) =>
    options.some((option) => option.group === key),
  );
  const showGroupHeaders = visibleGroups.length > 1;

  return (
    <div className="space-y-5">
      {visibleGroups.map(({ key, label }) => {
        const groupOptions = options.filter((o) => o.group === key);
        if (groupOptions.length === 0) return null;
        return (
          <div key={key}>
            {showGroupHeaders && (
              <div className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground mb-2.5 px-0.5">
                {label}
              </div>
            )}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {groupOptions.map((opt) => (
                <ChoiceCard
                  key={opt.value}
                  title={opt.title}
                  description={opt.description}
                  selected={selected === opt.value}
                  onSelect={() => onSelect(opt.value)}
                  tone={opt.value}
                  recommended={opt.recommended}
                />
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}
