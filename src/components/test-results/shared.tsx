"use client";

import React, { useState } from "react";
import Link from "next/link";
import {
  CheckIcon,
  XIcon,
  SpinnerIcon,
  ToolIcon,
  DocumentIcon,
  CloseIcon,
  ChevronDownIcon,
} from "@/components/icons";
import type { DefaultEvaluatorSummary } from "@/lib/defaultEvaluators";

// Renders the evaluator name. Authenticated result pages can link to the
// evaluator detail page; public share pages must render plain text because
// `/evaluators/{uuid}` is an authenticated route.
function EvaluatorNameLink({
  uuid,
  name,
  className,
  enableLink,
}: {
  uuid?: string | null;
  name: string;
  className: string;
  enableLink: boolean;
}) {
  if (uuid && enableLink) {
    return (
      <Link
        href={`/evaluators/${uuid}`}
        className={`${className} hover:underline cursor-pointer`}
        onClick={(e) => e.stopPropagation()}
      >
        {name}
      </Link>
    );
  }
  return <span className={className}>{name}</span>;
}

// Re-export icons for backwards compatibility
export { CheckIcon, XIcon, SpinnerIcon, ToolIcon, CloseIcon, DocumentIcon };

// Shared Types
export type ToolCallOutput = {
  tool: string;
  arguments: Record<string, any>;
};

export type TestCaseOutput = {
  response?: string;
  tool_calls?: ToolCallOutput[];
};

export type TestCaseHistory = {
  role: "assistant" | "user" | "tool";
  content?: string;
  tool_calls?: Array<{
    id: string;
    function: {
      name: string;
      arguments: string;
    };
    type: string;
  }>;
  tool_call_id?: string;
};

export type TestCaseEvaluation = {
  type: string;
  tool_calls?: Array<{
    tool: string;
    arguments: Record<string, any> | null;
  }>;
  criteria?: string;
};

// Per-evaluator attachment on a test (echoed by the run-result API when the
// backend includes the test's evaluator config in the test_case payload).
// Used as a fallback by `EvaluationCriteriaPanel` to render the user-
// supplied variable values when newer per-evaluator inline fields on
// `JudgeResult` (`variable_values`) aren't populated. Every field is
// optional because not every API response embeds the full attachment.
export type TestCaseEvaluatorRef = {
  evaluator_uuid?: string | null;
  name?: string;
  slug?: string | null;
  variable_values?: Record<string, string> | null;
};

export type TestCaseData = {
  name?: string;
  history?: TestCaseHistory[];
  evaluation?: TestCaseEvaluation;
  /** Evaluators attached to this test (with their per-test variable
   * values). Optional — only present when the run-result API echoes the
   * full test config including evaluators. */
  evaluators?: TestCaseEvaluatorRef[];
};

// Per-evaluator verdict for response (next-reply) tests. Tool-call tests
// always have `judge_results: null`. Mutually-exclusive `match` (binary)
// and `score` (rating) — exactly one is set on a completed entry.
// `evaluator_uuid` may be `null` for legacy runs that pre-date snapshot
// capture; treat as "no canonical link, just display the name".
// `name` is the CURRENT DB display name (refreshed on every read).
// `description` is the snapshotted one-line evaluator description used by
// the job; it may be null/absent for older snapshots.
//
// `variable_values`, `scale_min`, `scale_max` were added by the backend
// after the initial judge_results rollout. They are surfaced inline on
// every entry so the UI doesn't need a separate evaluator fetch to render
// `score / scale_max` chips or the per-test variable substitutions:
//  - `variable_values`: the `{{var}}` substitutions used for this evaluator
//    on this specific test case (frozen at submission time). Empty maps are
//    normalised to `null` server-side. Missing on legacy snapshots.
//  - `scale_min` / `scale_max`: present only for rating evaluators (e.g.
//    `1.0` / `5.0`); always `null` for binary evaluators or legacy rows.
export type JudgeResult = {
  evaluator_uuid?: string | null;
  name: string;
  description?: string | null;
  reasoning?: string;
  match?: boolean | null;
  score?: number | null;
  variable_values?: Record<string, string> | null;
  scale_min?: number | null;
  scale_max?: number | null;
};

function buildLegacyNextReplyJudgeResults({
  evaluation,
  reasoning,
  defaultEvaluator,
}: {
  evaluation?: TestCaseEvaluation;
  reasoning?: string;
  defaultEvaluator?: DefaultEvaluatorSummary | null;
}): JudgeResult[] | null {
  const criteria = evaluation?.criteria;
  if (evaluation?.type === "tool_call" || !criteria) return null;

  return [
    {
      evaluator_uuid: defaultEvaluator?.uuid ?? null,
      name: defaultEvaluator?.name ?? "Correctness",
      description: defaultEvaluator?.description ?? null,
      reasoning,
      variable_values: { criteria },
    },
  ];
}

