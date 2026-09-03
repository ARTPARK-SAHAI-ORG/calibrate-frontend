"use client";

import { useId, useRef } from "react";
import { INTERACTION_TYPES } from "./InteractionTypePill";

export type InteractionType = "conversation" | "general";

/**
 * The choice between an agent that holds a conversation and one that answers
 * once. Shown when an agent is created and when one is copied, so both screens
 * offer the same two cards and the same wording.
 *
 * The two cards are a radio group, so a screen reader says which one is chosen
 * rather than reading two plain buttons. Tab reaches the chosen card, and the
 * arrow keys move between them, which is how a radio group is expected to
 * behave.
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
  const labelId = useId();
  const groupRef = useRef<HTMLDivElement>(null);
  const otherType: InteractionType =
    value === "conversation" ? "general" : "conversation";

  // Two options, so every arrow key lands on the other one.
  const moveToOther = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (!ARROW_KEYS.includes(event.key)) return;
    event.preventDefault();
    onChange(otherType);
    groupRef.current
      ?.querySelector<HTMLElement>(`[data-tour="agent-nature-${otherType}"]`)
      ?.focus();
  };

  return (
    <div data-tour="agent-nature-options" className={className}>
      <div
        id={labelId}
        className="block text-[13px] font-medium text-foreground mb-2"
      >
        {label}
      </div>

      <div
        ref={groupRef}
        role="radiogroup"
        aria-labelledby={labelId}
        onKeyDown={moveToOther}
        className="space-y-2"
      >
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
    </div>
  );
}

const ARROW_KEYS = ["ArrowDown", "ArrowRight", "ArrowUp", "ArrowLeft"];

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
      role="radio"
      aria-checked={selected}
      tabIndex={selected ? 0 : -1}
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
