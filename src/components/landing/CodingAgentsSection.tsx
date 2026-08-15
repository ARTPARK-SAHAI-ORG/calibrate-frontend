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

type ExampleStep = { text: string; result?: boolean };

/** The three examples worth showing in full. Each is a made-up but faithful
 * version of what the skills already do: /onboard, reading a failed run, and
 * tuning a judge against human labels. `result` lines are the numbers the
 * reader is meant to notice. */
const EXAMPLES: {
  key: string;
  title: string;
  description: string;
  prompt: string;
  steps: ExampleStep[];
}[] = [
  {
    key: "build",
    title: "Get your evals created just by talking about your agent",
    description:
      "Your AI tool asks what your agent does, who it serves, and where it goes wrong today, then turns your answers into evals and runs them.",
    prompt: "/onboard",
    steps: [
      {
        text: "Asked what your agent does, who it talks to, and what a good answer looks like",
      },
      {
        text: "Connected your agent and checked its reply comes back the way Calibrate expects",
      },
      { text: "Wrote 24 test cases from the mistakes you described" },
      { text: "Picked an LLM judge for the cases that need one" },
      { text: "Ran them: 18 passed, 6 failed", result: true },
    ],
  },
  {
    key: "fix",
    title: "Analyse the mistakes and get fixes to try",
    description:
      "Your AI tool reads every test that failed, works out what they have in common, and proposes changes to your agent's instructions.",
    prompt: "Which tests failed last time, and what should I change?",
    steps: [
      { text: "Read the 6 tests that failed" },
      { text: "4 of them: replied in English when the caller wrote in Hindi" },
      { text: "2 of them: gave advice that should have come from a nurse" },
      { text: "Proposed two changes to your agent's instructions" },
      { text: "Ran the tests again: 23 of 24 passed", result: true },
    ],
  },
  {
    key: "judge",
    title: "Align the LLM judge with your experts",
    description:
      "Your AI tool compares the judge's scores with the human labels, rewrites the judge instructions, and repeats until they agree often enough.",
    prompt: "My LLM judge does not agree with my experts often enough. Fix it.",
    steps: [
      { text: "Read the 120 samples your experts labelled" },
      { text: "Ran the LLM judge on the same samples" },
      { text: "Agreement with your experts: 71%", result: true },
      { text: "Rewrote the judge instructions and ran them again" },
      { text: "Agreement with your experts: 88%", result: true },
      { text: "Rewrote the judge instructions and ran them again" },
      { text: "Agreement with your experts: 94%", result: true },
      { text: "Made this the live judge and kept the earlier versions" },
    ],
  },
];

/** The title says what the reader gets, the description says how it happens.
 * Each one maps to something the skills can really do through the public API,
 * so do not add one without an endpoint behind it: there is no way to create
 * labelling jobs or hand out a link per reviewer, for instance. */
const THINGS_TO_ASK: { title: string; description: string }[] = [
  {
    title: "Start testing an agent you already have",
    description:
      "Add your agent to Calibrate, send it a test message, and check the reply comes back the way Calibrate expects.",
  },
  {
    title: "Turn a dataset you already have into tests",
    description:
      "Point it at a spreadsheet, a data file, or a public dataset, and it loads the rows as test cases.",
  },
  {
    title: "Find the best model for your agent",
    description:
      "Try the same tests on several models and get a leaderboard across quality, cost and speed.",
  },
  {
    title: "Catch a mistake before it reaches people",
    description:
      "Your AI tool writes the setup into your code, so the tests are checked on their own every time the code changes.",
  },
  {
    title: "Get the answers reviewed by your experts",
    description:
      "Create a labelling task, pick the LLM judges to align, add the samples experts will review, and update them as human labels come in.",
  },
  {
    title: "Decide what counts as a good answer",
    description:
      "Write an LLM judge for the criteria your experts care about, add a new version of its instructions, and choose which one is live.",
  },
];

/** One drawn window: the request on top, what the agent reports back below.
 * Drawn in the page rather than a screenshot, so it stays sharp at every
 * width and the reader can select the text. */
