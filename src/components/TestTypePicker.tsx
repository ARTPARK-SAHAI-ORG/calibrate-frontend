"use client";

import React, { useMemo, useState } from "react";
import { isCreatableTestType } from "@/constants/testTypes";

export type TestTab = "next-reply" | "tool-invocation" | "conversation";

function highlightEvaluatorNames(
  text: string,
  names: string[],
): React.ReactNode[] {
  const escaped = names
    .filter(Boolean)
    .map((n) => n.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));
  if (escaped.length === 0) return [text];
  const parts = text.split(new RegExp(`(${escaped.join("|")})`, "g"));
  return parts.map((part, i) =>
    names.includes(part) ? (
      <span
        key={i}
        className="font-semibold text-foreground bg-foreground/10 rounded px-1 py-0.5"
      >
        {part}
      </span>
    ) : (
      <React.Fragment key={i}>{part}</React.Fragment>
    ),
  );
}

const TEST_TYPE_OPTIONS: Array<{
  tab: TestTab;
  label: string;
  title: string;
  description: string;
}> = [
  {
    tab: "next-reply",
    label: "Agent Response",
    title: "Does the agent give the right reply?",
    description: "Evaluate the agent's response given a conversation history",
  },
  {
    tab: "tool-invocation",
    label: "Tool call",
    title: "Does the agent use the right tool?",
    description:
      "Check whether the agent invokes the correct tool with the right arguments",
  },
  {
    tab: "conversation",
    label: "Conversation",
    title: "Conversation test",
    description: "Generate the agent's reply, then grade the full conversation",
  },
];

// The types offered when making a new test. An existing test of a hidden type
// still opens and edits: only the choice is gone.
const creatableTestTypes = TEST_TYPE_OPTIONS.filter((o) =>
  isCreatableTestType(o.tab),
);

// A short, static example of what one test of the given type actually
// looks like — shown on the picker before the reader commits to it. A
// general agent has no conversation, so its "Agent Response" example is a
// single input/output instead of a back-and-forth.
function testTypePreview(
  tab: TestTab,
  agentNature?: "conversation" | "general",
) {
  if (tab === "tool-invocation") {
    return {
      input: "Book my daughter's vaccination for Tuesday.",
      inputLabel: "User message",
      expectedTool: {
        name: "Book appointment",
        params: [
          { label: "Service", value: "Vaccination" },
          { label: "When", value: "Tuesday" },
        ],
      },
      actualTool: {
        name: "Book appointment",
        params: [
          { label: "Service", value: "Vaccination" },
          { label: "When", value: "Thursday" },
        ],
      },
      checks: [{ name: "Right tool, right details", passed: false }],
      howItWorks:
        "The agent called the right tool for booking appointment but set the day incorrectly as Thursday instead of Tuesday, so this test fails. The agent needs to call the right tool with the right parameters.",
    };
  }
  if (agentNature === "general") {
    return {
      input: "My 6-month-old has had a fever for three days. Come in or wait?",
      output:
        "Bring your baby to the clinic today. In the meantime give 5 ml of paracetamol every four hours.",
      inputLabel: "Input",
      outputLabel: "Agent's output",
      checks: [
        { name: "Advises seeing a clinician", passed: true },
        { name: "Does not prescribe medicines", passed: false },
      ],
      howItWorks:
        "The output says to bring the baby to the clinic today, so Advises seeing a clinician passes. The output also prescribes 5 ml of paracetamol, so Does not prescribe medicines fails. You can add multiple evaluators to grade the agent's output on different dimensions.",
    };
  }
  return {
    turns: [
      { role: "User", text: "I need to rebook my mother's check-up." },
      {
        role: "Agent",
        text: "Of course. We have Friday 11 AM or Saturday 10 AM free.",
      },
      { role: "User", text: "Saturday. What time do you open that day?" },
    ],
    output:
      "Saturdays we open 9 AM to 1 PM. Sundays we are closed. Walk-ins are welcome but mornings get busy, so booking ahead saves you a wait, and you can change your slot any time by calling us.",
    inputLabel: "Conversation history",
    outputLabel: "Agent's reply",
    checks: [
      { name: "Gives the correct opening hours", passed: true },
      { name: "Answers in one short reply", passed: false },
    ],
    howItWorks:
      "The reply gives the right hours, so Gives the correct opening hours passes. The reply is four sentences long, so Answers in one short reply fails. Each evaluator grades the reply on a different dimension.",
  };
}

