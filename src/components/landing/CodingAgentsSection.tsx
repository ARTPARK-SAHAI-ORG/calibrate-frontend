"use client";

import { useState } from "react";

/** The coding agents the skills can be installed into. `flag` is what goes
 * after `--agent` in the install command, `label` is what the reader calls it. */
const AGENTS: { id: string; label: string; flag: string }[] = [
  { id: "claude-code", label: "Claude Code", flag: "claude-code" },
  { id: "cursor", label: "Cursor", flag: "cursor" },
  { id: "codex", label: "Codex", flag: "codex" },
  { id: "windsurf", label: "Windsurf", flag: "windsurf" },
];

/** Teaches the coding agent how to use Calibrate. Documented at
 * {docs}/agents/overview. */
export function installCommand(agentFlag: string): string {
  return `npx skills add dalmia/calibrate-skills --agent ${agentFlag} -g`;
}

/** The made-up request in the example window. Kept short so it reads as
 * something a person would actually type. */
const EXAMPLE_PROMPT =
  "My LLM judge does not agree with my reviewers often enough. Fix it.";

/** What the agent reports back, line by line. `result` lines are the numbers
 * the reader is meant to notice. */
const EXAMPLE_STEPS: { text: string; result?: boolean }[] = [
  { text: "Read the 120 samples your reviewers labelled" },
  { text: "Ran the LLM judge on the same samples" },
  { text: "Agreement with your reviewers: 71%", result: true },
  { text: "Rewrote the judge instructions and ran them again" },
  { text: "Agreement with your reviewers: 88%", result: true },
  { text: "Rewrote the judge instructions and ran them again" },
  { text: "Agreement with your reviewers: 94%", result: true },
  { text: "Made this the live judge and kept the earlier versions" },
];

const THINGS_TO_ASK: { title: string; description: string }[] = [
  {
    title: "Write the test cases",
    description:
      "Turn a spreadsheet, past conversations, or a description of what your users ask into a set of tests.",
  },
  {
    title: "Find where the agent fails",
    description:
      "Run the tests, read every failure, and say what went wrong in each one.",
  },
  {
    title: "Suggest what to change",
    description:
      "Recommend edits to your agent's instructions, based on the failures it just read.",
  },
  {
    title: "Set up human review",
    description:
      "Create a labelling task, add the samples, and produce a link for each reviewer.",
  },
  {
    title: "Compare the LLM judge with people",
    description:
      "Show every sample where the LLM judge and your reviewers disagreed, and why.",
  },
  {
    title: "Keep tuning until it is good enough",
    description:
      "Rewrite the judge instructions and run them again, until agreement reaches the level you asked for.",
  },
];

/**
 * Tells readers that Calibrate can be driven from the coding agent they already
 * use. The window is an illustration drawn in the page, not a screenshot, so it
 * stays sharp and readable on every screen.
 */
