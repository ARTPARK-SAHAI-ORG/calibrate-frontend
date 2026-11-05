"use client";

import type { ReactNode } from "react";
import { useDialogNavKeys } from "@/hooks/useDialogNavKeys";
import type { LabellingJobKind } from "@/lib/onboarding/tours/labellingJob";

const CARD =
  "bg-background text-foreground rounded-2xl p-3.5 shadow-md text-[13px] w-full md:w-auto";
const CAPTION = "text-[11px] font-semibold mt-2 first:mt-0";

function Asked({ children }: { children: ReactNode }) {
  return (
    <p className="bg-muted rounded-lg px-2.5 py-1.5 mt-1.5 ml-6">{children}</p>
  );
}
function Replied({ children }: { children: ReactNode }) {
  return (
    <p className="border border-border rounded-lg px-2.5 py-1.5 mt-1.5 mr-3">
      {children}
    </p>
  );
}
function ToolCall({ day }: { day: string }) {
  return (
    <div className="bg-muted rounded-lg px-2.5 py-2 mt-1">
      <p className="font-semibold">book_visit</p>
      <p className="bg-background rounded px-2 py-1 mt-1">{day}</p>
    </div>
  );
}
const WAVE = [6, 12, 18, 9, 16, 22, 11, 7, 15, 20, 10, 5, 14, 19, 8, 12, 17, 6];

/** What the labeller is told to do, and a small example of it, per kind of job.
 *  `pickSecond` marks the examples where the second answer is the right one. */
const INTRO: Record<
  LabellingJobKind,
  {
    line: string;
    item: ReactNode;
    question: string;
    answers: [string, string];
    pickSecond?: boolean;
  }
> = {
  llm: {
    line: "Read each conversation and answer the questions about it",
    question: "Is the reply correct?",
    answers: ["Correct", "Wrong"],
    item: (
      <>
        <Asked>What time does the clinic open?</Asked>
        <p className={CAPTION}>Agent</p>
        <Replied>The clinic opens at 9 in the morning.</Replied>
      </>
    ),
  },
  conversation: {
    line: "Read each conversation and answer the questions about it",
    question: "Was the agent polite?",
    answers: ["Yes", "No"],
    item: (
      <>
        <Asked>My baby has a fever</Asked>
        <p className={CAPTION}>Agent</p>
        <Replied>When was the last vaccine?</Replied>
        <Asked>Yesterday</Asked>
      </>
    ),
  },
  "llm-general": {
    line: "Read each input and output and answer the questions about them",
    question: "Is the output correct?",
    answers: ["Correct", "Wrong"],
    item: (
      <>
        <p className={CAPTION}>Input</p>
        <p className="mt-1">Summarise: the clinic opens at 9.</p>
        <p className={CAPTION}>Output</p>
        <p className="mt-1">Opens at 9.</p>
      </>
    ),
  },
  stt: {
    line: "Compare each pair of transcripts and answer the questions about them",
    question: "Do they match?",
    answers: ["Yes", "No"],
    pickSecond: true,
    item: (
      <>
        <p className={CAPTION}>What the speaker said</p>
        <p className="mt-1">
          The clinic opens at{" "}
          <b className="rounded bg-green-100 px-1 dark:bg-green-500/20">nine</b>
        </p>
        <p className={CAPTION}>What the system wrote</p>
        <p className="mt-1">
          The clinic opens at{" "}
          <b className="rounded bg-red-100 px-1 dark:bg-red-500/20">five</b>
        </p>
      </>
    ),
  },
  tts: {
    line: "Listen to each audio clip and answer the questions about it",
    question: "Does the audio match?",
    answers: ["Yes", "No"],
    item: (
      <>
        <div className="flex items-center gap-2 bg-muted rounded-full p-1.5 pr-3">
          <span className="w-7 h-7 rounded-full bg-foreground flex items-center justify-center shrink-0">
            <span className="w-0 h-0 ml-0.5 border-l-[9px] border-l-background border-y-[6px] border-y-transparent" />
          </span>
          <span className="flex items-center gap-0.5 h-6">
            {WAVE.map((height, i) => (
              <span
                key={i}
                className="w-[3px] rounded-sm bg-indigo-500"
                style={{ height }}
              />
            ))}
          </span>
        </div>
        <p className={CAPTION}>It should say</p>
        <p className="mt-1">The clinic opens at 9.</p>
      </>
    ),
  },
  "tool-call": {
    line: "Compare the agent's answer with the expected one, then answer the questions about it",
    question: "Is the answer right?",
    answers: ["Correct", "Wrong"],
    pickSecond: true,
    item: (
      <>
        <p className={CAPTION}>Agent&apos;s answer</p>
        <ToolCall day="Tuesday" />
        <p className={CAPTION}>Expected answer</p>
        <ToolCall day="Monday" />
      </>
    ),
  },
};

