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

/**
 * One question. Only the first carries a heading: the ones under it are read
 * as the answer to the card just chosen, and giving each its own heading made
 * three near-identical questions on one screen.
 */
function Question({
  title,
  children,
}: {
  title?: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      {title && (
        <label className="block text-sm font-medium mb-3">{title}</label>
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
 * Every answer has a colour of its own, so no two cards a reader can see at
 * once are the same. Once a question is answered the option not taken fades
 * back, leaving the chosen path the thing the eye follows down the screen.
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
}: {
  allowed: EvaluatorType[];
  value: EvaluatorType | null;
  onChange: (value: EvaluatorType | null) => void;
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
        <Question title="What do you want to label?">
          <ChoiceCard
            title="Text"
            description="Label conversations or single LLM responses"
            tone="amber"
            selected={medium === "text"}
            dimmed={medium === "voice"}
            onSelect={() => chooseMedium("text")}
          />
          <ChoiceCard
            title="Voice"
            description="Label audio transcripts or generated audio files"
            tone="rose"
            selected={medium === "voice"}
            dimmed={medium === "text"}
            onSelect={() => chooseMedium("voice")}
          />
        </Question>
      )}

      {medium === "voice" && voiceKinds.length > 1 && (
        <Question>
          <ChoiceCard
            title="Speech to Text"
            description="Judge transcription accuracy against a reference transcript"
            tone="blue"
            selected={value === "stt"}
            dimmed={value === "tts"}
            onSelect={() => onChange("stt")}
          />
          <ChoiceCard
            title="Text to Speech"
            description="Judge the quality of generated audio"
            tone="purple"
            selected={value === "tts"}
            dimmed={value === "stt"}
            onSelect={() => onChange("tts")}
          />
        </Question>
      )}

      {medium === "text" && !forcedTextKind && (
        /* The same question, the same two answers and the same words as the
           new agent screen, so one idea is not named two ways. */
        <Question>
          <ChoiceCard
            title="Conversation"
            description="Your agent has a conversation with a user"
            tone="indigo"
            selected={textKind === "conversation"}
            dimmed={textKind === "single"}
            onSelect={() => chooseTextKind("conversation")}
          />
          <ChoiceCard
            title="Single LLM response"
            description="The agent takes an input and generates an output"
            tone="teal"
            selected={textKind === "single"}
            dimmed={textKind === "conversation"}
            onSelect={() => chooseTextKind("single")}
          />
        </Question>
      )}

      {textKind === "conversation" && conversationKinds.length > 1 && (
        <Question>
          <ChoiceCard
            title="A single reply"
            description="Judge an agent's next reply in a conversation"
            tone="orange"
            selected={value === "llm"}
            dimmed={value === "conversation"}
            onSelect={() => onChange("llm")}
          />
          <ChoiceCard
            title="The whole conversation"
            description="Judge the agent's performance in a whole conversation"
            tone="pink"
            selected={value === "conversation"}
            dimmed={value === "llm"}
            onSelect={() => onChange("conversation")}
          />
        </Question>
      )}
    </div>
  );
}