export function CodingAgentsSection() {
  const [agent, setAgent] = useState(AGENTS[0]);
  const [copied, setCopied] = useState(false);

  const command = installCommand(agent.flag);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(command);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard blocked by the browser: the command is on screen to copy by hand.
    }
  };

  return (
    <div className="max-w-6xl mx-auto">
      <div className="text-center mb-10 md:mb-14">
        <div className="mb-4 flex justify-center md:mb-6">
          <span className="inline-block rounded-md border border-emerald-200/90 bg-emerald-50/90 px-1.5 py-0.5 text-[10px] md:text-[11px] font-semibold uppercase tracking-wider text-emerald-950 shadow-[0_1px_0_rgba(0,0,0,0.04)]">
            New
          </span>
        </div>
        <h2 className="text-3xl md:text-4xl lg:text-5xl font-medium text-gray-900 mb-4 md:mb-6 leading-[1.1] tracking-[-0.02em]">
          Ask your coding agent to do the work
        </h2>
        <p className="text-base md:text-xl text-gray-500 max-w-3xl mx-auto">
          Calibrate works inside Claude Code, Cursor, Codex and Windsurf. Ask
          for what you want in ordinary words and your agent builds the tests,
          runs them, reads the failures, and tells you what to change.
        </p>
      </div>

      <div className="rounded-2xl border border-gray-800 bg-gray-900 shadow-xl overflow-hidden">
        <div className="flex items-center gap-2 border-b border-white/10 px-4 py-3">
          <span className="h-3 w-3 rounded-full bg-gray-600" aria-hidden />
          <span className="h-3 w-3 rounded-full bg-gray-700" aria-hidden />
          <span className="h-3 w-3 rounded-full bg-gray-700" aria-hidden />
          <span className="ml-2 font-mono text-xs text-gray-400">
            {agent.label}
          </span>
          <span className="ml-auto text-[11px] uppercase tracking-wider text-gray-500">
            Example
          </span>
        </div>
        <div className="p-5 md:p-7 font-mono text-[13px] leading-relaxed md:text-sm">
          <p className="flex gap-3 text-white">
            <span className="text-emerald-400" aria-hidden>
              &gt;
            </span>
            <span>{EXAMPLE_PROMPT}</span>
          </p>
          <ul className="mt-5 space-y-2.5">
            {/* Two of the lines repeat word for word, which is the point of
                the loop, so the position is what identifies a line. */}
            {EXAMPLE_STEPS.map((step, index) => (
              <li
                key={index}
                className={`flex gap-3 ${
                  step.result ? "text-emerald-300" : "text-gray-400"
                }`}
              >
                <span aria-hidden>{step.result ? "✓" : "·"}</span>
                <span>{step.text}</span>
              </li>
            ))}
          </ul>
        </div>
      </div>

      <div className="mt-12 md:mt-16">
        <h3 className="text-center text-xl md:text-2xl font-semibold text-gray-900 mb-6 md:mb-8">
          What you can ask for
        </h3>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 md:gap-6">
          {THINGS_TO_ASK.map((item) => (
            <div
              key={item.title}
              className="rounded-2xl border border-gray-200 bg-white p-5 md:p-6 text-left shadow-sm"
            >
              <h4 className="text-base md:text-lg font-semibold text-gray-900 mb-2">
                {item.title}
              </h4>
              <p className="text-sm md:text-[15px] text-gray-500 leading-relaxed">
                {item.description}
              </p>
            </div>
          ))}
        </div>
      </div>

      <div className="mt-10 md:mt-14 flex flex-col items-center gap-4">
        <div
          className="flex flex-wrap justify-center gap-2"
          role="group"
          aria-label="Choose your coding agent"
        >
          {AGENTS.map((option) => (
            <button
              key={option.id}
              type="button"
              onClick={() => {
                setAgent(option);
                setCopied(false);
              }}
              aria-pressed={option.id === agent.id}
              className={`rounded-lg border px-3 py-1.5 text-sm font-medium transition-colors cursor-pointer ${
                option.id === agent.id
                  ? "border-gray-900 bg-gray-900 text-white"
                  : "border-gray-300 text-gray-700 hover:bg-gray-50"
              }`}
            >
              {option.label}
            </button>
          ))}
        </div>
        <div className="flex w-full max-w-2xl items-center gap-3 overflow-hidden rounded-xl border border-gray-200 bg-gray-50 px-4 py-3">
          <code className="min-w-0 flex-1 overflow-x-auto whitespace-nowrap font-mono text-xs md:text-sm text-gray-800">
            {command}
          </code>
          <button
            type="button"
            onClick={handleCopy}
            className={`shrink-0 rounded-md px-2.5 py-1.5 text-xs font-medium transition-colors cursor-pointer ${
              copied
                ? "bg-emerald-100 text-emerald-800"
                : "text-gray-500 hover:bg-gray-200 hover:text-gray-900"
            }`}
          >
            {copied ? "Copied" : "Copy"}
          </button>
        </div>
        <a
          href={`${process.env.NEXT_PUBLIC_DOCS_URL}/agents/overview`}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-2 px-5 md:px-6 py-2.5 md:py-3 text-sm md:text-base font-medium bg-gray-900 text-white rounded-lg hover:bg-gray-800 transition-colors cursor-pointer"
        >
          Read the docs
        </a>
      </div>
    </div>
  );
}
