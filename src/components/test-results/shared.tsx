"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  EvaluatorVerdictCard,
  ReasoningExpandedContent,
  ReasoningToggleButton,
} from "@/components/EvaluatorVerdictCard";
import Link from "next/link";
import {
  CheckIcon,
  XIcon,
  SpinnerIcon,
  ToolIcon,
  DocumentIcon,
  CloseIcon,
  ChevronDownIcon,
  WarningTriangleIcon,
} from "@/components/icons";
import type { DefaultEvaluatorSummary } from "@/lib/defaultEvaluators";
import { getBinaryLabel, toRatingScale } from "@/lib/binaryLabels";

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
  /** The tool's execution result, echoed back by the external agent.
   * Any JSON value. Only populated for agent-connection tests where the
   * agent actually runs the tool; `null`/absent for managed
   * calibrate-agent tests (which declare tool calls but never execute
   * them). Render only when present. */
  output?: unknown;
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
  /** Optional per-turn timestamp. Set by labelling items that bulk-upload a
   * conversation with `created_at` on each turn; rendered next to the role
   * label so annotators see when each message happened. */
  created_at?: string;
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
//
// As of the API change that moved per-evaluator metadata to a top-level
// `evaluators[]` block, each judge_result row carries only the bits that
// genuinely vary per test case:
//  - `evaluator_uuid`: keys back into the top-level evaluators[] block
//    (backend guarantees an entry, synthesising a stub for legacy rows).
//  - `match` / `score`: the verdict.
//  - `value_name`: backend-resolved display label for the row's value
//    (e.g. "Pass" for `match: true` against a custom-labelled binary
//    evaluator). Optional for the same reason — backend may omit when
//    null. Empty string is treated like missing.
//  - `reasoning`: judge's free-text explanation.
//  - `variable_values`: the `{{var}}` substitutions used on this test
//    case (frozen at submission time).
//
// Fields that used to be inlined here — `name`, `description`,
// `scale_min`, `scale_max`, `true_label`, `false_label` — are now read
// from the top-level evaluator entry indexed by `evaluator_uuid`.
export type JudgeResult = {
  evaluator_uuid?: string | null;
  reasoning?: string;
  match?: boolean | null;
  score?: number | null;
  value_name?: string | null;
  variable_values?: Record<string, string> | null;
};

// Per-evaluator block returned at the top level of test-run / benchmark
// responses. Each entry pins the version the run executed against;
// per-evaluator metadata (name, description, output config, scale
// bounds) lives here and is looked up by `evaluator_uuid` from each
// `judge_results[]` row.
export type TestRunEvaluator = {
  uuid: string;
  name: string;
  description?: string | null;
  output_type: "binary" | "rating";
  output_config?: {
    scale?: {
      value: boolean | number | string;
      name?: string | null;
      description?: string | null;
      color?: string | null;
    }[];
  } | null;
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
      reasoning,
      variable_values: { criteria },
    },
  ];
}

// Synthesise a top-level evaluators[] entry to pair with the legacy
// next-reply judge_result above. The default-evaluator metadata is what
// callers used to inline on the row; we now hand it back via the same
// uuid-keyed lookup the rest of the code uses.
function legacyEvaluatorEntry(
  defaultEvaluator?: DefaultEvaluatorSummary | null,
): TestRunEvaluator | null {
  if (!defaultEvaluator?.uuid) return null;
  return {
    uuid: defaultEvaluator.uuid,
    name: defaultEvaluator.name ?? "Correctness",
    description: defaultEvaluator.description ?? null,
    output_type: "binary",
  };
}