// Shared Status Icon Component
export function StatusIcon({
  status,
}: {
  status: "passed" | "failed" | "running" | "pending" | "queued";
}) {
  if (status === "passed") {
    return (
      <div className="w-5 h-5 rounded-full bg-green-500/20 flex items-center justify-center flex-shrink-0">
        <CheckIcon className="w-3 h-3 text-green-500" />
      </div>
    );
  }
  if (status === "failed") {
    return (
      <div className="w-5 h-5 rounded-full bg-red-500/20 flex items-center justify-center flex-shrink-0">
        <XIcon className="w-3 h-3 text-red-500" />
      </div>
    );
  }
  if (status === "queued" || status === "pending") {
    return (
      <div className="w-5 h-5 rounded-full bg-gray-500/20 flex items-center justify-center flex-shrink-0">
        <div className="w-2 h-2 rounded-full bg-gray-400" />
      </div>
    );
  }
  // running status - yellow spinner
  return (
    <div className="w-5 h-5 flex items-center justify-center flex-shrink-0">
      <SpinnerIcon className="w-4 h-4 animate-spin text-yellow-500" />
    </div>
  );
}

// Shared Small Status Badge Component
export function SmallStatusBadge({ passed }: { passed: boolean }) {
  return (
    <div
      className={`w-4 h-4 rounded-full flex items-center justify-center ${
        passed ? "bg-green-500/20" : "bg-red-500/20"
      }`}
    >
      {passed ? (
        <CheckIcon className="w-2.5 h-2.5 text-green-500" />
      ) : (
        <XIcon className="w-2.5 h-2.5 text-red-500" />
      )}
    </div>
  );
}

// Helper to format parameter value for display
function formatParamValue(value: any): string {
  if (value === null) return "null";
  if (value === undefined) return "undefined";
  if (typeof value === "object") {
    try {
      return JSON.stringify(value, null, 2);
    } catch {
      return String(value);
    }
  }
  return String(value);
}

// Normalize any tool-call-shaped value into `{ toolName, args }`. The
// backend has shipped tool_calls in a few different shapes over time
// (`{tool, arguments}`, OpenAI's `{name, arguments}`, and nested
// `{tool: {name, arguments}}`); rendering code should never assume one
// shape — always go through this helper. `arguments` may also arrive as
// a JSON-encoded string (OpenAI history format) so we try to parse it.
export function normalizeToolCall(tc: any): {
  toolName: string;
  args: Record<string, any>;
} {
  if (!tc || typeof tc !== "object") {
    return { toolName: "Unknown tool", args: {} };
  }

  let toolName: string;
  if (typeof tc.tool === "string") {
    toolName = tc.tool;
  } else if (
    tc.tool &&
    typeof tc.tool === "object" &&
    typeof tc.tool.name === "string"
  ) {
    toolName = tc.tool.name;
  } else if (typeof tc.name === "string") {
    toolName = tc.name;
  } else if (
    tc.function &&
    typeof tc.function === "object" &&
    typeof tc.function.name === "string"
  ) {
    toolName = tc.function.name;
  } else {
    toolName = "Unknown tool";
  }

  const rawArgs =
    (tc.tool && typeof tc.tool === "object" && tc.tool.arguments !== undefined
      ? tc.tool.arguments
      : undefined) ??
    tc.arguments ??
    tc.function?.arguments;

  let args: Record<string, any> = {};
  if (rawArgs && typeof rawArgs === "object" && !Array.isArray(rawArgs)) {
    args = rawArgs;
  } else if (typeof rawArgs === "string") {
    try {
      const parsed = JSON.parse(rawArgs);
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
        args = parsed;
      }
    } catch {
      args = {};
    }
  }

  return { toolName, args };
}

// Shared Tool Call Card Component
export function ToolCallCard({
  toolName,
  args,
}: {
  toolName: string;
  args: Record<string, any>;
}) {
  return (
    <div className="bg-muted border border-border rounded-2xl p-4">
      <div className="flex items-center gap-2 mb-2">
        <ToolIcon className="w-4 h-4 text-muted-foreground" />
        <span className="text-sm font-medium text-foreground">{toolName}</span>
      </div>
      {Object.keys(args).filter((k) => k !== "headers").length > 0 && (
        <div className="space-y-3 mt-3">
          {Object.entries(args)
            .filter(([paramName]) => paramName !== "headers")
            .map(([paramName, paramValue]) => {
              const displayValue = formatParamValue(paramValue);
              const isMultiLine = displayValue.includes("\n");
              return (
                <div key={paramName}>
                  <label className="block text-sm font-medium text-muted-foreground mb-1.5">
                    {paramName}
                  </label>
                  <div
                    className={`px-3 py-2 rounded-lg text-sm bg-background border border-border text-foreground whitespace-pre-wrap break-all ${
                      isMultiLine ? "font-mono text-xs" : ""
                    }`}
                  >
                    {displayValue}
                  </div>
                </div>
              );
            })}
        </div>
      )}
    </div>
  );
}

