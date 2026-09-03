"use client";

import { INTERACTION_TYPES } from "./InteractionTypePill";

export type InteractionType = "conversation" | "general";

/**
 * The choice between an agent that holds a conversation and one that answers
 * once. Shown when an agent is created and when one is copied, so both screens
 * offer the same two cards and the same wording.
 */
export function InteractionTypeChooser({
  value,
  onChange,
  label = "What does your agent do?",
  highlightPopular = false,
  className = "mb-5 space-y-2",
}: {
  value: InteractionType;
  onChange: (value: InteractionType) => void;
  label?: string;
  /** Marks Conversation as the one most people pick. Only the new agent
      screen does this: someone copying an agent already has a type. */
  highlightPopular?: boolean;
  className?: string;
}) {
  return (
    <div data-tour="agent-nature-options" className={className}>
      <label className="block text-[13px] font-medium text-foreground mb-2">
        {label}
      </label>

      <InteractionTypeOption
        type="conversation"
        selected={value === "conversation"}
        onSelect={() => onChange("conversation")}
        badge={highlightPopular ? "Most popular" : undefined}
      />
      <InteractionTypeOption
        type="general"
        selected={value === "general"}
        onSelect={() => onChange("general")}
      />
    </div>
  );
}

function InteractionTypeOption({
  type,
  selected,
  onSelect,
  badge,
}: {
  type: InteractionType;
  selected: boolean;
  onSelect: () => void;
  badge?: string;
}) {
  const { label, description } = INTERACTION_TYPES[type];
  return (
    <button
      type="button"
      data-tour={`agent-nature-${type}`}
      onClick={onSelect}
      className={`relative w-full text-left p-4 rounded-lg border transition-colors cursor-pointer ${
        selected
          ? "border-foreground bg-muted/30"
          : "border-border hover:border-muted-foreground"
      }`}
    >
      <div className="flex items-start gap-3">
        <div
          className={`mt-0.5 w-4 h-4 rounded-full border-2 flex-shrink-0 flex items-center justify-center ${
            selected ? "border-foreground" : "border-muted-foreground"
          }`}
        >
          {selected && <div className="w-2 h-2 rounded-full bg-foreground" />}
        </div>
        <div>
          <div className="text-[13px] font-medium text-foreground">{label}</div>
          <div className="text-[12px] text-muted-foreground mt-0.5">
            {description}
          </div>
        </div>
        {/* The pill straddles the card's top-right corner, the same as on the
            new-test screen. */}
        {badge && (
          <span className="absolute -top-2.5 -right-1 rounded-full bg-amber-500/15 backdrop-blur border border-amber-500/40 px-2 py-0.5 text-[11px] font-semibold text-amber-700 dark:text-amber-300">
            {badge}
          </span>
        )}
      </div>
    </button>
  );
}