// Shared Status Icon Component
export function StatusIcon({
  status,
}: {
  status: "passed" | "failed" | "error" | "running" | "pending" | "queued";
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
  if (status === "error") {
    return (
      <div className="w-5 h-5 rounded-full bg-amber-500/20 flex items-center justify-center flex-shrink-0">
        <WarningTriangleIcon className="w-3 h-3 text-amber-500" />
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

// True when a value is an expected-argument match spec — a dict carrying a
// `match_type` key (`exact` or `llm_judge`).
function isMatchSpec(
  v: any,
): v is { match_type: string; value?: any; criteria?: string } {
  return (
    v !== null &&
    typeof v === "object" &&
    !Array.isArray(v) &&
    "match_type" in v
  );
}

// Read-only render of an expected argument (name + value), mirroring the
// add-test dialog's per-parameter controls: the parameter name sits on one line
// with a match-mode chip ("Is exactly" / "satisfies the criteria" / "Is null" /
// "Is any"), and the value or criteria below. The wildcard "Is any" mode (the
// bare string "any") renders the chip with no value box. Object-typed params
// recurse inside a boxed group so each nested field shows its own mode; bare
// literals (legacy expected values) fall back to a plain value box.
function ExpectedArgValue({ name, value }: { name: string; value: any }) {
  const nameLabel = (
    <label className="text-sm font-medium text-foreground">{name}</label>
  );

  // The bare string "any" is the wildcard sentinel — the argument is asserted
  // present but its value is ignored, so there's no value box to show.
  if (value === "any") {
    return (
      <div className="flex items-center gap-2 flex-wrap">
        {nameLabel}
        <span className="inline-flex items-center px-2 py-0.5 rounded-md text-[11px] font-medium bg-foreground text-background">
          Is any
        </span>
      </div>
    );
  }

  if (isMatchSpec(value)) {
    const isLlm = value.match_type === "llm_judge";
    const isNull = !isLlm && value.value === null;
    const label = isLlm
      ? "satisfies the criteria"
      : isNull
        ? "Is null"
        : "Is exactly";
    const text = isLlm
      ? typeof value.criteria === "string"
        ? value.criteria
        : ""
      : formatParamValue(value.value);
    const multiLine = text.includes("\n");
    return (
      <div className="space-y-1">
        <div className="flex items-center gap-2 flex-wrap">
          {nameLabel}
          <span className="inline-flex items-center px-2 py-0.5 rounded-md text-[11px] font-medium bg-foreground text-background">
            {label}
          </span>
        </div>
        <div
          className={`px-3 py-2 rounded-lg text-sm bg-background border border-border text-foreground whitespace-pre-wrap break-words ${
            multiLine ? "font-mono text-xs" : ""
          }`}
        >
          {text}
        </div>
      </div>
    );
  }
  if (value !== null && typeof value === "object" && !Array.isArray(value)) {
    return (
      <div className="space-y-1">
        {nameLabel}
        <div className="space-y-3 rounded-xl border border-border bg-background/50 p-3">
          {Object.entries(value).map(([k, v]) => (
            <ExpectedArgValue key={k} name={k} value={v} />
          ))}
        </div>
      </div>
    );
  }
  const text = formatParamValue(value);
  const multiLine = text.includes("\n");
  return (
    <div className="space-y-1">
      {nameLabel}
      <div
        className={`px-3 py-2 rounded-lg text-sm bg-background border border-border text-foreground whitespace-pre-wrap break-words ${
          multiLine ? "font-mono text-xs" : ""
        }`}
      >
        {text}
      </div>
    </div>
  );
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
  output?: unknown;
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

  const output =
    tc.output === undefined || tc.output === null ? undefined : tc.output;

  return { toolName, args, output };
}

// Shared Tool Call Card Component
export function ToolCallCard({
  toolName,
  args,
  output,
  expected = false,
}: {
  toolName: string;
  args: Record<string, any>;
  /** The tool's execution result (agent-connection tests only). Rendered
   * only when present — `undefined`/`null` hides the result section. */
  output?: unknown;
  /** When true, render each argument as an expected match spec (mode pill +
   * value / criteria) instead of a plain value. Used for "Expected Tool
   * Calls"; actual agent tool calls leave this false. */
  expected?: boolean;
}) {
  const hasOutput = output !== undefined && output !== null;
  const outputValue = hasOutput ? formatParamValue(output) : "";
  const outputIsMultiLine = outputValue.includes("\n");
  const paramEntries = Object.entries(args).filter(
    ([paramName]) => paramName !== "headers",
  );
  const hasParams = paramEntries.length > 0;
  // Expected tool calls collapse the whole parameter block behind one toggle.
  const collapsible = expected && hasParams;
  const [open, setOpen] = useState(true);
  const showParams = hasParams && (!collapsible || open);
  return (
    <div className="bg-muted border border-border rounded-2xl p-4">
      <div
        className={`flex items-center gap-2 ${showParams || hasOutput ? "mb-2" : ""}`}
      >
        <ToolIcon className="w-4 h-4 text-muted-foreground" />
        <span className="text-sm font-medium text-foreground">{toolName}</span>
        {collapsible && (
          <button
            type="button"
            onClick={() => setOpen((o) => !o)}
            aria-label={open ? "Collapse parameters" : "Expand parameters"}
            aria-expanded={open}
            className="ml-auto flex-shrink-0 inline-flex items-center justify-center px-2 py-1 rounded-md bg-foreground text-background hover:opacity-90 transition-opacity cursor-pointer"
          >
            <svg
              className="w-3 h-3"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={2.5}
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d={open ? "M4.5 15.75l7.5-7.5 7.5 7.5" : "M19.5 8.25l-7.5 7.5-7.5-7.5"}
              />
            </svg>
          </button>
        )}
      </div>
      {collapsible && !open && (
        <p className="text-xs text-muted-foreground">
          {paramEntries.length} parameter{paramEntries.length === 1 ? "" : "s"}{" "}
          hidden
        </p>
      )}
      {showParams && (
        <div className="space-y-3 mt-3">
          {paramEntries.map(([paramName, paramValue]) => {
            if (expected) {
              return (
                <ExpectedArgValue
                  key={paramName}
                  name={paramName}
                  value={paramValue}
                />
              );
            }
            const displayValue = formatParamValue(paramValue);
            const isMultiLine = displayValue.includes("\n");
            return (
              <div key={paramName}>
                <label className="block text-sm font-medium text-foreground mb-1.5">
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
      {hasOutput && (
        <div className="mt-3 pt-3 border-t border-border">
          <label className="block text-sm font-medium text-foreground mb-1.5">
            Tool Response
          </label>
          <div
            className={`px-3 py-2 rounded-lg text-sm bg-background border border-border text-foreground whitespace-pre-wrap break-all ${
              outputIsMultiLine ? "font-mono text-xs" : ""
            }`}
          >
            {outputValue}
          </div>
        </div>
      )}
    </div>
  );
}

/** Text + chevron toggle for evaluator / tool-call reasoning (compact header control). */
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
        <ReasoningToggleButton
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
  evaluator,
  enableEvaluatorLinks,
}: {
  result: JudgeResult;
  /** Top-level evaluator entry resolved by `result.evaluator_uuid`. */
  evaluator: TestRunEvaluator | null;
  enableEvaluatorLinks: boolean;
}) {
  const isRating = result.score !== null && result.score !== undefined;
  const scale = evaluator?.output_config?.scale ?? null;
  const valueName = result.value_name?.trim() || null;
  return (
    <EvaluatorVerdictCard
      mode="read"
      name={evaluator?.name ?? "Evaluator"}
      description={evaluator?.description ?? null}
      outputType={isRating ? "rating" : "binary"}
      evaluatorUuid={result.evaluator_uuid ?? undefined}
      enableLink={enableEvaluatorLinks}
      scaleMin={
        typeof evaluator?.scale_min === "number"
          ? evaluator.scale_min
          : undefined
      }
      scaleMax={
        typeof evaluator?.scale_max === "number"
          ? evaluator.scale_max
          : undefined
      }
      match={result.match}
      score={result.score}
      reasoning={result.reasoning}
      // Prefer the row-resolved `value_name` for the side that matches
      // this verdict; fall back to the scale lookup for the other side.
      trueLabel={
        result.match === true && valueName
          ? valueName
          : getBinaryLabel(scale, true)
      }
      falseLabel={
        result.match === false && valueName
          ? valueName
          : getBinaryLabel(scale, false)
      }
      ratingScale={toRatingScale(scale)}
      ratingLabel={valueName}
    />
  );
}

// Renders the list of per-evaluator verdicts for a response (next-reply)
// test. Renders nothing when `results` is empty/missing — the caller
// should fall back to the legacy single-reasoning display.
export function JudgeResultsList({
  results,
  evaluatorsByUuid,
  enableEvaluatorLinks = true,
}: {
  results?: JudgeResult[] | null;
  /** Top-level evaluators[] keyed by uuid. Source of truth for name,
   * description, scale, and output_config. Backend guarantees an entry
   * for every uuid in `results[].evaluator_uuid` (synthesises a stub
   * for legacy rows). */
  evaluatorsByUuid?: Record<string, TestRunEvaluator>;
  enableEvaluatorLinks?: boolean;
}) {
  if (!results || results.length === 0) return null;
  return (
    <div className="space-y-2">
      <div className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
        Evaluators
      </div>
      <div className="space-y-2">
        {results.map((r, i) => {
          const ev = r.evaluator_uuid
            ? evaluatorsByUuid?.[r.evaluator_uuid] ?? null
            : null;
          return (
            <JudgeResultCard
              key={r.evaluator_uuid ?? `${i}`}
              result={r}
              evaluator={ev}
              enableEvaluatorLinks={enableEvaluatorLinks}
            />
          );
        })}
      </div>
    </div>
  );
}

// Format an optional per-turn timestamp for display. Accepts ISO-8601 or
// epoch milliseconds; falls back to the raw string when parsing fails so
// bulk-uploaded freeform timestamps still show up. Returns `null` for empty
// or missing input so callers can skip rendering entirely.
export function formatTurnTimestamp(raw: unknown): string | null {
  if (raw == null) return null;
  const s = typeof raw === "string" ? raw.trim() : String(raw);
  if (!s) return null;
  const asNumber = /^\d+$/.test(s) ? Number(s) : NaN;
  const d = Number.isFinite(asNumber) ? new Date(asNumber) : new Date(s);
  if (Number.isNaN(d.getTime())) return s;
  return d.toLocaleString();
}

// Shared Test Detail View Component
export function TestDetailView({
  history,
  output,
  passed,
  reasoning,
  evaluation,
  judgeResults,
  evaluatorsByUuid,
  legacyDefaultEvaluator,
  enableEvaluatorLinks = true,
  highlightEvalTarget = false,
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
  /** Top-level evaluators[] keyed by uuid. Source of truth for name,
   * description, scale, and output_config. */
  evaluatorsByUuid?: Record<string, TestRunEvaluator>;
  /** Default correctness evaluator used to render legacy response criteria
   * as evaluator variable values when `judgeResults` is absent. */
  legacyDefaultEvaluator?: DefaultEvaluatorSummary | null;
  /** Disable on public share pages because evaluator detail routes require auth. */
  enableEvaluatorLinks?: boolean;
  /** When true, the trailing assistant message (text reply or tool call)
   * in `history` is rendered with a blue left border + "Evaluation
   * target" pill. Used by the LLM labelling pane to indicate which
   * message annotators are scoring. */
  highlightEvalTarget?: boolean;
}) {
  // Precompute tool_call_id → response content map so the inline tool-call
  // card lookup is O(1) instead of scanning the entire history once per
  // tool_call render. Built once per render via useMemo.
  const toolResponseByCallId = useMemo(() => {
    const m = new Map<string, string>();
    for (const h of history) {
      if (
        h.role === "tool" &&
        typeof h.tool_call_id === "string" &&
        typeof h.content === "string"
      ) {
        m.set(h.tool_call_id, h.content);
      }
    }
    return m;
  }, [history]);

  const evalTargetIndex = highlightEvalTarget
    ? (() => {
        for (let i = history.length - 1; i >= 0; i--) {
          if (history[i].role === "assistant") return i;
        }
        return -1;
      })()
    : -1;

  // Auto-scroll to the most recent message whenever the list grows or
  // changes. The sentinel sits after the output section so the last
  // visible chunk is whatever the agent's final reply is.
  const bottomRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ block: "end" });
  }, [history.length, output?.response]);
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
            {history.map((message, index) => {
              const isEvalTarget = index === evalTargetIndex;
              const timestamp = formatTurnTimestamp(message.created_at);
              // Tool-response entries are surfaced inline on their parent
              // tool_call card via the `output` prop — skip them here so
              // they don't render as empty rows.
              if (message.role === "tool") return null;
              return (
              <div
                key={index}
                className={`space-y-1 ${
                  message.role === "user" ? "flex flex-col items-end" : ""
                } ${
                  isEvalTarget
                    ? "border-l-2 border-blue-500 pl-4 -ml-4"
                    : ""
                }`}
              >
                {/* User Message */}
                {message.role === "user" && (
                  <div className="max-w-[88%] md:max-w-3/4 w-fit flex flex-col">
                    <div className="px-3 md:px-4 py-2.5 md:py-3 rounded-xl bg-muted border border-border">
                      <p className="text-sm text-foreground whitespace-pre-wrap">
                        {message.content}
                      </p>
                    </div>
                    {timestamp && (
                      <span className="self-start text-[11px] text-muted-foreground tabular-nums mt-1">
                        {timestamp}
                      </span>
                    )}
                  </div>
                )}

                {/* Agent Message (text response) */}
                {message.role === "assistant" && !message.tool_calls && (
                  <>
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-sm font-medium text-foreground">
                        Agent
                      </span>
                      {isEvalTarget && (
                        <span className="inline-flex items-center px-2 py-0.5 rounded-md text-[10px] font-medium uppercase tracking-wide bg-blue-500/10 text-blue-600 dark:text-blue-400">
                          Evaluation target
                        </span>
                      )}
                    </div>
                    <div className="max-w-[88%] md:max-w-3/4 w-fit flex flex-col">
                      <div className="px-3 md:px-4 py-2.5 md:py-3 rounded-xl bg-background border border-border">
                        <p className="text-sm text-foreground whitespace-pre-wrap">
                          {message.content}
                        </p>
                      </div>
                      {timestamp && (
                        <span className="self-end text-[11px] text-muted-foreground tabular-nums mt-1">
                          {timestamp}
                        </span>
                      )}
                    </div>
                  </>
                )}

                {/* Agent Tool Call from history. The tool's response (if
                   present as a later `role: "tool"` entry with a matching
                   `tool_call_id`) is attached as the card's `output` so the
                   reviewer can see what the tool returned alongside the
                   call. */}
                {message.role === "assistant" &&
                  message.tool_calls &&
                  message.tool_calls.length > 0 && (
                    <>
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-sm font-medium text-foreground">
                          Agent Tool Call
                        </span>
                        {isEvalTarget && (
                          <span className="inline-flex items-center px-2 py-0.5 rounded-md text-[10px] font-medium uppercase tracking-wide bg-blue-500/10 text-blue-600 dark:text-blue-400">
                            Evaluation target
                          </span>
                        )}
                      </div>
                      <div className="w-[88%] md:w-3/4 flex flex-col">
                        {message.tool_calls.map((toolCall, tcIndex) => {
                          const { toolName, args } =
                            normalizeToolCall(toolCall);
                          const toolResponse = toolResponseByCallId.get(
                            toolCall.id,
                          );
                          return (
                            <ToolCallCard
                              key={tcIndex}
                              toolName={toolName}
                              args={args}
                              output={toolResponse}
                            />
                          );
                        })}
                        {timestamp && (
                          <span className="self-end text-[11px] text-muted-foreground tabular-nums mt-1">
                            {timestamp}
                          </span>
                        )}
                      </div>
                    </>
                  )}
              </div>
              );
            })}
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
                  <ReasoningToggleButton
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
              <div className="max-w-[88%] md:max-w-3/4 w-fit">
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
                  const {
                    toolName,
                    args,
                    output: toolOutput,
                  } = normalizeToolCall(toolCall);
                  return (
                    <div key={index} className="w-[88%] md:w-3/4">
                      <ToolCallCard
                        toolName={toolName}
                        args={args}
                        output={toolOutput}
                      />
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
            evaluatorsByUuid={
              // For the legacy free-text fallback the JudgeResultsList
              // also needs the synthetic top-level evaluator entry.
              evaluatorsByUuid ??
              (() => {
                const legacy = legacyEvaluatorEntry(legacyDefaultEvaluator);
                return legacy ? { [legacy.uuid]: legacy } : undefined;
              })()
            }
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
      <div ref={bottomRef} />
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
  evaluator,
  variableValues,
  enableEvaluatorLinks,
}: {
  result: JudgeResult;
  /** Top-level evaluator entry resolved by `result.evaluator_uuid`. */
  evaluator: TestRunEvaluator | null;
  variableValues?: Record<string, string> | null;
  enableEvaluatorLinks: boolean;
}) {
  const isRating = result.score !== null && result.score !== undefined;
  const effectiveVariables =
    result.variable_values && typeof result.variable_values === "object"
      ? result.variable_values
      : variableValues ?? null;
  const scale = evaluator?.output_config?.scale ?? null;
  const valueName = result.value_name?.trim() || null;
  return (
    <EvaluatorVerdictCard
      mode="read"
      name={evaluator?.name ?? "Evaluator"}
      description={evaluator?.description ?? null}
      outputType={isRating ? "rating" : "binary"}
      evaluatorUuid={result.evaluator_uuid ?? undefined}
      enableLink={enableEvaluatorLinks}
      variableValues={effectiveVariables}
      scaleMin={
        typeof evaluator?.scale_min === "number"
          ? evaluator.scale_min
          : undefined
      }
      scaleMax={
        typeof evaluator?.scale_max === "number"
          ? evaluator.scale_max
          : undefined
      }
      match={result.match}
      score={result.score}
      reasoning={result.reasoning}
      trueLabel={
        result.match === true && valueName
          ? valueName
          : getBinaryLabel(scale, true)
      }
      falseLabel={
        result.match === false && valueName
          ? valueName
          : getBinaryLabel(scale, false)
      }
      ratingScale={toRatingScale(scale)}
      ratingLabel={valueName}
    />
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
  testName,
  passed,
  judgeResults,
  reasoning,
  testCaseEvaluators,
  evaluatorsByUuid,
  legacyDefaultEvaluator,
  enableEvaluatorLinks = true,
}: {
  evaluation?: TestCaseEvaluation;
  testType?: string;
  /** Selected test name, pinned at the top of the panel above the results.
   * Full text with horizontal scroll for names wider than the column. */
  testName?: string;
  /** Top-level test verdict. Used to colour the tool-call evaluator card
   * (green=pass, red=fail). Null/undefined leaves the card neutral, which
   * is the right default while a run is still in progress. */
  passed?: boolean | null;
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
  /** Top-level evaluators[] keyed by uuid. Source of truth for name,
   * description, scale, and output_config. */
  evaluatorsByUuid?: Record<string, TestRunEvaluator>;
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
      {testName && (
        <div className="overflow-x-auto">
          <span className="block text-[11px] text-muted-foreground">Name</span>
          <span className="block text-xs text-foreground whitespace-nowrap">
            {testName}
          </span>
        </div>
      )}
      {!isToolCall && (
        <h3 className="text-sm font-semibold text-foreground">Evaluators</h3>
      )}

      {/* Tool-call test: the result (pass/fail + reasoning) shows first,
          followed by the expected tool calls below it. The deterministic
          tool-call match is binary, so we surface it through the same
          `EvaluatorVerdictCard` (read mode) the response-test per-evaluator
          cards use — name fixed to "Tool call test", verdict driven by the
          top-level `passed` field, reasoning attached as the collapsible
          explainer. While the run is still pending (`passed` null/undefined),
          we fall back to the neutral reasoning strip so the card doesn't show
          a misleading colour. */}
      {isToolCall && (
        <>
          {typeof passed === "boolean" ? (
            <EvaluatorVerdictCard
              mode="read"
              name="Tool call test"
              outputType="binary"
              enableLink={false}
              match={passed}
              reasoning={reasoning ?? null}
            />
          ) : (
            <CollapsibleReasoningStrip
              text={reasoning}
              mutedBody={false}
              leadingLabel="Reasoning"
            />
          )}
          <h3 className="text-sm font-semibold text-foreground">
            Expected Tool Calls
          </h3>
          {hasExpectedToolCalls ? (
            <div className="space-y-2">
              {evaluation!.tool_calls!.map((tc, i) => {
                const { toolName, args } = normalizeToolCall(tc);
                return (
                  <ToolCallCard
                    key={i}
                    toolName={toolName}
                    args={args}
                    expected
                  />
                );
              })}
            </div>
          ) : (
            <p className="text-xs text-muted-foreground">
              No expected tool calls specified
            </p>
          )}
        </>
      )}

      {/* Response test, new format: per-evaluator cards. */}
      {!isToolCall && hasJudgeResults && (
        <div className="space-y-3">
          {judgeResults!.map((jr, i) => {
            const ev = jr.evaluator_uuid
              ? evaluatorsByUuid?.[jr.evaluator_uuid] ?? null
              : null;
            return (
              <EvaluatorPanelCard
                key={jr.evaluator_uuid ?? `${i}`}
                result={jr}
                evaluator={ev}
                variableValues={
                  jr.evaluator_uuid
                    ? variablesByUuid[jr.evaluator_uuid]
                    : undefined
                }
                enableEvaluatorLinks={enableEvaluatorLinks}
              />
            );
          })}
        </div>
      )}

      {/* Response test, legacy fallback (pre-judge_results runs): render the
          old free-text criteria as the default next-reply evaluator's
          `criteria` variable. */}
      {!isToolCall && !hasJudgeResults && hasLegacyCriteria && (
        <div className="space-y-3">
          {legacyJudgeResults!.map((jr, i) => (
            <EvaluatorPanelCard
              key={jr.evaluator_uuid ?? `${i}`}
              result={jr}
              evaluator={legacyEvaluatorEntry(legacyDefaultEvaluator)}
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

// Scroll a list container so the given row is visible, a page at a time: if the
// row sits below the viewport it's aligned to the top (revealing a full page of
// following rows), and if it sits above it's aligned to the bottom. This avoids
// the row-by-row creep of `scrollIntoView({ block: "nearest" })` during rapid
// navigation. No-op when the row is already fully visible.
export function scrollRowByPage(
  container: HTMLElement | null,
  row: HTMLElement | null,
): void {
  if (!container || !row) return;
  const cRect = container.getBoundingClientRect();
  const rRect = row.getBoundingClientRect();
  const rowTop = rRect.top - cRect.top + container.scrollTop;
  const rowBottom = rowTop + rRect.height;
  const viewTop = container.scrollTop;
  const viewBottom = viewTop + container.clientHeight;
  let nextTop: number | null = null;
  if (rowBottom > viewBottom) {
    nextTop = rowTop;
  } else if (rowTop < viewTop) {
    nextTop = rowBottom - container.clientHeight;
  }
  if (nextTop !== null) {
    container.scrollTo({ top: nextTop, behavior: "smooth" });
  }
}

// True when a keyboard event originates from a text-entry element, so global
// shortcuts (e.g. arrow-key result navigation) don't hijack typing.
export function isTypingTarget(target: EventTarget | null): boolean {
  const el = target as HTMLElement | null;
  if (!el || !el.tagName) return false;
  const tag = el.tagName.toUpperCase();
  return (
    tag === "INPUT" ||
    tag === "TEXTAREA" ||
    tag === "SELECT" ||
    el.isContentEditable
  );
}

// Navigation state surfaced by the result panels so a parent (e.g. a dialog
// header) can render the Previous/Next pager outside the panel itself.
export type PagerNav = {
  /** 0-based position in the displayed list, or -1 when the current selection
   * isn't part of the filtered view. */
  currentIndex: number;
  /** Number of items in the displayed list. */
  total: number;
  goPrev: () => void;
  goNext: () => void;
};

// Shared Previous/Next pager. Renders inline (no border/padding of its own) so
// it can be dropped into a dialog header next to the title and stats. Buttons
// disable at the ends; the "N of M" counter shows between them.
export function ResultPager({
  currentIndex,
  total,
  onPrev,
  onNext,
}: {
  currentIndex: number;
  total: number;
  onPrev: () => void;
  onNext: () => void;
}) {
  // Nothing to page through when there's only one (or zero) item.
  if (total <= 1) return null;
  const hasPrev = currentIndex > 0;
  const hasNext = currentIndex >= 0 && currentIndex < total - 1;
  const btn =
    "inline-flex items-center gap-1 px-3 py-1.5 rounded-md border border-border bg-background text-sm font-medium text-foreground hover:bg-muted disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer transition-colors shrink-0";
  return (
    <div className="flex items-center gap-2">
      <button type="button" onClick={onPrev} disabled={!hasPrev} className={btn}>
        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
        </svg>
        Previous
      </button>
      {total > 0 && currentIndex >= 0 && (
        <span className="shrink-0 px-1 text-xs text-muted-foreground tabular-nums">
          {currentIndex + 1} of {total}
        </span>
      )}
      <button type="button" onClick={onNext} disabled={!hasNext} className={btn}>
        Next
        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
        </svg>
      </button>
    </div>
  );
}

// Shared Stats Display Component
export function TestStats({
  passedCount,
  failedCount,
  erroredCount = 0,
}: {
  passedCount: number;
  failedCount: number;
  /** Tests that errored out (neither passed nor failed). Hidden when 0. */
  erroredCount?: number;
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
      {erroredCount > 0 && (
        <div className="flex items-center gap-1.5">
          <div className="w-2 h-2 rounded-full bg-amber-500"></div>
          <span className="text-muted-foreground">{erroredCount} errored</span>
        </div>
      )}
    </div>
  );
}
