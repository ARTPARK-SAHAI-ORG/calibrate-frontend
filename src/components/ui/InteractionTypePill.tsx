import { Tooltip } from "@/components/Tooltip";

/** How each kind of agent is named and described, everywhere it is shown. */
export const INTERACTION_TYPES = {
  conversation: {
    label: "Conversation",
    description: "Your agent has a conversation with a user",
  },
  general: {
    label: "Single Agent Response",
    description: "The agent takes an input and generates an output",
  },
} as const;

type Props = {
  interactionType?: "conversation" | "general";
  /** Padding and corner classes, so the pill can match its surroundings. */
  className?: string;
};

/**
 * Says whether an agent holds a conversation or answers once, with the same
 * description the new-agent screen gives on hover.
 * Used on the agents list and the agent detail page.
 */
export function InteractionTypePill({
  interactionType,
  className = "px-2 py-1 rounded-md",
}: Props) {
  const isGeneral = interactionType === "general";
  const { label, description } =
    INTERACTION_TYPES[isGeneral ? "general" : "conversation"];
  return (
    // Inline, so a pill written inside a sentence does not push the words
    // around it onto their own lines.
    <Tooltip
      content={description}
      position="top"
      className="inline-block align-middle"
    >
      <span
        className={`text-xs font-medium ${className} ${
          isGeneral
            ? "bg-teal-500/10 text-teal-600 dark:text-teal-400"
            : "bg-pink-500/10 text-pink-600 dark:text-pink-400"
        }`}
      >
        {label}
      </span>
    </Tooltip>
  );
}