/** Text + chevron toggle for evaluator / tool-call reasoning (compact header control). */
function ReasoningToggleIconButton({
  open,
  onToggle,
}: {
  open: boolean;
  onToggle: () => void;
}) {
  return (
    <button
      type="button"
      onClick={(e) => {
        e.stopPropagation();
        onToggle();
      }}
      aria-expanded={open}
      className={`inline-flex items-center gap-1.5 max-w-[min(100%,14rem)] rounded-md border px-2 py-1 text-[11px] font-medium transition-colors cursor-pointer shrink-0 ${
        open
          ? "border-fuchsia-500/50 bg-fuchsia-500/16 text-fuchsia-950 dark:border-fuchsia-500/45 dark:bg-fuchsia-500/18 dark:text-fuchsia-100 hover:bg-fuchsia-500/26 dark:hover:bg-fuchsia-500/28"
          : "border-cyan-500/50 bg-cyan-500/14 text-cyan-950 dark:border-cyan-500/45 dark:bg-cyan-500/16 dark:text-cyan-100 hover:bg-cyan-500/24 dark:hover:bg-cyan-500/22"
      }`}
    >
      <span className="truncate">
        {open ? "Hide reasoning" : "See reasoning"}
      </span>
      <ChevronDownIcon
        className={`w-3.5 h-3.5 shrink-0 transition-transform duration-200 ${open ? "rotate-180" : ""}`}
      />
    </button>
  );
}

function ReasoningExpandedContent({
  text,
  showReasoningLabel = false,
  mutedBody = true,
  italic = false,
}: {
  text: string;
  showReasoningLabel?: boolean;
  mutedBody?: boolean;
  italic?: boolean;
}) {
  return (
    <div className="space-y-1">
      {showReasoningLabel && (
        <span className="text-[10px] font-medium text-muted-foreground uppercase tracking-wide block">
          Reasoning
        </span>
      )}
      <p
        className={`${
          mutedBody
            ? "text-xs text-muted-foreground whitespace-pre-wrap break-words"
            : "text-xs text-foreground whitespace-pre-wrap break-words"
        }${italic ? " italic" : ""}`}
      >
        {text}
      </p>
    </div>
  );
}

/** Tool-call verdict: one header row (label + chevron), body when expanded. */
function CollapsibleReasoningStrip({
  text,
  mutedBody = true,
  italic = false,
  leadingLabel = "Reasoning",
}: {
  text?: string | null;
  mutedBody?: boolean;
  italic?: boolean;
  leadingLabel?: string;
}) {
  const [open, setOpen] = useState(false);
  if (!text?.trim()) return null;
  return (
    <div className="rounded-lg border border-border bg-muted/25 shadow-sm dark:bg-muted/35 dark:shadow-md dark:shadow-black/30 p-3">
      <div className="flex items-center justify-between gap-2 min-h-7">
        <span className="text-[10px] font-medium text-muted-foreground uppercase tracking-wide">
          {leadingLabel}
        </span>
        <ReasoningToggleIconButton
          open={open}
          onToggle={() => setOpen((o) => !o)}
        />
      </div>
      {open && (
        <div className="mt-2 pt-2 border-t border-border/60">
          <ReasoningExpandedContent
            text={text}
            showReasoningLabel={false}
            mutedBody={mutedBody}
            italic={italic}
          />
        </div>
      )}
    </div>
  );
}

/** Surface styles for per-evaluator cards: tinted fill + border + left stripe by outcome. */
type EvaluatorVerdictTone = "green" | "red" | "amber" | "neutral";

function getEvaluatorVerdictTone(
  result: JudgeResult,
  scaleMax?: number
): EvaluatorVerdictTone {
  const isRating = result.score !== null && result.score !== undefined;
  const isBinary = result.match !== null && result.match !== undefined;
  const effectiveScaleMax =
    typeof result.scale_max === "number" ? result.scale_max : scaleMax;
  const effectiveScaleMin =
    typeof result.scale_min === "number" ? result.scale_min : undefined;

  if (isBinary) {
    return result.match ? "green" : "red";
  }
  if (isRating) {
    if (
      effectiveScaleMax !== undefined &&
      result.score === effectiveScaleMax
    ) {
      return "green";
    }
    if (
      effectiveScaleMin !== undefined &&
      result.score === effectiveScaleMin
    ) {
      return "red";
    }
    return "amber";
  }
  return "neutral";
}

function evaluatorVerdictCardSurfaceClass(tone: EvaluatorVerdictTone): string {
  const base =
    "rounded-lg border shadow-md dark:shadow-lg transition-colors";
  switch (tone) {
    case "green":
      return `${base} border-green-500/40 bg-green-500/[0.14] border-l-4 border-l-green-600 dark:border-green-500/45 dark:bg-green-500/[0.16] dark:shadow-green-950/35`;
    case "red":
      return `${base} border-red-500/40 bg-red-500/[0.12] border-l-4 border-l-red-600 dark:border-red-500/45 dark:bg-red-500/[0.14] dark:shadow-red-950/30`;
    case "amber":
      return `${base} border-amber-500/40 bg-amber-500/[0.12] border-l-4 border-l-amber-600 dark:border-amber-500/45 dark:bg-amber-500/[0.13] dark:shadow-amber-950/30`;
    default:
      return `${base} border-border bg-muted/30 border-l-4 border-l-muted-foreground/40 dark:bg-muted/40 dark:border-border dark:shadow-black/25`;
  }
}