function ExampleWindow({
  agentLabel,
  prompt,
  steps,
}: {
  agentLabel: string;
  prompt: string;
  steps: ExampleStep[];
}) {
  return (
    <div className="rounded-2xl border border-gray-800 bg-gray-900 shadow-xl overflow-hidden">
      <div className="flex items-center gap-2 border-b border-white/10 px-4 py-3">
        <span className="h-3 w-3 rounded-full bg-gray-600" aria-hidden />
        <span className="h-3 w-3 rounded-full bg-gray-700" aria-hidden />
        <span className="h-3 w-3 rounded-full bg-gray-700" aria-hidden />
        <span className="ml-2 font-mono text-xs text-gray-400">
          {agentLabel}
        </span>
        <span className="ml-auto text-[11px] uppercase tracking-wider text-gray-500">
          Example
        </span>
      </div>
      <div className="p-5 md:p-6 font-mono text-[13px] leading-relaxed">
        <p className="flex gap-3 text-white">
          <span className="text-emerald-400" aria-hidden>
            &gt;
          </span>
          <span>{prompt}</span>
        </p>
        <ul className="mt-5 space-y-2.5">
          {/* Some lines repeat word for word, which is the point of the loop,
              so the position is what identifies a line. */}
          {steps.map((step, index) => (
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
  );
}

/**
 * Tells readers that Calibrate can be driven from the coding agent they already
 * use: three worked examples, then the shorter list of everything else, then the
 * one command that sets it up.
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
      <div className="text-center mb-12 md:mb-16">
        <div className="mb-2 flex justify-center md:mb-3">
          <span className="inline-block rounded-md border border-emerald-200/90 bg-emerald-50/90 px-1.5 py-0.5 text-[10px] md:text-[11px] font-semibold uppercase tracking-wider text-emerald-950 shadow-[0_1px_0_rgba(0,0,0,0.04)]">
            New
          </span>
        </div>
        <h2 className="text-3xl md:text-4xl lg:text-5xl font-medium text-gray-900 mb-4 md:mb-6 leading-[1.1] tracking-[-0.02em]">
          Use Calibrate inside your favourite AI tool
        </h2>
        <p className="text-base md:text-xl text-gray-500 max-w-3xl mx-auto">
          Install our Calibrate skill and it will create the evals for testing
          your agent, upload and run them on Calibrate, analyse what went wrong,
          and suggest how to improve your agent.
        </p>
      </div>

      <div className="flex flex-col gap-14 md:gap-16 lg:gap-20">
        {EXAMPLES.map((example) => (
          <div
            key={example.key}
            className="grid grid-cols-1 lg:grid-cols-[360px_1fr] gap-6 md:gap-8 items-center"
          >
            <div className="text-left">
              <h3 className="text-xl md:text-2xl lg:text-[1.75rem] font-semibold text-gray-900 leading-[1.15] tracking-[-0.02em] mb-3">
                {example.title}
              </h3>
              <p className="text-sm md:text-base text-gray-500 leading-relaxed">
                {example.description}
              </p>
            </div>
            <div className="min-w-0">
              <ExampleWindow
                agentLabel={agent.label}
                prompt={example.prompt}
                steps={example.steps}
              />
            </div>
          </div>
        ))}
      </div>

      <div className="mt-14 md:mt-20">
        <h3 className="text-center text-xl md:text-2xl font-semibold text-gray-900 mb-6 md:mb-8">
          What else you can ask for
        </h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 md:gap-6">
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

      <div className="mt-12 md:mt-16 flex flex-col items-center gap-4">
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
                  : "border-gray-300 bg-white text-gray-700 hover:bg-gray-100"
              }`}
            >
              {option.label}
            </button>
          ))}
        </div>
        <div className="flex w-full max-w-2xl items-center gap-3 overflow-hidden rounded-xl border border-gray-200 bg-white px-4 py-3">
          <code className="min-w-0 flex-1 overflow-x-auto whitespace-nowrap font-mono text-xs md:text-sm text-gray-800">
            {command}
          </code>
          <button
            type="button"
            onClick={handleCopy}
            className={`shrink-0 rounded-md px-2.5 py-1.5 text-xs font-medium transition-colors cursor-pointer ${
              copied
                ? "bg-emerald-100 text-emerald-800"
                : "text-gray-500 hover:bg-gray-100 hover:text-gray-900"
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