/** The first thing a labeller sees on a job: what they are here to do. Skipping
 *  ends here; Begin goes on to the walkthrough of the real page. */
export function LabellingJobIntro({
  kind,
  onSkip,
  onStart,
}: {
  kind: LabellingJobKind;
  onSkip: () => void;
  onStart: () => void;
}) {
  useDialogNavKeys({ isOpen: true, onClose: onSkip });
  const { line, item, question, answers, pickSecond } = INTRO[kind];
  const answer = (text: string, picked: boolean) => (
    <span
      className={`flex-1 rounded-lg py-2 text-center ${
        !picked
          ? "border border-border"
          : pickSecond
            ? "bg-red-600 text-white font-medium"
            : "bg-green-600 text-white font-medium"
      }`}
    >
      {text}
    </span>
  );
  return (
    <div className="fixed inset-0 z-50 flex items-end md:items-center md:justify-center bg-black/50 md:p-4">
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="labelling-intro-title"
        className="bg-background w-full md:max-w-[560px] rounded-t-2xl md:rounded-2xl shadow-2xl overflow-hidden max-h-full overflow-y-auto"
      >
        <div
          aria-hidden
          className="flex flex-col md:flex-row items-center justify-center gap-3 p-5 md:p-6 bg-gradient-to-br from-blue-50 to-emerald-50 dark:from-blue-500/10 dark:to-emerald-500/10"
        >
          <div className={`${CARD} md:w-60 md:shrink-0`}>{item}</div>
          <svg
            className="w-6 h-6 shrink-0 rotate-90 md:rotate-0 text-foreground"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={2}
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M5 12h14m-6-6l6 6-6 6"
            />
          </svg>
          <div className={`${CARD} md:w-48 md:shrink-0`}>
            <p className="font-semibold mb-2.5">{question}</p>
            <div className="flex gap-1.5">
              {answer(answers[0], !pickSecond)}
              {answer(answers[1], !!pickSecond)}
            </div>
          </div>
        </div>
        <div className="p-5">
          <h2
            id="labelling-intro-title"
            className="text-lg font-semibold text-foreground"
          >
            Welcome to your labelling task
          </h2>
          <p className="text-sm text-foreground mt-1.5">{line}</p>
          <div className="mt-4 flex justify-end gap-2">
            <button
              type="button"
              onClick={onSkip}
              className="h-9 px-3 rounded-md text-sm font-medium border border-border bg-background text-foreground hover:bg-muted/50 transition-colors cursor-pointer outline-none focus-visible:ring-2 focus-visible:ring-foreground/30"
            >
              Skip
            </button>
            <button
              type="button"
              autoFocus
              onClick={onStart}
              className="h-9 px-4 rounded-md text-sm font-medium bg-foreground text-background hover:opacity-90 transition-opacity cursor-pointer outline-none focus-visible:ring-2 focus-visible:ring-foreground/30"
            >
              Begin
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