/**
 * The first step of both test-creation flows: pick what you want to test
 * about the agent, see an example of that kind of test, then continue. Shared
 * by AddTestDialog ("Create a test") and BulkUploadTestsModal ("Bulk upload
 * tests") so the same choice reads and behaves the same way in both.
 */
export function TestTypePicker({
  title,
  agentNature,
  onNext,
  onClose,
}: {
  title: string;
  agentNature?: "conversation" | "general";
  onNext: (tab: TestTab) => void;
  onClose: () => void;
}) {
  // Tapping an option previews what that kind of test looks like; a separate
  // Next confirms it. It opens on the response type, the one most tests are,
  // so the reader lands on a filled-in example rather than an empty panel.
  const [previewTab, setPreviewTab] = useState<TestTab | null>("next-reply");

  // A general agent has no ongoing conversation, so the Conversation test
  // type does not apply — it is excluded on top of whatever is already hidden
  // for everyone via creatableTestTypes. Only the wording differs for the
  // response type: an output for an input, not a reply in a conversation.
  const testTypeOptions = useMemo(
    () =>
      agentNature === "general"
        ? creatableTestTypes
            .filter((opt) => opt.tab !== "conversation")
            .map((opt) =>
              opt.tab === "next-reply"
                ? {
                    ...opt,
                    title: "Does the agent give the right answer?",
                    description: "Evaluate the agent's output given the input",
                  }
                : opt,
            )
        : creatableTestTypes,
    [agentNature],
  );

  return (
    <div className="relative w-full max-w-7xl h-[92vh] mx-4 bg-background rounded-2xl shadow-2xl border border-border flex flex-col overflow-hidden animate-in-scale">
      <div className="flex items-center justify-between px-6 py-4 border-b border-border">
        <h2 className="text-lg font-semibold text-foreground">{title}</h2>
        <button
          data-tour="test-editor-close"
          onClick={onClose}
          className="w-8 h-8 flex items-center justify-center rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted transition-colors cursor-pointer"
          aria-label="Close"
        >
          <svg
            className="w-5 h-5"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={2}
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M6 18L18 6M6 6l12 12"
            />
          </svg>
        </button>
      </div>
      <div
        data-tour="test-type-body"
        className="flex-1 min-h-0 flex flex-col md:flex-row overflow-hidden"
      >
        {/* Left — the type options, one after another. */}
        <div className="px-6 py-5 md:w-96 md:shrink-0 md:border-r border-border overflow-y-auto">
          <label className="block text-base font-medium text-foreground mb-5">
            Select what you want to test about the agent
          </label>
          <div data-tour="test-type-options-list" className="space-y-2">
            {testTypeOptions.map((opt) => {
              const isSelected = previewTab === opt.tab;
              return (
                <button
                  key={opt.tab}
                  type="button"
                  data-tour="test-type-option"
                  data-test-type={opt.tab}
                  onClick={() => setPreviewTab(opt.tab)}
                  className={`relative w-full text-left px-5 py-5 rounded-lg border transition-colors cursor-pointer flex items-center gap-3 ${
                    isSelected
                      ? "border-foreground bg-muted/30"
                      : "border-border bg-background hover:bg-muted/50 hover:border-foreground/40"
                  }`}
                >
                  {/* Radio marker, so the list reads as a choice of one
                          rather than a stack of identical panels. */}
                  <span
                    className={`w-4 h-4 rounded-full border-2 shrink-0 flex items-center justify-center ${
                      isSelected
                        ? "border-foreground"
                        : "border-muted-foreground"
                    }`}
                  >
                    {isSelected && (
                      <span className="w-2 h-2 rounded-full bg-foreground" />
                    )}
                  </span>
                  <span className="text-base font-medium text-foreground">
                    {opt.title}
                  </span>
                  {/* Most tests are of this type, so it is marked and
                          pre-selected rather than leaving the choice cold.
                          The pill straddles the card's top-right corner. */}
                  {opt.tab === "next-reply" && (
                    <span className="absolute -top-2.5 -right-1 rounded-full bg-amber-500/15 backdrop-blur border border-amber-500/40 px-2 py-0.5 text-[11px] font-semibold text-amber-700 dark:text-amber-300">
                      Most popular
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        </div>

        {/* Right — a preview of one run of this test type: what goes
                in, what the agent did, and how each check scored it. Shows a
                real mixed result so it is clear each check scores on its own.
                Empty until an option is tapped. */}
        <div className="flex-1 px-6 py-5 bg-muted/10 min-w-0 overflow-y-auto">
          {previewTab ? (
            (() => {
              const preview = testTypePreview(previewTab, agentNature);
              const toolBlock = (
                tool: {
                  name: string;
                  params: { label: string; value: string }[];
                },
                bad?: boolean,
              ) => (
                <div className="rounded-lg border border-border bg-background px-4 py-3">
                  <div className="text-base font-semibold text-foreground break-words mb-2">
                    {tool.name}
                  </div>
                  <div className="space-y-1.5">
                    {tool.params.map((prm, i) => {
                      const wrong =
                        bad &&
                        preview.expectedTool &&
                        preview.expectedTool.params[i]?.value !== prm.value;
                      return (
                        <div key={prm.label} className="flex gap-2 text-sm">
                          <span className="text-muted-foreground shrink-0 w-20">
                            {prm.label}
                          </span>
                          <span
                            className={`font-medium break-words ${
                              wrong
                                ? "text-red-600 dark:text-red-400"
                                : "text-foreground"
                            }`}
                          >
                            {prm.value}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
              return (
                <div>
                  <div className="text-lg font-semibold text-foreground mb-3">
                    Example
                  </div>
                  <div className="rounded-xl border border-border bg-background shadow-sm overflow-hidden">
                    {/* What goes in: a multi-turn conversation when the
                            test carries one, else a single input. */}
                    <div className="px-5 py-3 first:pt-5 last:pb-5">
                      <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-1.5">
                        {preview.inputLabel}
                      </div>
                      {preview.turns ? (
                        <div className="space-y-1.5">
                          {preview.turns.map((t, i) => (
                            <div
                              key={i}
                              className="flex items-start gap-2.5 text-base"
                            >
                              <span
                                className={`shrink-0 rounded-full px-2 py-0.5 text-xs font-medium mt-0.5 ${
                                  t.role === "User"
                                    ? "bg-sky-500/15 text-sky-700 dark:text-sky-300"
                                    : "bg-violet-500/15 text-violet-700 dark:text-violet-300"
                                }`}
                              >
                                {t.role}
                              </span>
                              <span className="text-foreground break-words leading-relaxed">
                                {t.text}
                              </span>
                            </div>
                          ))}
                        </div>
                      ) : (
                        <div className="text-base text-foreground break-words leading-relaxed">
                          {preview.input}
                        </div>
                      )}
                    </div>

                    {/* What the agent did. For a tool call this is the
                            tool it reached for, next to the one it should
                            have reached for, so the difference is visible. */}
                    {preview.actualTool ? (
                      <>
                        <div className="px-5 py-3 bg-muted/20 first:pt-5 last:pb-5">
                          <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-1.5">
                            Tool the agent used
                          </div>
                          {toolBlock(preview.actualTool, true)}
                        </div>
                        <div className="px-5 py-3 first:pt-5 last:pb-5">
                          <div className="flex items-center gap-2 mb-1.5">
                            <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                              Tool it should have used
                            </span>
                            {/* The verdict sits here rather than in a
                                    section of its own: the comparison it
                                    comes from is right underneath. */}
                            <span
                              className={`w-5 h-5 rounded-full flex items-center justify-center shrink-0 ${
                                preview.checks[0].passed
                                  ? "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400"
                                  : "bg-red-500/15 text-red-600 dark:text-red-400"
                              }`}
                            >
                              <svg
                                className="w-3.5 h-3.5"
                                fill="none"
                                viewBox="0 0 24 24"
                                stroke="currentColor"
                                strokeWidth={3}
                              >
                                <path
                                  strokeLinecap="round"
                                  strokeLinejoin="round"
                                  d={
                                    preview.checks[0].passed
                                      ? "M4.5 12.75l6 6 9-13.5"
                                      : "M6 18L18 6M6 6l12 12"
                                  }
                                />
                              </svg>
                            </span>
                          </div>
                          {toolBlock(preview.expectedTool!)}
                        </div>
                      </>
                    ) : (
                      <div className="px-5 py-3 bg-muted/20 first:pt-5 last:pb-5">
                        <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-1.5">
                          {preview.outputLabel}
                        </div>
                        <div className="text-base text-foreground break-words leading-relaxed">
                          {preview.output}
                        </div>
                      </div>
                    )}

                    {/* How each check scored this run. Skipped for a
                            tool call, whose single verdict is shown above
                            next to the tool it was compared against. */}
                    {!preview.actualTool && (
                      <div className="px-5 py-3 first:pt-5 last:pb-5">
                        <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-1.5">
                          {preview.checks.length > 1
                            ? "Evaluators"
                            : "Evaluator"}
                        </div>
                        <div className="space-y-2">
                          {preview.checks.map((c) => (
                            <div
                              key={c.name}
                              className="flex items-center gap-2.5"
                            >
                              <span
                                className={`w-5 h-5 rounded-full flex items-center justify-center shrink-0 ${
                                  c.passed
                                    ? "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400"
                                    : "bg-red-500/15 text-red-600 dark:text-red-400"
                                }`}
                              >
                                <svg
                                  className="w-3.5 h-3.5"
                                  fill="none"
                                  viewBox="0 0 24 24"
                                  stroke="currentColor"
                                  strokeWidth={3}
                                >
                                  <path
                                    strokeLinecap="round"
                                    strokeLinejoin="round"
                                    d={
                                      c.passed
                                        ? "M4.5 12.75l6 6 9-13.5"
                                        : "M6 18L18 6M6 6l12 12"
                                    }
                                  />
                                </svg>
                              </span>
                              <span className="text-sm font-medium text-foreground">
                                {c.name}
                              </span>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>

                  {/* How this works — why the run scored the way it did. */}
                  <div className="mt-5 rounded-lg bg-blue-500/5 border border-blue-500/20 px-5 py-4">
                    <div className="text-sm font-semibold text-foreground mb-1.5">
                      How this works
                    </div>
                    <div className="text-sm text-foreground leading-relaxed">
                      {highlightEvaluatorNames(
                        preview.howItWorks,
                        preview.checks.map((c) => c.name),
                      )}
                    </div>
                  </div>
                </div>
              );
            })()
          ) : (
            <div className="h-full flex items-center justify-center text-sm text-muted-foreground text-center px-4">
              Pick a type on the left to see what it looks like
            </div>
          )}
        </div>
      </div>

      {/* Footer — spans both columns, one Create action once a type has
              been previewed. */}
      <div className="px-6 py-4 border-t border-border flex justify-end">
        <button
          type="button"
          data-tour="test-type-next"
          onClick={() => previewTab && onNext(previewTab)}
          disabled={!previewTab}
          className="h-10 px-5 rounded-lg text-sm font-medium bg-foreground text-background hover:opacity-90 transition-opacity cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
        >
          Next
        </button>
      </div>
    </div>
  );
}
