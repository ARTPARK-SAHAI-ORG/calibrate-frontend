/**
 * The walkthrough of a labelling job, shown to a labeller after the intro window
 * (`LabellingJobIntro`). It highlights the real page, so only the parts this job
 * and item actually have get a step.
 */

import type { Tour, TourStep } from "../engine";

export const LABELLING_JOB_TOUR_ID = "labelling-job";

export type LabellingJobKind =
  "llm" | "conversation" | "llm-general" | "stt" | "tts" | "tool-call";

export type LabellingTourQuestion = {
  uuid: string;
  outputType: "binary" | "rating";
  reasoningMode: "optional" | "required" | "hidden";
};

const READ_STEP: Record<
  LabellingJobKind,
  { title: string; description: string }
> = {
  llm: {
    title: "Read the conversation",
    description:
      "The reply marked Evaluation target is the one you are checking",
  },
  conversation: {
    title: "Read the conversation",
    description: "You are checking the whole conversation",
  },
  "llm-general": {
    title: "Read the input and output",
    description:
      "Input is what the agent was given. Output is what it gave back.",
  },
  stt: {
    title: "Compare the transcripts",
    description:
      "Reference transcript is what the speaker said. Predicted transcript is what the system wrote down.",
  },
  tts: {
    title: "Listen to the audio",
    description:
      "Generated audio is what the system said. Reference text is what it was asked to say.",
  },
  "tool-call": {
    title: "Compare the two answers",
    description:
      "Agent's answer is what the agent did. Expected answer is what it should have done.",
  },
};

function reasonDescription(questions: LabellingTourQuestion[]): string | null {
  const modes = questions.map((q) => q.reasoningMode);
  const required = modes.filter((m) => m === "required").length;
  const optional = modes.filter((m) => m === "optional").length;
  if (required + optional === 0) return null;
  const opens = "A box opens under a question once you pick an answer.";
  if (required === 0) return `${opens} A reason is optional.`;
  if (optional === 0 && required === modes.length)
    return `${opens} You need to write a reason before you can save.`;
  return `${opens} Some questions need a reason before you can save.`;
}

export function buildLabellingJobTour({
  kind,
  hasItemDetails,
  questions,
  commentsEnabled,
}: {
  kind: LabellingJobKind;
  hasItemDetails: boolean;
  questions: LabellingTourQuestion[];
  commentsEnabled: boolean;
}): Tour {
  const anchorOf = (q: LabellingTourQuestion) => `#question-${q.uuid}`;
  const firstChoice = questions.find((q) => q.outputType === "binary");
  const firstScore = questions.find((q) => q.outputType === "rating");
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
      description:
        "Some items come with extra information. Click to open it, and click again to close it.",
    });
  if (firstChoice)
    steps.push({
      anchor: anchorOf(firstChoice),
      side: "left",
      title: firstScore
        ? "Some questions have choices"
        : "Answer each question",
      description: "Click the choice that fits. Click it again to unselect it.",
    });
  if (firstScore)
    steps.push({
      anchor: anchorOf(firstScore),
      side: "left",
      title: firstChoice
        ? "Some questions ask for a score"
        : "Answer each question",
      description: "Click the score that fits. Click it again to unselect it.",
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
      description:
        "Use this for anything else you want to say about the item. It is optional.",
    });
  if (questions.length > 0)
    steps.push({
      anchor: '[data-tutorial="job-progress"]',
      side: "bottom",
      title: "Check your progress",
      description:
        questions.length > 1
          ? "A green bar appears here and fills as you answer. The numbers take you to each question."
          : "A green bar appears here and fills as you answer",
    });
  steps.push({
    anchor: '[data-tutorial="job-save"]',
    side: "bottom",
    align: "end",
    title: "Save your answers",
    description:
      "Press this when you finish an item. It saves your answers and opens the next one. Previous, Next and the up and down arrow keys also move between items.",
    actionLabel: "Start labelling",
  });
  return { id: LABELLING_JOB_TOUR_ID, steps };
}