// Per-evaluator verdict card. Binary evaluators render a ✓/✗ badge; rating
// evaluators render `score / scale_max` when the scale is known.
//
// Rating chip color logic (rating evaluators):
//   - `score === scale_max` → green (perfect)
//   - `score === scale_min` → red (worst)
//   - anything between, or scale unknown → amber (neutral)
// `scale_min` is read from `result.scale_min` only (no prop fallback);
// `scale_max` falls back to the caller-supplied `scaleMax` prop for
// older snapshots that don't carry it inline.
function JudgeResultCard({
  result,
  scaleMax,
  enableEvaluatorLinks,
}: {
  result: JudgeResult;
  scaleMax?: number;
  enableEvaluatorLinks: boolean;
}) {
  const [reasoningOpen, setReasoningOpen] = useState(false);
  const hasReasoning = !!result.reasoning?.trim();
  const isRating = result.score !== null && result.score !== undefined;
  const isBinary = result.match !== null && result.match !== undefined;
  const effectiveScaleMax =
    typeof result.scale_max === "number" ? result.scale_max : scaleMax;
  const effectiveScaleMin =
    typeof result.scale_min === "number" ? result.scale_min : undefined;
  const ratingTone: "green" | "red" | "amber" = !isRating
    ? "amber"
    : effectiveScaleMax !== undefined && result.score === effectiveScaleMax
      ? "green"
      : effectiveScaleMin !== undefined && result.score === effectiveScaleMin
        ? "red"
        : "amber";
  const verdictTone = getEvaluatorVerdictTone(result, scaleMax);

  const onCardClick = (e: React.MouseEvent) => {
    if (!hasReasoning) return;
    const el = e.target as HTMLElement;
    if (el.closest("button") || el.closest("a[href]")) return;
    if (el.closest("[data-reasoning-body]")) return;
    if (el.closest("[data-evaluator-verdict-chips]")) return;
    setReasoningOpen((o) => !o);
  };

  return (
    <div
      onClick={hasReasoning ? onCardClick : undefined}
      className={`${evaluatorVerdictCardSurfaceClass(verdictTone)} px-3 py-2.5 space-y-1.5${hasReasoning ? " cursor-pointer" : ""}`}
    >
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0">
          <div className="min-w-0">
            <EvaluatorNameLink
              uuid={result.evaluator_uuid}
              name={result.name}
              className="text-sm font-medium text-foreground truncate inline-block max-w-full align-top"
              enableLink={enableEvaluatorLinks}
            />
            {result.description && (
              <p className="text-xs text-muted-foreground whitespace-normal break-words">
                {result.description}
              </p>
            )}
          </div>
        </div>
        <div className="flex-shrink-0 flex items-center gap-1.5">
          <div
            className="flex items-center gap-1.5"
            data-evaluator-verdict-chips
          >
            {isBinary && (
              <span
                className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[11px] font-medium ${
                  result.match
                    ? "bg-green-500/15 text-green-600 dark:text-green-400"
                    : "bg-red-500/15 text-red-600 dark:text-red-400"
                }`}
              >
                {result.match ? (
                  <CheckIcon className="w-3 h-3" />
                ) : (
                  <XIcon className="w-3 h-3" />
                )}
                {result.match ? "Pass" : "Fail"}
              </span>
            )}
            {isRating && (
              <span
                className={`inline-flex items-center px-2 py-0.5 rounded-md text-[11px] font-medium ${
                  ratingTone === "green"
                    ? "bg-green-500/15 text-green-600 dark:text-green-400"
                    : ratingTone === "red"
                      ? "bg-red-500/15 text-red-600 dark:text-red-400"
                      : "bg-amber-500/15 text-amber-600 dark:text-amber-400"
                }`}
              >
                {effectiveScaleMax !== undefined
                  ? `${result.score} / ${effectiveScaleMax}`
                  : `Score: ${result.score}`}
              </span>
            )}
          </div>
          {hasReasoning && (
            <ReasoningToggleIconButton
              open={reasoningOpen}
              onToggle={() => setReasoningOpen((o) => !o)}
            />
          )}
        </div>
      </div>
      {hasReasoning && reasoningOpen && (
        <div
          data-reasoning-body
          className="mt-1.5 pt-1.5 border-t border-border/60"
        >
          <ReasoningExpandedContent text={result.reasoning!} mutedBody />
        </div>
      )}
    </div>
  );
}

// Renders the list of per-evaluator verdicts for a response (next-reply)
// test. Renders nothing when `results` is empty/missing — the caller
// should fall back to the legacy single-reasoning display.
export function JudgeResultsList({
  results,
  scaleByEvaluatorUuid,
  enableEvaluatorLinks = true,
}: {
  results?: JudgeResult[] | null;
  scaleByEvaluatorUuid?: Record<string, number | undefined>;
  enableEvaluatorLinks?: boolean;
}) {
  if (!results || results.length === 0) return null;
  return (
    <div className="space-y-2">
      <div className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
        Evaluators
      </div>
      <div className="space-y-2">
        {results.map((r, i) => (
          <JudgeResultCard
            key={r.evaluator_uuid ?? `${r.name}-${i}`}
            result={r}
            scaleMax={
              r.evaluator_uuid
                ? scaleByEvaluatorUuid?.[r.evaluator_uuid]
                : undefined
            }
            enableEvaluatorLinks={enableEvaluatorLinks}
          />
        ))}
      </div>
    </div>
  );
}

// Shared Test Detail View Component
export function TestDetailView({
  history,
  output,
  passed,
  reasoning,
  evaluation,
  judgeResults,
  scaleByEvaluatorUuid,
  legacyDefaultEvaluator,
  enableEvaluatorLinks = true,
}: {
  history: TestCaseHistory[];
  output?: TestCaseOutput;
  passed: boolean;
  reasoning?: string;
  evaluation?: TestCaseEvaluation;
  /** Per-evaluator verdicts for response (next-reply) tests. Null/absent
   * for tool-call tests and for legacy response tests that pre-date
   * judge_results — those fall back to the legacy single-reasoning UI. */
  judgeResults?: JudgeResult[] | null;
  /** Optional rating-evaluator scale lookup (uuid → scale_max). When
   * provided, rating cards render `score / max` instead of just `score`. */
  scaleByEvaluatorUuid?: Record<string, number | undefined>;
  /** Default correctness evaluator used to render legacy response criteria
   * as evaluator variable values when `judgeResults` is absent. */
  legacyDefaultEvaluator?: DefaultEvaluatorSummary | null;
  /** Disable on public share pages because evaluator detail routes require auth. */
  enableEvaluatorLinks?: boolean;
}) {
  const effectiveJudgeResults =
    Array.isArray(judgeResults) && judgeResults.length > 0
      ? judgeResults
      : buildLegacyNextReplyJudgeResults({
          evaluation,
          reasoning,
          defaultEvaluator: legacyDefaultEvaluator,
        });
  const hasJudgeResults =
    Array.isArray(effectiveJudgeResults) && effectiveJudgeResults.length > 0;
  const [legacyReasoningOpen, setLegacyReasoningOpen] = useState(false);
  const showLegacyReasoningToggle =
    !hasJudgeResults && !!reasoning?.trim();
  return (
    <div className="p-4 md:p-6 space-y-4 md:space-y-6">
      {/* Chat History from test_case.history */}
      {history.length > 0 && (
        <div className="space-y-4">
          <div className="space-y-4">
            {history.map((message, index) => (
              <div
                key={index}
                className={`space-y-1 ${
                  message.role === "user" ? "flex flex-col items-end" : ""
                }`}
              >
                {/* User Message */}
                {message.role === "user" && (
                  <div className="w-[88%] md:w-3/4">
                    <div className="px-3 md:px-4 py-2.5 md:py-3 rounded-xl bg-muted border border-border">
                      <p className="text-sm text-foreground whitespace-pre-wrap">
                        {message.content}
                      </p>
                    </div>
                  </div>
                )}

                {/* Agent Message (text response) */}
                {message.role === "assistant" && !message.tool_calls && (
                  <>
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium text-foreground">
                        Agent
                      </span>
                    </div>
                    <div className="w-[88%] md:w-3/4">
                      <div className="px-3 md:px-4 py-2.5 md:py-3 rounded-xl bg-background border border-border">
                        <p className="text-sm text-foreground whitespace-pre-wrap">
                          {message.content}
                        </p>
                      </div>
                    </div>
                  </>
                )}

                {/* Agent Tool Call from history */}
                {message.role === "assistant" &&
                  message.tool_calls &&
                  message.tool_calls.length > 0 && (
                    <>
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-medium text-foreground">
                          Agent Tool Call
                        </span>
                      </div>
                      <div className="w-[88%] md:w-3/4">
                        {message.tool_calls.map((toolCall, tcIndex) => {
                          const { toolName, args } =
                            normalizeToolCall(toolCall);
                          return (
                            <ToolCallCard
                              key={tcIndex}
                              toolName={toolName}
                              args={args}
                            />
                          );
                        })}
                      </div>
                    </>
                  )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Output Section - Agent's Response/Tool Call */}
      {output && (
        <div className="space-y-4">
          {/* Text Response */}
          {output.response && (
            <div
              className={`${
                passed
                  ? "border-l-4 border-l-green-500 pl-2 md:pl-3"
                  : "border-l-4 border-l-red-500 pl-2 md:pl-3"
              }`}
            >
              <div className="flex items-center justify-between gap-2 mb-1">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-medium text-foreground">
                    Agent
                  </span>
                  <SmallStatusBadge passed={passed} />
                </div>
                {showLegacyReasoningToggle && (
                  <ReasoningToggleIconButton
                    open={legacyReasoningOpen}
                    onToggle={() => setLegacyReasoningOpen((o) => !o)}
                  />
                )}
              </div>
              {showLegacyReasoningToggle && legacyReasoningOpen && (
                <div className="mb-2">
                  <ReasoningExpandedContent
                    text={reasoning!}
                    showReasoningLabel={false}
                    mutedBody
                    italic
                  />
                </div>
              )}
              <div className="w-[88%] md:w-3/4">
                <div className="px-3 md:px-4 py-2.5 md:py-3 rounded-xl bg-background border border-border">
                  <p className="text-sm text-foreground whitespace-pre-wrap">
                    {output.response}
                  </p>
                </div>
              </div>
            </div>
          )}

          {/* Tool Calls Output */}
          {output.tool_calls && output.tool_calls.length > 0 && (
            <div
              className={`${
                passed
                  ? "border-l-4 border-l-green-500 pl-2 md:pl-3"
                  : "border-l-4 border-l-red-500 pl-2 md:pl-3"
              }`}
            >
              <div className="flex items-center gap-2 mb-2">
                <span className="text-sm font-medium text-foreground">
                  Agent Tool Call
                </span>
                <SmallStatusBadge passed={passed} />
              </div>
              <div className="space-y-3">
                {output.tool_calls.map((toolCall, index) => {
                  const { toolName, args } = normalizeToolCall(toolCall);
                  return (
                    <div key={index} className="w-[88%] md:w-3/4">
                      <ToolCallCard toolName={toolName} args={args} />
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Per-evaluator verdicts for response (next-reply) tests — MOBILE
          ONLY. On desktop the same data lives in the right column
          (`EvaluationCriteriaPanel`); on mobile the right column is hidden
          so we keep an inline fallback here. Tool-call tests have
          `judgeResults: null` and fall through to the legacy inline
          reasoning rendered above. */}
      {hasJudgeResults && (
        <div className="md:hidden w-full">
          <JudgeResultsList
            results={effectiveJudgeResults}
            scaleByEvaluatorUuid={scaleByEvaluatorUuid}
            enableEvaluatorLinks={enableEvaluatorLinks}
          />
        </div>
      )}

      {/* Show empty state if no history and no output */}
      {history.length === 0 && !output && !hasJudgeResults && (
        <div className="text-center py-8">
          <p className="text-sm text-muted-foreground">
            No conversation history available for this test
          </p>
        </div>
      )}
    </div>
  );
}

// Shared Empty State Component
export function EmptyStateView({ message }: { message: string }) {
  return (
    <div className="flex items-center justify-center h-full">
      <div className="text-center">
        <div className="w-12 h-12 rounded-full bg-muted/50 flex items-center justify-center mx-auto mb-3">
          <DocumentIcon className="w-6 h-6 text-muted-foreground" />
        </div>
        <p className="text-muted-foreground text-sm">{message}</p>
      </div>
    </div>
  );
}

// Per-evaluator card for the right-column panel of the test runner. Larger
// and richer than `JudgeResultCard` (which is the inline mobile fallback) —
// per-test variable values and reasoning share one collapsible block below
// the header.
//
// Data resolution order for variables / scale_max:
//   1. Inline on the `JudgeResult` itself (`result.variable_values`,
//      `result.scale_max`) — preferred path now that the backend echoes
//      these on every per-evaluator entry.
//   2. The caller-supplied `variableValues` / `scaleMax` props — kept as
//      a fallback for snapshots written before that backend change rolled
//      out (sourced from the `test_case.evaluators` echo and a uuid →
//      scale_max map respectively).
function EvaluatorPanelCard({
  result,
  variableValues,
  scaleMax,
  enableEvaluatorLinks,
}: {
  result: JudgeResult;
  variableValues?: Record<string, string> | null;
  scaleMax?: number;
  enableEvaluatorLinks: boolean;
}) {
  const [reasoningOpen, setReasoningOpen] = useState(false);
  const hasReasoning = !!result.reasoning?.trim();
  const isRating = result.score !== null && result.score !== undefined;
  const isBinary = result.match !== null && result.match !== undefined;
  const effectiveScaleMax =
    typeof result.scale_max === "number" ? result.scale_max : scaleMax;
  const effectiveScaleMin =
    typeof result.scale_min === "number" ? result.scale_min : undefined;
  const effectiveVariables =
    result.variable_values && typeof result.variable_values === "object"
      ? result.variable_values
      : variableValues;
  // Rating chip color: green only when the score equals scale_max, red
  // only when it equals scale_min, amber for everything in between or
  // when either bound is unknown. See `JudgeResultCard` for the same
  // logic on mobile.
  const ratingTone: "green" | "red" | "amber" = !isRating
    ? "amber"
    : effectiveScaleMax !== undefined && result.score === effectiveScaleMax
      ? "green"
      : effectiveScaleMin !== undefined && result.score === effectiveScaleMin
        ? "red"
        : "amber";

  const hasVariables =
    effectiveVariables &&
    typeof effectiveVariables === "object" &&
    Object.keys(effectiveVariables).length > 0;
  const hasCollapsibleBody = hasReasoning || !!hasVariables;
  const verdictTone = getEvaluatorVerdictTone(result, scaleMax);

  const onCardClick = (e: React.MouseEvent) => {
    if (!hasCollapsibleBody) return;
    const el = e.target as HTMLElement;
    if (el.closest("button") || el.closest("a[href]")) return;
    if (el.closest("[data-reasoning-body]")) return;
    if (el.closest("[data-evaluator-verdict-chips]")) return;
    setReasoningOpen((o) => !o);
  };

  return (
    <div
      onClick={hasCollapsibleBody ? onCardClick : undefined}
      className={`${evaluatorVerdictCardSurfaceClass(verdictTone)} p-3 space-y-2.5${hasCollapsibleBody ? " cursor-pointer" : ""}`}
    >
      {/* Name + verdict header */}
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <EvaluatorNameLink
            uuid={result.evaluator_uuid}
            name={result.name}
            className="text-sm font-medium text-foreground break-words inline-block max-w-full align-top"
            enableLink={enableEvaluatorLinks}
          />
          {result.description && (
            <p className="text-xs text-muted-foreground whitespace-normal break-words mt-0.5">
              {result.description}
            </p>
          )}
        </div>
        <div className="flex-shrink-0 flex items-center gap-1.5">
          <div
            className="flex items-center gap-1.5"
            data-evaluator-verdict-chips
          >
            {isBinary && (
              <span
                className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[11px] font-medium ${
                  result.match
                    ? "bg-green-500/15 text-green-600 dark:text-green-400"
                    : "bg-red-500/15 text-red-600 dark:text-red-400"
                }`}
              >
                {result.match ? (
                  <CheckIcon className="w-3 h-3" />
                ) : (
                  <XIcon className="w-3 h-3" />
                )}
                {result.match ? "Pass" : "Fail"}
              </span>
            )}
            {isRating && (
              <span
                className={`inline-flex items-center px-2 py-0.5 rounded-md text-[11px] font-medium ${
                  ratingTone === "green"
                    ? "bg-green-500/15 text-green-600 dark:text-green-400"
                    : ratingTone === "red"
                      ? "bg-red-500/15 text-red-600 dark:text-red-400"
                      : "bg-amber-500/15 text-amber-600 dark:text-amber-400"
                }`}
              >
                {effectiveScaleMax !== undefined
                  ? `${result.score} / ${effectiveScaleMax}`
                  : `Score: ${result.score}`}
              </span>
            )}
          </div>
          {hasCollapsibleBody && (
            <ReasoningToggleIconButton
              open={reasoningOpen}
              onToggle={() => setReasoningOpen((o) => !o)}
            />
          )}
        </div>
      </div>

      {reasoningOpen && hasCollapsibleBody && (
        <div
          data-reasoning-body
          className="mt-1.5 pt-1.5 border-t border-border/60 space-y-3"
        >
          {hasVariables && (
            <div className="space-y-2">
              {Object.entries(effectiveVariables!).map(([name, value]) => (
                <div key={name}>
                  <span className="font-mono text-[10px] text-muted-foreground">
                    {`{{${name}}}`}
                  </span>
                  <p className="text-xs text-foreground whitespace-pre-wrap break-words mt-0.5">
                    {String(value)}
                  </p>
                </div>
              ))}
            </div>
          )}
          {hasReasoning && (
            <div
              className={
                hasVariables
                  ? "pt-3 border-t border-border/60"
                  : undefined
              }
            >
              <ReasoningExpandedContent
                text={result.reasoning!}
                showReasoningLabel
                mutedBody={false}
              />
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// Evaluation panel rendered as the third column of the test runner / view-
// past-run dialogs (and the mobile inline fallback in `TestDetailView`).
//
// Dispatch (in order):
//  1. RESPONSE test with `judgeResults`: per-evaluator cards (name + link
//     + verdict + per-test variable values + per-evaluator reasoning).
//     Variables and scale_max come inline on each `JudgeResult` (newer
//     payloads), with `testCaseEvaluators[i].variable_values` as a
//     fallback for older snapshots.
//  2. TOOL_CALL test: expected tool calls + the top-level `reasoning`
//     string (the deterministic match/diff summary — there are no
//     per-evaluator entries for tool-call tests).
//  3. Legacy fallback (no judge_results, no tool_calls): the old free-text
//     `evaluation.criteria` rendered as the default next-reply evaluator's
//     `criteria` variable, kept around for runs that pre-date evaluator
//     snapshot capture.
//
// The `testType` prop is no longer surfaced as a visible badge — the
// section structure makes the test type self-evident — but it's still
// accepted as a hint for the dispatch when `evaluation.type` is missing.
export function EvaluationCriteriaPanel({
  evaluation,
  testType,
  judgeResults,
  reasoning,
  testCaseEvaluators,
  scaleByEvaluatorUuid,
  legacyDefaultEvaluator,
  enableEvaluatorLinks = true,
}: {
  evaluation?: TestCaseEvaluation;
  testType?: string;
  /** Per-evaluator verdicts from `result.judge_results`. Response tests
   * only — null/absent for tool-call and legacy response runs. */
  judgeResults?: JudgeResult[] | null;
  /** Top-level result reasoning string. Surfaced as the verdict explainer
   * for tool-call tests and as a fallback for legacy response runs that
   * lack judge_results. */
  reasoning?: string;
  /** Test config evaluator attachments echoed by the run-result API.
   * Used as a fallback for variable values when the judge_results entries
   * don't carry them inline (older snapshots). Optional. */
  testCaseEvaluators?: TestCaseEvaluatorRef[];
  /** uuid → scale_max for rating evaluators. Fallback only — when an
   * entry has `scale_max` inline on the `JudgeResult` (newer payloads)
   * that takes priority. Optional. */
  scaleByEvaluatorUuid?: Record<string, number | undefined>;
  /** Default correctness evaluator used to render legacy response criteria
   * as evaluator variable values when `judgeResults` is absent. */
  legacyDefaultEvaluator?: DefaultEvaluatorSummary | null;
  /** Disable on public share pages because evaluator detail routes require auth. */
  enableEvaluatorLinks?: boolean;
}) {
  const resolvedType =
    testType ||
    evaluation?.type ||
    (evaluation?.tool_calls ? "tool_call" : "response");
  const isToolCall = resolvedType === "tool_call";
  const hasJudgeResults =
    Array.isArray(judgeResults) && judgeResults.length > 0;
  const legacyJudgeResults = hasJudgeResults
    ? null
    : buildLegacyNextReplyJudgeResults({
        evaluation,
        reasoning,
        defaultEvaluator: legacyDefaultEvaluator,
      });
  const hasLegacyJudgeResults =
    Array.isArray(legacyJudgeResults) && legacyJudgeResults.length > 0;
  const hasExpectedToolCalls =
    !!evaluation?.tool_calls && evaluation.tool_calls.length > 0;
  const hasLegacyCriteria =
    typeof evaluation?.criteria === "string" && evaluation.criteria.length > 0;

  // Build a uuid → variable_values fallback lookup once from the
  // `test_case.evaluators` echo. Used only when the inline
  // `result.variable_values` field isn't populated (older snapshots).
  // Match strictly by `evaluator_uuid` so a rename can't collide with a
  // different evaluator that happens to share the new name.
  const variablesByUuid: Record<string, Record<string, string> | undefined> = {};
  if (testCaseEvaluators) {
    for (const e of testCaseEvaluators) {
      if (e?.evaluator_uuid && e.variable_values) {
        variablesByUuid[e.evaluator_uuid] = e.variable_values;
      }
    }
  }

  return (
    <div className="p-4 md:p-6 space-y-4">
      <h3 className="text-sm font-semibold text-foreground">
        {isToolCall ? "Expected Tool Calls" : "Evaluators"}
      </h3>

      {/* Tool-call test: expected tool calls + top-level reasoning verdict. */}
      {isToolCall && (
        <>
          {hasExpectedToolCalls ? (
            <div className="space-y-2">
              {evaluation!.tool_calls!.map((tc, i) => {
                const { toolName, args } = normalizeToolCall(tc);
                return (
                  <ToolCallCard key={i} toolName={toolName} args={args} />
                );
              })}
            </div>
          ) : (
            <p className="text-xs text-muted-foreground">
              No expected tool calls specified
            </p>
          )}
          <CollapsibleReasoningStrip
            text={reasoning}
            mutedBody={false}
            leadingLabel="Reasoning"
          />
        </>
      )}

      {/* Response test, new format: per-evaluator cards. */}
      {!isToolCall && hasJudgeResults && (
        <div className="space-y-3">
          {judgeResults!.map((jr, i) => (
            <EvaluatorPanelCard
              key={jr.evaluator_uuid ?? `${jr.name}-${i}`}
              result={jr}
              variableValues={
                jr.evaluator_uuid
                  ? variablesByUuid[jr.evaluator_uuid]
                  : undefined
              }
              scaleMax={
                jr.evaluator_uuid
                  ? scaleByEvaluatorUuid?.[jr.evaluator_uuid]
                  : undefined
              }
              enableEvaluatorLinks={enableEvaluatorLinks}
            />
          ))}
        </div>
      )}

      {/* Response test, legacy fallback (pre-judge_results runs): render the
          old free-text criteria as the default next-reply evaluator's
          `criteria` variable. */}
      {!isToolCall && !hasJudgeResults && hasLegacyCriteria && (
        <div className="space-y-3">
          {legacyJudgeResults!.map((jr, i) => (
            <EvaluatorPanelCard
              key={jr.evaluator_uuid ?? `${jr.name}-${i}`}
              result={jr}
              enableEvaluatorLinks={enableEvaluatorLinks}
            />
          ))}
        </div>
      )}

      {/* Final empty state */}
      {!isToolCall && !hasJudgeResults && !hasLegacyJudgeResults && (
        <p className="text-xs text-muted-foreground">
          No evaluator details available
        </p>
      )}
    </div>
  );
}

// Shared Stats Display Component
export function TestStats({
  passedCount,
  failedCount,
}: {
  passedCount: number;
  failedCount: number;
}) {
  return (
    <div className="flex items-center gap-3 text-sm">
      <div className="flex items-center gap-1.5">
        <div className="w-2 h-2 rounded-full bg-green-500"></div>
        <span className="text-muted-foreground">{passedCount} passed</span>
      </div>
      <div className="flex items-center gap-1.5">
        <div className="w-2 h-2 rounded-full bg-red-500"></div>
        <span className="text-muted-foreground">{failedCount} failed</span>
      </div>
    </div>
  );
}
