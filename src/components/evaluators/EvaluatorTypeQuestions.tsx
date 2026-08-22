"use client";

import { useState } from "react";
import { ChoiceCard } from "@/components/evaluators/evaluatorUseCases";
import type { EvaluatorType } from "@/components/EvaluatorPills";

/** Whether the agent is working with written words or with audio. */
type Medium = "text" | "voice";

/** Within text, whether there is a conversation behind the answer. */
type TextKind = "conversation" | "single";

/** The audio kinds, in the order they are offered. */
const VOICE_KINDS: EvaluatorType[] = ["stt", "tts"];

/** The text kinds that sit inside a conversation, in the order offered. */
const CONVERSATION_KINDS: EvaluatorType[] = ["llm", "conversation"];

/** The one text kind with no conversation behind it. */
const SINGLE_KIND: EvaluatorType = "llm-general";

/**
 * The answers that lead to a kind, so re-opening this step shows what was
 * already chosen instead of starting blank.
 */
function answersFor(value: EvaluatorType | null): {
  medium: Medium | null;
  textKind: TextKind | null;
} {
  if (value && VOICE_KINDS.includes(value)) {
    return { medium: "voice", textKind: null };
  }
  if (value === SINGLE_KIND) return { medium: "text", textKind: "single" };
  if (value && CONVERSATION_KINDS.includes(value)) {
    return { medium: "text", textKind: "conversation" };
  }
  return { medium: null, textKind: null };
}

function Question({
  title,
  note,
  children,
}: {
  title: string;
  note?: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <label className="block text-sm font-medium mb-1">
        {title} <span className="text-red-500">*</span>
      </label>
      {note ? (
        <p className="text-xs text-muted-foreground mb-3">{note}</p>
      ) : (
        <div className="mb-3" />
      )}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">{children}</div>
    </div>
  );
}

/**
 * Works out what an evaluator or a labelling task is for, one question at a
 * time. Each answer brings up the next question, and every answer stays on
 * screen so it can be changed. Changing an earlier answer drops the ones under
 * it, so nothing half answered can be saved.
 *
 * `allowed` is the kinds the screen may offer. A question with only one
 * possible answer is never asked: that answer is taken as given. So a screen
 * offering all five asks three questions, and one offering a reply in a
 * conversation or a single response asks one.
 */
export function EvaluatorTypeQuestions({
  allowed,
  value,
  onChange,
  firstQuestionNote,
}: {
  allowed: EvaluatorType[];
  value: EvaluatorType | null;
  onChange: (value: EvaluatorType | null) => void;
  /** Shown under the first question, e.g. that the choice cannot be changed. */
  firstQuestionNote?: string;
}) {
  const permitted = new Set(allowed);
  const voiceKinds = VOICE_KINDS.filter((k) => permitted.has(k));
  const conversationKinds = CONVERSATION_KINDS.filter((k) => permitted.has(k));
  const hasSingle = permitted.has(SINGLE_KIND);
  const textPossible = conversationKinds.length > 0 || hasSingle;

  // With only one medium on offer there is nothing to ask, so it is taken as
  // given and the first question on screen is the one below it.
  const forcedMedium: Medium | null = !textPossible
    ? "voice"
    : voiceKinds.length === 0
      ? "text"
      : null;
  // Same for the branch inside text: with no single response on offer every
  // text answer is a conversation, and with no conversation kinds it is not.
  const forcedTextKind: TextKind | null =
    conversationKinds.length > 0 && hasSingle
      ? null
      : hasSingle
        ? "single"
        : "conversation";

  const [chosen, setChosen] = useState(() => answersFor(value));
  const medium = forcedMedium ?? chosen.medium;
  const textKind =
    medium === "text" ? (forcedTextKind ?? chosen.textKind) : null;

  const chooseMedium = (next: Medium) => {
    if (next === medium) return;
    setChosen({ medium: next, textKind: null });
    // One ending down this branch means the question under it would have a
    // single answer, so take it rather than asking.
    if (next === "voice" && voiceKinds.length === 1) onChange(voiceKinds[0]);
    else onChange(null);
  };

  const chooseTextKind = (next: TextKind) => {
    if (next === textKind) return;
    setChosen({ medium: "text", textKind: next });
    if (next === "single") onChange(SINGLE_KIND);
    else if (conversationKinds.length === 1) onChange(conversationKinds[0]);
    else onChange(null);
  };

  return (
    <div className="space-y-5">
      {!forcedMedium && (
        <Question title="What are you labelling?" note={firstQuestionNote}>
          <ChoiceCard
            title="Text"
            description="The agent reads and writes words"
            tone="neutral"
            selected={medium === "text"}
            onSelect={() => chooseMedium("text")}
          />
          <ChoiceCard
            title="Voice"
            description="The agent listens or speaks"
            tone="neutral"
            selected={medium === "voice"}
            onSelect={() => chooseMedium("voice")}
          />
        </Question>
      )}

      {medium === "voice" && voiceKinds.length > 1 && (
        <Question
          title="Which one?"
          note={forcedMedium ? firstQuestionNote : undefined}
        >
          <ChoiceCard
            title="Speech to Text"
            description="Judge transcription accuracy against a reference transcript"
            tone="stt"
            selected={value === "stt"}
            onSelect={() => onChange("stt")}
          />
          <ChoiceCard
            title="Text to Speech"
            description="Judge the quality of generated audio"
            tone="tts"
            selected={value === "tts"}
            onSelect={() => onChange("tts")}
          />
        </Question>
      )}

      {medium === "text" && !forcedTextKind && (
        <Question
          title="Is there a conversation?"
          note={forcedMedium ? firstQuestionNote : undefined}
        >
          <ChoiceCard
            title="A conversation"
            description="Someone talks with the agent, back and forth"
            tone="neutral"
            selected={textKind === "conversation"}
            onSelect={() => chooseTextKind("conversation")}
          />
          <ChoiceCard
            title="Single LLM response"
            description="Judge the output of an LLM given a text input"
            tone="llm-general"
            selected={textKind === "single"}
            onSelect={() => chooseTextKind("single")}
          />
        </Question>
      )}

      {textKind === "conversation" && conversationKinds.length > 1 && (
        <Question title="What do you want judged?">
          <ChoiceCard
            title="A single reply"
            description="Judge an agent's next reply in a conversation"
            tone="llm"
            selected={value === "llm"}
            onSelect={() => onChange("llm")}
          />
          <ChoiceCard
            title="The whole conversation"
            description="Judge the agent's performance in a whole conversation"
            tone="conversation"
            selected={value === "conversation"}
            onSelect={() => onChange("conversation")}
          />
        </Question>
      )}
    </div>
  );
}
