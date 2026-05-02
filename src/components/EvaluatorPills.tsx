"use client";

import React from "react";
import { Tooltip } from "@/components/Tooltip";

type Kind = "single" | "side_by_side";
type OutputType = "binary" | "rating";
export type EvaluatorType = "tts" | "stt" | "llm" | "simulation";

const baseClasses =
  "inline-flex items-center px-2 py-0.5 rounded-md text-[10px] md:text-[11px] font-medium uppercase tracking-wide";

export function DefaultPill() {
  return (
    <span className={`${baseClasses} bg-foreground text-background`}>
      Default
    </span>
  );
}

export const EVALUATOR_TYPE_LABELS: Record<EvaluatorType, string> = {
  tts: "Text to Speech",
  stt: "Speech to Text",
  llm: "LLM Response",
  simulation: "Simulation",
};

export const EVALUATOR_TYPE_TOOLTIPS: Record<EvaluatorType, string> = {
  tts: "Evaluate the quality of generated audio.",
  stt: "Evaluate the output of transcription of an audio.",
  llm: "Given a conversation history, evaluate the agent's next response.",
  simulation: "Evaluate an entire conversation history from a simulation.",
};

const EVALUATOR_TYPE_COLORS: Record<EvaluatorType, string> = {
  tts: "bg-purple-500/10 text-purple-600 dark:text-purple-400",
  stt: "bg-blue-500/10 text-blue-600 dark:text-blue-400",
  llm: "bg-orange-500/10 text-orange-600 dark:text-orange-400",
  simulation: "bg-pink-500/10 text-pink-600 dark:text-pink-400",
};

export function EvaluatorTypePill({
  evaluatorType,
}: {
  evaluatorType: EvaluatorType;
}) {
  return (
    <Tooltip content={EVALUATOR_TYPE_TOOLTIPS[evaluatorType]} position="top">
      <span
        className={`${baseClasses} ${EVALUATOR_TYPE_COLORS[evaluatorType]} cursor-pointer`}
      >
        {EVALUATOR_TYPE_LABELS[evaluatorType]}
      </span>
    </Tooltip>
  );
}

const KIND_TOOLTIPS: Record<Kind, string> = {
  single: "Evaluates a single response from the agent.",
  side_by_side: "Compares two outputs side by side and picks a winner.",
};

const KIND_LABELS: Record<Kind, string> = {
  single: "Single",
  side_by_side: "Side by side",
};

export function KindPill({ kind }: { kind: Kind }) {
  return (
    <Tooltip content={KIND_TOOLTIPS[kind]} position="top">
      <span
        className={`${baseClasses} bg-muted text-muted-foreground cursor-pointer`}
      >
        {KIND_LABELS[kind]}
      </span>
    </Tooltip>
  );
}

const OUTPUT_TYPE_TOOLTIPS: Record<OutputType, string> = {
  binary: "Returns a pass or fail judgement for each evaluation",
  rating: "Returns a numeric score on a rating scale",
};

const OUTPUT_TYPE_LABELS: Record<OutputType, string> = {
  binary: "Binary",
  rating: "Rating",
};

export function OutputTypePill({ outputType }: { outputType: OutputType }) {
  const color =
    outputType === "rating"
      ? "bg-amber-500/10 text-amber-600 dark:text-amber-400"
      : "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400";
  return (
    <Tooltip content={OUTPUT_TYPE_TOOLTIPS[outputType]} position="top">
      <span className={`${baseClasses} ${color} cursor-pointer`}>
        {OUTPUT_TYPE_LABELS[outputType]}
      </span>
    </Tooltip>
  );
}
