/**
 * The walkthrough of a labelling job, shown to a labeller after the intro window
 * (`LabellingJobIntro`). It highlights the real page, so only the parts this job
 * and item actually have get a step.
 */

import { EVAL_TARGET_CHIP_CLASS } from "@/components/test-results/evalTargetChip";
import type { Tour, TourStep } from "../engine";

// A card that names something on the page draws it the way the page does, so
// the reader can match the two. Headings on the page are bold; buttons and tags
// look like themselves.
const heading = (text: string) => `<strong>${text}</strong>`;
const pageButton = (text: string) =>
  `<span class="inline-flex items-center px-1.5 rounded border border-border bg-background text-xs font-medium text-foreground">${text}</span>`;
const EVALUATION_TARGET = `<span class="${EVAL_TARGET_CHIP_CLASS}">Evaluation target</span>`;

/** Each job has its own seen flag: a labeller gets the intro on every new job. */
export const labellingJobTourId = (jobUuid: string) =>
  `labelling-job:${jobUuid}`;

export type LabellingJobKind =
  "llm" | "conversation" | "llm-general" | "stt" | "tts" | "tool-call";

export type LabellingTourQuestion = {
  uuid: string;
  outputType: "binary" | "rating";
  reasoningMode: "optional" | "required" | "hidden";
  /** What a binary question's two answers are called, such as Pass and Fail. */
  trueLabel?: string;
  falseLabel?: string;
  scaleMin?: number;
  scaleMax?: number;
};

const READ_STEP: Record<
  LabellingJobKind,
  { title: string; description: string }
> = {
  llm: {
    title: "Read the conversation",
    description: `The reply marked ${EVALUATION_TARGET} is the one you are checking`,
  },
  conversation: {
    title: "Read the conversation",
    description: "You are checking the whole conversation",
  },
  "llm-general": {
    title: "Read the input and output",
    description: `${heading("Input")} is what the agent was given. ${heading("Output")} is what it gave back.`,
  },
  stt: {
    title: "Compare the transcripts",
    description: `${heading("Reference transcript")} is what the speaker said. ${heading("Predicted transcript")} is what the system wrote down.`,
  },
  tts: {
    title: "Listen to the audio",
    description: `${heading("Generated audio")} is what the system said. ${heading("Reference text")} is what it was asked to say.`,
  },
  "tool-call": {
    title: "Compare the two answers",
    description: `${heading("Agent's answer")} is what the agent did. ${heading("Expected answer")} is what it should have done.`,
  },
};

function reasonDescription(questions: LabellingTourQuestion[]): string | null {
  const modes = questions.map((q) => q.reasoningMode);
  const required = modes.filter((m) => m === "required").length;
  const optional = modes.filter((m) => m === "optional").length;
  if (required + optional === 0) return null;
  const opens = "After you answer, a box opens for your reason.";
  if (required === 0) return `${opens} A reason is optional.`;
  if (optional === 0 && required === modes.length)
    return `${opens} You must write one before you can save.`;
  return `${opens} Some questions need one before you can save.`;
}

export function buildLabellingJobTour({
  jobUuid,
  kind,
  hasItemDetails,
  questions,
  commentsEnabled,
}: {
  jobUuid: string;
  kind: LabellingJobKind;
  hasItemDetails: boolean;
  questions: LabellingTourQuestion[];
  commentsEnabled: boolean;
}): Tour {
  const anchorOf = (q: LabellingTourQuestion) => `#question-${q.uuid}`;
  const firstChoice = questions.find((q) => q.outputType === "binary");
  const firstRating = questions.find((q) => q.outputType === "rating");
  const reason = reasonDescription(questions);
  const reasonQuestion = questions.find((q) => q.reasoningMode !== "hidden");

  const steps: TourStep[] = [
    { anchor: '[data-tutorial="job-item"]', side: "right", ...READ_STEP[kind] },
  ];
  if (hasItemDetails)
    steps.push({
      anchor: '[data-tutorial="item-details"]',
      side: "left",
      title: "Open Item details for more",
      description: `Click ${heading("Item details")} to see more about the item. Click again to close it.`,
    });
  if (firstChoice)
    steps.push({
      anchor: anchorOf(firstChoice),
      side: "left",
      title: "Binary questions",
      description: `Select ${pageButton(firstChoice.trueLabel ?? "Correct")} or ${pageButton(firstChoice.falseLabel ?? "Wrong")}. Click it again to unselect it.`,
    });
  if (firstRating)
    steps.push({
      anchor: anchorOf(firstRating),
      side: "left",
      title: "Rating questions",
      description: `Select the right rating.${
        firstRating.scaleMin !== undefined && firstRating.scaleMax !== undefined
          ? ` ${firstRating.scaleMin} is the lowest and ${firstRating.scaleMax} is the highest.`
          : ""
      } Click it again to unselect it.`,
    });
  if (reason && reasonQuestion)
    steps.push({
      anchor: anchorOf(reasonQuestion),
      side: "left",
      title: "Add a reason",
      description: reason,
    });
  if (commentsEnabled)
    steps.push({
      anchor: '[data-tutorial="job-comments"]',
      side: "left",
      title: "Leave a comment",
      description: "Add any notes about the item here. This is optional.",
    });
  if (questions.length > 0)
    steps.push({
      anchor: '[data-tutorial="job-progress"]',
      side: "bottom",
      title: "Check your progress",
      description:
        questions.length > 1
          ? "A green bar fills here as you answer. Click a number to go to that question."
          : "A green bar fills here as you answer",
    });
  steps.push({
    anchor: '[data-tutorial="job-save"]',
    side: "bottom",
    align: "end",
    title: "Save your answers",
    description: `Press this to save your answers and go to the next item. You can also move between items with ${pageButton("Previous")}, ${pageButton("Next")} or the up and down arrow keys.`,
    actionLabel: "Start labelling",
  });
  return {
    id: labellingJobTourId(jobUuid),
    steps,
    showStepCount: true,
    allowBack: true,
  };
}
