"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
import { Link } from "@/lib/nav";
import { apiClient, unwrapList } from "@/lib/api";
import { reportError } from "@/lib/reportError";
import { useAccessToken } from "@/hooks/useAccessToken";
import type { TestCaseResult } from "@/components/TestRunnerDialog";
import type { BenchmarkModelResult } from "@/components/eval-details";
import {
  outputToolCallsToHistory,
  type TestCaseEvaluation,
  type TestCaseHistory,
  type TestRunEvaluator,
  type ToolCallOutput,
} from "@/components/test-results/shared";
import { Select } from "@/components/ui/Select";

// One expected tool call as declared on a tool-call test's evaluation config.
export type ExpectedToolCall = NonNullable<
  TestCaseEvaluation["tool_calls"]
>[number];

// Each source kind maps to exactly one task type: test runs and benchmarks →
// "llm", or "llm-general" when their tests were written for a single agent
// response agent (a tool-call test goes into whichever of the two its own
// agent uses); STT runs → "stt", TTS runs → "tts", simulation runs →
// "conversation" (their
// transcript is a conversation). The type is derived from the source
// (`targetTaskTypeForSource`), never chosen by the user.
export const SUPPORTED_TARGET_TASK_TYPES = [
  "llm",
  "llm-general",
  "stt",
  "tts",
  "conversation",
] as const;
export type SupportedTaskType = (typeof SUPPORTED_TARGET_TASK_TYPES)[number];

/** A run evaluator reference — only the uuid is used by this dialog. */
export type SourceEvaluatorRef = { uuid: string; name?: string };

/** A normalised STT result row, pre-mapped by the STT page. */
export type SttLabellingRow = {
  name: string;
  reference_transcript: string;
  predicted_transcript: string;
};

/**
 * A normalised TTS result row, pre-mapped by the TTS page. The synthesized
 * clip lives at `audio_path` (a fetchable URL on the results page); the
 * `text` is the source string that was spoken — the inverse of an STT row.
 */
export type TtsLabellingRow = {
  name: string;
  text: string;
  audio_path: string;
};

/**
 * A normalised simulation result, pre-mapped by the simulation run page. The
 * transcript shape is permissive (role is a free string) so raw simulation
 * `TranscriptEntry[]` assigns directly; the conversation item pane normalises
 * roles itself when rendering.
 */
export type ConversationLabellingResult = {
  name: string;
  transcript: Array<{
    role: string;
    content?: string;
    tool_calls?: unknown;
    tool_call_id?: string;
    created_at?: string;
  }>;
};

/**
 * One trace, pre-mapped by the Traces tab. Deliberately not imported from the
 * traces module so this dialog stays independent of it (as with the stt / tts
 * / simulation rows): the caller maps its own rows into this shape.
 */
export type TraceLabellingItem = {
  name: string;
  /** Turns for a conversational agent, plain text for a general one. */
  input: unknown[] | string;
  output: { response?: string | null; tool_calls?: unknown[] | null };
};

export type AddRunToLabellingTaskSource =
  | {
      type: "test_run";
      runUuid: string;
      runName?: string;
      results: TestCaseResult[];
      evaluators?: TestRunEvaluator[];
    }
  | {
      type: "benchmark_run";
      benchmarkUuid: string;
      benchmarkName?: string;
      modelResults: BenchmarkModelResult[];
      evaluators?: TestRunEvaluator[];
    }
  | {
      type: "stt_run";
      runUuid: string;
      runName?: string;
      rows: SttLabellingRow[];
      evaluators?: SourceEvaluatorRef[];
    }
  | {
      type: "tts_run";
      runUuid: string;
      runName?: string;
      rows: TtsLabellingRow[];
      evaluators?: SourceEvaluatorRef[];
    }
  | {
      type: "simulation_run";
      runUuid: string;
      runName?: string;
      results: ConversationLabellingResult[];
      evaluators?: SourceEvaluatorRef[];
    }
  | {
      type: "traces";
      agentUuid: string;
      traces: TraceLabellingItem[];
      evaluators?: SourceEvaluatorRef[];
      /** A general agent answers one input at a time, so its traces are
       * labelled as an input and the output it produced, not as a
       * conversation. */
      agentNature?: "conversation" | "general";
    };

/** The single task type each source kind targets. */
export function targetTaskTypeForSource(
  source: AddRunToLabellingTaskSource,
): SupportedTaskType {
  switch (source.type) {
    case "stt_run":
      return "stt";
    case "tts_run":
      return "tts";
    case "simulation_run":
      return "conversation";
    case "traces":
      return source.agentNature === "general" ? "llm-general" : "llm";
    // A test run / benchmark says which kind of agent it ran through its own
    // test cases, so nothing has to be passed in: a single agent response
    // agent's tests target an Agent Response task, a conversation agent's
    // target a Next Reply one.
    case "test_run":
      return source.results.some((r) => isGeneralTestCase(r as RawTestCaseLike))
        ? "llm-general"
        : "llm";
    case "benchmark_run":
      return source.modelResults.some((mr) =>
        (mr.test_results ?? []).some((r) =>
          isGeneralTestCase(r as RawTestCaseLike),
        ),
      )
        ? "llm-general"
        : "llm";
    default:
      return "llm";
  }
}

/** Singular / plural noun for the items being submitted, per source kind. */
export function itemNounForSource(source: AddRunToLabellingTaskSource): {
  one: string;
  many: string;
} {
  switch (source.type) {
    case "stt_run":
    case "tts_run":
      return { one: "result", many: "results" };
    case "simulation_run":
      return { one: "conversation", many: "conversations" };
    case "traces":
      return { one: "trace", many: "traces" };
    default:
      return { one: "test", many: "tests" };
  }
}

export type AddRunToLabellingTaskDialogProps = {
  isOpen: boolean;
  onClose: () => void;
  source: AddRunToLabellingTaskSource;
  onAdded?: (taskUuid: string, itemsCreated: number) => void;
};

type LabellingTaskEvaluatorRef = {
  uuid: string;
  name?: string;
};

/** What `POST /annotation-tasks/{uuid}/items` returns. The two score fields
 * come back only when the items carried evaluator verdicts. */
type ItemsPostResponse = {
  evaluator_result_count?: number;
  evaluator_run_job_id?: string | null;
};

type LabellingTask = {
  uuid: string;
  name: string;
  type?: "llm" | "llm-general" | "stt" | "tts" | "conversation";
  description?: string;
  item_count?: number;
  evaluators?: LabellingTaskEvaluatorRef[];
};

// `name` is required (unique within a task; used for conflict handling). The
// rest of the payload shape depends on the task type: llm items carry
// `chat_history` / `agent_response` / `evaluator_variables`, stt items carry
// `reference_transcript` / `predicted_transcript`, conversation items carry
// `transcript`.
type BuiltItem = {
  payload: {
    name: string;
    description?: string;
    [key: string]: unknown;
  };
  /** The verdicts the run's evaluators already gave this result, keyed by
   * evaluator uuid. Sent alongside the item so the task holds the scores the
   * moment the items land, with no second call to the models. Absent when the
   * source has no verdicts (traces, a tool-call test, an unfinished run). */
  evaluator_results?: Record<string, EvaluatorResultSeed>;
};

/** One evaluator's verdict carried over from the run. `value` is a bool for a
 * binary evaluator and a number for a rating one; `version_number` pins the
 * version that produced it, so the task shows that version rather than
 * whichever is live now. */
export type EvaluatorResultSeed = {
  value: boolean | number;
  reasoning?: string;
  version_number?: number;
};

type TransformResult = {
  items: BuiltItem[];
  skippedCount: number;
  /** How many evaluator verdicts came across with these items, counted
   * across every item and evaluator. Zero when the source has none. */
  scoreCount: number;
  evaluatorUuids: Set<string>;
  /** The subset of evaluatorUuids that is the tool call evaluator. The
   * backend attaches it to a task on its own the moment the first tool-call
   * item lands there, unlike every other evaluator, so an existing task is
   * still offered even when it does not have this one yet. */
  toolCallEvaluatorUuids: Set<string>;
};

// The backend wraps failures as `Request failed: <status> - <json>`. The
// json's `detail` is sometimes a plain string and sometimes a structured
// object (`{ code, message, ... }`). Pull out the JSON body once so callers
// can both render a clean message and inspect a machine-readable `code`.
type ApiErrorDetail = {
  code?: string;
  message?: string;
  conflicting_names?: string[];
};

function extractApiErrorDetail(err: unknown): ApiErrorDetail | null {
  if (!(err instanceof Error)) return null;
  const match = err.message.match(/Request failed: \d+ - (.+)$/);
  if (!match) return null;
  try {
    const parsed = JSON.parse(match[1]);
    const detail = parsed?.detail;
    if (detail && typeof detail === "object") return detail as ApiErrorDetail;
    if (typeof detail === "string") return { message: detail };
  } catch {
    // not JSON
  }
  return { message: match[1] };
}

function parseApiError(err: unknown, fallback: string): string {
  const detail = extractApiErrorDetail(err);
  if (detail?.message) return detail.message;
  if (err instanceof Error && err.message) return err.message;
  return fallback;
}

type RawTestCaseLike = {
  test_case?: {
    name?: string;
    evaluation?: {
      type?: string;
      tool_calls?: ExpectedToolCall[] | null;
    } | null;
    history?: TestCaseHistory[] | null;
    /** The lone input a test written for a single agent response agent
     * carries instead of a conversation. */
    input?: string | null;
    evaluators?: Array<{
      evaluator_uuid?: string | null;
      uuid?: string | null;
      variable_values?: Record<string, string> | null;
    }> | null;
  } | null;
  test_name?: string;
  name?: string;
  chat_history?: TestCaseHistory[];
  output?: { response?: string; tool_calls?: ToolCallOutput[] } | null;
  judge_results?: Array<{
    evaluator_uuid?: string | null;
    variable_values?: Record<string, string> | null;
    /** The verdict itself: `match` for a binary evaluator, `score` for a
     * rating one. Exactly one is set on a finished row; both are absent when
     * the evaluator did not finish. */
    match?: boolean | null;
    score?: number | null;
    reasoning?: string | null;
  }> | null;
};

/** True for a test written for a single agent response agent — one input and
 * one output, no conversation. An Agent Response test says so with
 * `evaluation.type`; a Tool Call test written for the same agent only by
 * carrying `input` (its type is always "tool_call"). Same rule as the test
 * result view in `components/test-results/shared.tsx`. */
function isGeneralTestCase(raw: RawTestCaseLike): boolean {
  return (
    raw.test_case?.evaluation?.type === "general" ||
    typeof raw.test_case?.input === "string"
  );
}

/** The lone input a single agent response test was given. The run echoes it as
 * `test_case.input`; when it does not, the run widened it into a one-turn
 * history, so read it back from that user turn. */
function generalInputOf(raw: RawTestCaseLike): string {
  return (
    raw.test_case?.input ??
    (raw.test_case?.history ?? raw.chat_history ?? []).find(
      (h) => h.role === "user",
    )?.content ??
    ""
  );
}

/** True for a tool-call test — built as a tool-call item, not a response item. */
export function isToolCallTest(raw: RawTestCaseLike): boolean {
  return raw.test_case?.evaluation?.type === "tool_call";
}

/** Tests that can be added to LLM labelling tasks: a conversation agent's
 * next-reply test (`response`) and a single agent response agent's test
 * (`general`) both become a response item scored by the evaluators; a
 * tool-call test becomes a tool-call item a person marks correct or wrong. */
export function isLabellingEligibleRaw(raw: RawTestCaseLike): boolean {
  const type = raw.test_case?.evaluation?.type;
  return type === "response" || type === "general" || type === "tool_call";
}

// Build a tool-call item — a normal item inside an `llm` or `llm-general`
// task, carrying the expected match spec and the tool calls the agent actually
// made. A person marks it correct or wrong; AI judges skip it.
// `actual_tool_calls` is what marks the item as a tool-call one.
function buildToolCallItem(
  raw: RawTestCaseLike,
  nameOverride?: string,
): BuiltItem {
  const name =
    nameOverride ??
    raw.test_case?.name ??
    raw.test_name ??
    raw.name ??
    "Untitled test";
  const expected_tool_calls = raw.test_case?.evaluation?.tool_calls ?? [];
  const actual_tool_calls = raw.output?.tool_calls ?? [];
  // When the agent replied with text instead of calling a tool (a failed
  // tool-call test), keep the reply so the annotator sees what the agent
  // actually did rather than an empty tool-call panel.
  const response = raw.output?.response ?? "";

  // A single agent response agent has no conversation, so its tool-call test
  // is labelled as the one input it was given and the output it produced —
  // the same shape its response tests use in an Agent Response task.
  if (isGeneralTestCase(raw)) {
    return {
      payload: {
        name,
        input: generalInputOf(raw),
        output: response,
        actual_tool_calls,
        expected_tool_calls,
      },
    };
  }

  return {
    payload: {
      name,
      chat_history: raw.test_case?.history ?? raw.chat_history ?? [],
      expected_tool_calls,
      actual_tool_calls,
      agent_response: response,
    },
  };
}

/** The verdict on one judge_results row, or null when the evaluator did not
 * finish and so has nothing to carry over. */
function seedFromJudgeResult(jr: {
  match?: boolean | null;
  score?: number | null;
  reasoning?: string | null;
}): Omit<EvaluatorResultSeed, "version_number"> | null {
  const value =
    typeof jr.match === "boolean"
      ? jr.match
      : typeof jr.score === "number"
        ? jr.score
        : null;
  if (value === null) return null;
  return jr.reasoning ? { value, reasoning: jr.reasoning } : { value };
}

function buildOneItem(
  raw: RawTestCaseLike,
  nameOverride?: string,
  /** Version number per evaluator, from the run's own evaluators block, so
   * each carried-over verdict names the version that produced it. */
  versionByEvaluator?: Record<string, number>,
): { item: BuiltItem; evaluatorUuids: string[] } | null {
  // This builds a RESPONSE item. A tool-call test is eligible for labelling
  // too, but goes through `buildToolCallItem` instead — pushing one through
  // here would make an item with an empty answer.
  if (!isLabellingEligibleRaw(raw) || isToolCallTest(raw)) return null;

  const name =
    nameOverride ??
    raw.test_case?.name ??
    raw.test_name ??
    raw.name ??
    "Untitled test";

  const agent_response = raw.output?.response ?? "";
  // The agent's reply may be a tool call instead of text. `agent_response` can
  // only hold text, so append any output tool calls to the conversation as the
  // final assistant turn(s) — otherwise the tool call is dropped and the
  // annotator sees an empty evaluation target.
  const chat_history: TestCaseHistory[] = [
    ...(raw.test_case?.history ?? raw.chat_history ?? []),
    ...outputToolCallsToHistory(raw.output?.tool_calls ?? []),
  ];

  const evaluator_variables: Record<string, Record<string, string>> = {};
  const evaluator_results: Record<string, EvaluatorResultSeed> = {};
  const evaluatorUuids: string[] = [];
  // judge_results is the result-level echo populated for every response
  // test; test_case.evaluators is a config-level echo that may be absent.
  // Prefer judge_results and fall back to test_case.evaluators so we don't
  // lose variable values on either shape.
  for (const jr of raw.judge_results ?? []) {
    const uuid = jr?.evaluator_uuid ?? null;
    if (!uuid) continue;
    evaluatorUuids.push(uuid);
    if (jr?.variable_values && typeof jr.variable_values === "object") {
      evaluator_variables[uuid] = { ...jr.variable_values };
    }
    // Carry the verdict itself across, so the task holds the score without
    // the evaluators being run a second time on the same text.
    const seed = seedFromJudgeResult(jr);
    if (seed) {
      const version = versionByEvaluator?.[uuid];
      evaluator_results[uuid] =
        typeof version === "number" ? { ...seed, version_number: version } : seed;
    }
  }
  for (const ref of raw.test_case?.evaluators ?? []) {
    const uuid = ref?.evaluator_uuid ?? ref?.uuid ?? null;
    if (!uuid) continue;
    evaluatorUuids.push(uuid);
    if (
      !evaluator_variables[uuid] &&
      ref?.variable_values &&
      typeof ref.variable_values === "object"
    ) {
      evaluator_variables[uuid] = { ...ref.variable_values };
    }
  }

  // A single agent response test is labelled as the one input it was given
  // and the output it produced, which is what an Agent Response
  // ("llm-general") task holds. A conversation agent's test carries the
  // conversation so far plus the reply being judged.
  const payload = isGeneralTestCase(raw)
    ? {
        name,
        input: generalInputOf(raw),
        output: agent_response,
        evaluator_variables,
      }
    : { name, chat_history, agent_response, evaluator_variables };

  const item: BuiltItem =
    Object.keys(evaluator_results).length > 0
      ? { payload, evaluator_results }
      : { payload };
  return { item, evaluatorUuids };
}

export function buildItemsFromSource(
  source: AddRunToLabellingTaskSource,
): TransformResult {
  const items: BuiltItem[] = [];
  const evaluatorUuids = new Set<string>();
  const toolCallEvaluatorUuids = new Set<string>();
  let skippedCount = 0;
  const countScores = () =>
    items.reduce(
      (n, it) => n + Object.keys(it.evaluator_results ?? {}).length,
      0,
    );

  switch (source.type) {
    case "test_run":
    case "benchmark_run": {
      const runSuffix =
        source.type === "test_run"
          ? source.runUuid.slice(0, 8)
          : source.benchmarkUuid.slice(0, 8);
      // Response and tool-call tests both become items in the task: a
      // response test → a response item scored by the evaluators, a tool-call
      // test → a tool-call item a person marks correct or wrong.
      // The run names the version each evaluator ran at once, at the top
      // level, not on every verdict, so build the lookup once here.
      const versionByEvaluator: Record<string, number> = {};
      for (const ev of source.evaluators ?? []) {
        if (ev?.uuid && typeof ev.version_number === "number") {
          versionByEvaluator[ev.uuid] = ev.version_number;
        }
      }
      const handleRaw = (raw: RawTestCaseLike, fullName: string) => {
        if (isToolCallTest(raw)) {
          items.push(buildToolCallItem(raw, fullName));
          // A finished tool-call test's result names the evaluator that
          // judged it (Tool call correctness) in its own judge_results, the
          // same as a response test does. Recorded separately from the
          // other evaluators: unlike them, the backend attaches this one to
          // a task by itself, so it should not stop an otherwise-matching
          // task from being offered.
          for (const jr of raw.judge_results ?? []) {
            if (jr?.evaluator_uuid) {
              evaluatorUuids.add(jr.evaluator_uuid);
              toolCallEvaluatorUuids.add(jr.evaluator_uuid);
            }
          }
          return;
        }
        const built = buildOneItem(raw, fullName, versionByEvaluator);
        if (!built) {
          skippedCount += 1;
          return;
        }
        items.push(built.item);
        for (const id of built.evaluatorUuids) evaluatorUuids.add(id);
      };
      if (source.type === "test_run") {
        for (const r of source.results) {
          const raw = r as RawTestCaseLike;
          const baseName =
            raw.test_case?.name ?? raw.test_name ?? raw.name ?? "Untitled test";
          handleRaw(raw, `${baseName} — ${runSuffix}`);
        }
      } else {
        for (const mr of source.modelResults) {
          for (const r of mr.test_results ?? []) {
            const raw = r as RawTestCaseLike;
            const baseName =
              raw.test_case?.name ??
              raw.test_name ??
              raw.name ??
              "Untitled test";
            handleRaw(raw, `${baseName} — ${runSuffix} — ${mr.model}`);
          }
        }
      }
      // `evaluatorUuids` is built from the SELECTED tests' per-test echoes
      // (judge_results / test_case.evaluators), so the evaluator set — and
      // therefore the task filter and new-task evaluator_ids — reflects only
      // the tests being submitted. Fall back to the run-level evaluators[]
      // only when those echoes are entirely absent (sparse run payloads), so
      // we never produce an item set with zero evaluators. Tool-call items
      // carry no evaluators, but response items in the same task do.
      if (evaluatorUuids.size === 0) {
        for (const ev of source.evaluators ?? []) {
          if (ev?.uuid) evaluatorUuids.add(ev.uuid);
        }
      }
      return {
        items,
        skippedCount,
        scoreCount: countScores(),
        evaluatorUuids,
        toolCallEvaluatorUuids,
      };
    }
    case "stt_run": {
      // STT results carry no per-row judge variable echoes, so the evaluator
      // set comes wholesale from the run-level evaluators.
      for (const row of source.rows) {
        items.push({
          payload: {
            name: row.name,
            reference_transcript: row.reference_transcript,
            predicted_transcript: row.predicted_transcript,
          },
        });
      }
      for (const ev of source.evaluators ?? []) {
        if (ev?.uuid) evaluatorUuids.add(ev.uuid);
      }
      return {
        items,
        skippedCount,
        scoreCount: countScores(),
        evaluatorUuids,
        toolCallEvaluatorUuids,
      };
    }
    case "tts_run": {
      // TTS results carry no per-row judge variable echoes either, so the
      // evaluator set comes wholesale from the run-level evaluators. Each
      // item pairs the source `text` with the synthesized `audio_path`.
      for (const row of source.rows) {
        items.push({
          payload: {
            name: row.name,
            text: row.text,
            audio_path: row.audio_path,
          },
        });
      }
      for (const ev of source.evaluators ?? []) {
        if (ev?.uuid) evaluatorUuids.add(ev.uuid);
      }
      return {
        items,
        skippedCount,
        scoreCount: countScores(),
        evaluatorUuids,
        toolCallEvaluatorUuids,
      };
    }
    case "simulation_run": {
      for (const r of source.results) {
        items.push({
          payload: {
            name: r.name,
            transcript: r.transcript,
          },
        });
      }
      for (const ev of source.evaluators ?? []) {
        if (ev?.uuid) evaluatorUuids.add(ev.uuid);
      }
      return {
        items,
        skippedCount,
        scoreCount: countScores(),
        evaluatorUuids,
        toolCallEvaluatorUuids,
      };
    }
    case "traces": {
      // A general agent's trace is one input and the output it produced, which
      // is what an Agent Response task holds. Nothing is judged yet, so there is
      // no reasoning or score to carry over.
      if (source.agentNature === "general") {
        for (const t of source.traces) {
          const input = typeof t.input === "string" ? t.input : "";
          const output = t.output?.response ?? "";
          if (!input.trim() || !output.trim()) {
            skippedCount += 1;
            continue;
          }
          items.push({
            payload: { name: t.name, input, output, evaluator_variables: {} },
          });
        }
        for (const ev of source.evaluators ?? []) {
          if (ev?.uuid) evaluatorUuids.add(ev.uuid);
        }
        return {
        items,
        skippedCount,
        scoreCount: countScores(),
        evaluatorUuids,
        toolCallEvaluatorUuids,
      };
      }
      for (const t of source.traces) {
        const built = buildOneItem({
          test_case: {
            name: t.name,
            history: t.input as TestCaseHistory[],
            // Required: buildOneItem drops anything whose evaluation type is
            // not "response", so without this every trace is silently skipped.
            evaluation: { type: "response" },
          },
          output: t.output as {
            response?: string;
            tool_calls?: ToolCallOutput[];
          },
        });
        if (!built) {
          skippedCount += 1;
          continue;
        }
        items.push(built.item);
      }
      // A trace has no run and therefore no judge results, so its items carry
      // no evaluator variables. The evaluators come wholesale from the source
      // (the caller asks the user to pick them).
      for (const ev of source.evaluators ?? []) {
        if (ev?.uuid) evaluatorUuids.add(ev.uuid);
      }
      return {
        items,
        skippedCount,
        scoreCount: countScores(),
        evaluatorUuids,
        toolCallEvaluatorUuids,
      };
    }
    default:
      return {
        items: [],
        skippedCount: 0,
        scoreCount: 0,
        evaluatorUuids: new Set(),
        toolCallEvaluatorUuids: new Set(),
      };
  }
}

type Mode = "existing" | "new";

export function AddRunToLabellingTaskDialog({
  isOpen,
  onClose,
  source,
  onAdded,
}: AddRunToLabellingTaskDialogProps): React.ReactElement | null {
  const accessToken = useAccessToken();
  const mountedRef = useRef(true);

  const [tasks, setTasks] = useState<LabellingTask[]>([]);
  const [tasksLoading, setTasksLoading] = useState(false);
  const [tasksError, setTasksError] = useState<string | null>(null);

  const [mode, setMode] = useState<Mode>("existing");
  const [selectedTaskUuid, setSelectedTaskUuid] = useState<string>("");
  const [newName, setNewName] = useState("");
  const [newDescription, setNewDescription] = useState("");
  const [nameInvalid, setNameInvalid] = useState(false);

  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [success, setSuccess] = useState<{
    taskUuid: string;
    taskName: string;
    itemsCreated: number;
    itemsSkipped: number;
    /** Verdicts carried over with the items that were added, as the backend
     * counted them. */
    scoresAdded: number;
    /** The evaluator run the carried-over scores were recorded as, so the
     * reader can open them. Absent when no scores came across. */
    scoresRunUuid?: string;
  } | null>(null);
  const onAddedFiredRef = useRef(false);

  // Each source kind targets exactly one task type (llm / stt / conversation).
  const targetTaskType: SupportedTaskType = useMemo(
    () => targetTaskTypeForSource(source),
    [source],
  );
  const noun = useMemo(() => itemNounForSource(source), [source]);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  useEffect(() => {
    if (!isOpen) return;
    setMode("existing");
    setSelectedTaskUuid("");
    setNewName("");
    setNewDescription("");
    setNameInvalid(false);
    setSubmitting(false);
    setSubmitError(null);
    setSuccess(null);
    onAddedFiredRef.current = false;
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen || !accessToken) return;
    let cancelled = false;
    const run = async () => {
      setTasksLoading(true);
      setTasksError(null);
      try {
        const data = await apiClient<unknown>("/annotation-tasks", accessToken);
        if (cancelled || !mountedRef.current) return;
        setTasks(unwrapList<LabellingTask>(data));
      } catch (err) {
        reportError(
          "AddRunToLabellingTaskDialog: failed to load labelling tasks",
          err,
        );
        if (cancelled || !mountedRef.current) return;
        setTasksError(parseApiError(err, "Failed to load labelling tasks"));
      } finally {
        if (!cancelled && mountedRef.current) setTasksLoading(false);
      }
    };
    run();
    return () => {
      cancelled = true;
    };
  }, [isOpen, accessToken]);

  const transform = useMemo(() => buildItemsFromSource(source), [source]);
  const { items, skippedCount, evaluatorUuids, toolCallEvaluatorUuids } =
    transform;

  // First relevance gate: the task must be of the type this source targets.
  const typeMatchedTasks = useMemo(
    () => tasks.filter((t) => t.type === targetTaskType),
    [tasks, targetTaskType],
  );

  // Second relevance gate: the task must already carry (at least) every
  // evaluator the run uses. Items reference these evaluators by uuid in
  // their `evaluator_variables`, so a task missing any of them can't be
  // labelled/evaluated against the full set. `evaluatorUuids` is the union
  // across the run's tests, so this follows any future per-test selection.
  const supportedTasks = useMemo(
    () =>
      typeMatchedTasks.filter((t) => {
        const taskEvals = new Set((t.evaluators ?? []).map((e) => e.uuid));
        for (const id of evaluatorUuids) {
          // The tool call evaluator does not have to be on the task yet —
          // the backend attaches it itself the moment the first tool-call
          // item lands, so its absence should not rule the task out.
          if (toolCallEvaluatorUuids.has(id)) continue;
          if (!taskEvals.has(id)) return false;
        }
        return true;
      }),
    [typeMatchedTasks, evaluatorUuids, toolCallEvaluatorUuids],
  );

  useEffect(() => {
    if (mode !== "existing") return;
    if (supportedTasks.length === 1 && !selectedTaskUuid) {
      setSelectedTaskUuid(supportedTasks[0].uuid);
    }
  }, [mode, supportedTasks, selectedTaskUuid]);

  const selectedTask = useMemo(
    () => supportedTasks.find((t) => t.uuid === selectedTaskUuid) ?? null,
    [supportedTasks, selectedTaskUuid],
  );

  const showExistingTaskPicker =
    !tasksLoading && !tasksError && supportedTasks.length > 0;
  const effectiveMode: Mode = showExistingTaskPicker ? mode : "new";

  useEffect(() => {
    if (!isOpen || tasksLoading || tasksError) return;
    setMode(supportedTasks.length === 0 ? "new" : "existing");
  }, [isOpen, tasksLoading, tasksError, supportedTasks.length]);

  const canSubmit = (() => {
    if (submitting || success) return false;
    if (items.length === 0) return false;
    if (effectiveMode === "existing") return !!selectedTaskUuid;
    return newName.trim().length > 0;
  })();

  const handleSubmit = async () => {
    if (!canSubmit || !accessToken) return;
    if (effectiveMode === "new" && !newName.trim()) {
      setNameInvalid(true);
      return;
    }
    setSubmitting(true);
    setSubmitError(null);
    try {
      let taskUuid: string;
      let taskName: string;

      if (effectiveMode === "new") {
        const body: {
          name: string;
          type: SupportedTaskType;
          description?: string;
          evaluator_ids?: string[];
        } = {
          name: newName.trim(),
          type: targetTaskType,
        };
        if (newDescription.trim()) body.description = newDescription.trim();
        if (evaluatorUuids.size > 0)
          body.evaluator_ids = Array.from(evaluatorUuids);
        const created = await apiClient<{ uuid: string; message?: string }>(
          "/annotation-tasks",
          accessToken,
          { method: "POST", body },
        );
        taskUuid = created.uuid;
        taskName = newName.trim();
      } else {
        if (!selectedTask) {
          setSubmitError("Pick a task to add items to.");
          setSubmitting(false);
          return;
        }
        taskUuid = selectedTask.uuid;
        taskName = selectedTask.name;
      }

      // `payload.name` is unique within a task, so re-adding the same run's
      // tests conflicts. The backend reports the exact `conflicting_names`;
      // drop those and retry with the rest so partial re-adds still go
      // through instead of failing the whole batch.
      let toPost = items;
      let itemsSkipped = 0;
      // The response reports how many carried-over scores were stored and
      // which evaluator run holds them. Both are absent when the items
      // carried none.
      let added: ItemsPostResponse = {};
      try {
        added = await apiClient<ItemsPostResponse>(
          `/annotation-tasks/${taskUuid}/items`,
          accessToken,
          { method: "POST", body: { items: toPost } },
        );
      } catch (err) {
        const detail = extractApiErrorDetail(err);
        if (
          detail?.code !== "ITEM_NAME_CONFLICT" ||
          !Array.isArray(detail.conflicting_names)
        ) {
          throw err;
        }
        const conflicting = new Set(detail.conflicting_names);
        toPost = items.filter((i) => !conflicting.has(i.payload.name));
        itemsSkipped = items.length - toPost.length;
        if (toPost.length === 0) {
          if (!mountedRef.current) return;
          setSubmitError(
            items.length === 1
              ? `This ${noun.one} is already in the task`
              : `All ${items.length} ${noun.many} are already in the task`,
          );
          setSubmitting(false);
          return;
        }
        added = await apiClient<ItemsPostResponse>(
          `/annotation-tasks/${taskUuid}/items`,
          accessToken,
          { method: "POST", body: { items: toPost } },
        );
      }

      if (!mountedRef.current) return;
      setSuccess({
        taskUuid,
        taskName,
        itemsCreated: toPost.length,
        itemsSkipped,
        scoresAdded:
          typeof added?.evaluator_result_count === "number"
            ? added.evaluator_result_count
            : toPost.reduce(
                (n, it) => n + Object.keys(it.evaluator_results ?? {}).length,
                0,
              ),
        scoresRunUuid: added?.evaluator_run_job_id ?? undefined,
      });
      if (onAdded && !onAddedFiredRef.current) {
        onAddedFiredRef.current = true;
        onAdded(taskUuid, toPost.length);
      }
    } catch (err) {
      reportError(
        "AddRunToLabellingTaskDialog: failed to add items to task",
        err,
      );
      if (!mountedRef.current) return;
      setSubmitError(parseApiError(err, "Failed to add items"));
    } finally {
      if (mountedRef.current) setSubmitting(false);
    }
  };

  if (!isOpen) return null;

  const actionLabel =
    effectiveMode === "new" ? "Create task & add" : "Add to task";

  // "the evaluator" for one, "all N evaluators" for many — avoids the awkward
  // "all 1 evaluator" phrasing on single-evaluator runs.
  const evaluatorPhrase =
    evaluatorUuids.size === 1
      ? "the evaluator"
      : `all ${evaluatorUuids.size} evaluators`;

  const noExistingTasksMessage =
    evaluatorUuids.size > 0
      ? `No existing tasks were found that include ${evaluatorPhrase} in the selected ${noun.many}.`
      : "No existing labelling tasks were found.";

  const newTaskForm = (
    <div className="space-y-4">
      <div>
        <label className="block text-sm font-medium mb-2">
          Name <span className="text-red-500">*</span>
        </label>
        <input
          autoFocus
          value={newName}
          onChange={(e) => {
            setNewName(e.target.value);
            if (nameInvalid) setNameInvalid(false);
          }}
          placeholder="e.g. Maternal health helpline, May calls"
          disabled={submitting}
          className={`w-full h-10 px-3 rounded-md text-sm border bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-accent disabled:opacity-50 disabled:cursor-not-allowed ${
            nameInvalid ? "border-red-500" : "border-border"
          }`}
        />
        {nameInvalid && (
          <p className="mt-1 text-sm text-red-500">Name is required.</p>
        )}
      </div>
      <div>
        <label className="block text-sm font-medium mb-2">Description</label>
        <textarea
          value={newDescription}
          onChange={(e) => setNewDescription(e.target.value)}
          placeholder="Short description of the labelling task"
          rows={3}
          disabled={submitting}
          className="w-full px-3 py-2 rounded-md text-sm border border-border bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-accent resize-y disabled:opacity-50 disabled:cursor-not-allowed"
        />
      </div>
    </div>
  );

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
      <div className="w-full max-w-md rounded-xl bg-background border border-border p-6 shadow-xl max-h-[90vh] overflow-y-auto">
        <div className="flex items-start justify-between gap-3 mb-4">
          <h2 className="text-base md:text-lg font-semibold text-foreground">
            {success
              ? "Submitted for labelling"
              : `Submit ${items.length} ${
                  items.length === 1 ? noun.one : noun.many
                } for labelling`}
          </h2>
          <button
            onClick={onClose}
            disabled={submitting}
            className="flex items-center justify-center w-8 h-8 rounded-md hover:bg-muted transition-colors cursor-pointer flex-shrink-0 disabled:opacity-50 disabled:cursor-not-allowed"
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

        {success ? (
          <div className="space-y-6">
            <p className="text-sm text-foreground">
              Added {success.itemsCreated}{" "}
              {success.itemsCreated === 1 ? noun.one : noun.many} to{" "}
              <span className="font-medium">{success.taskName}</span>
              {success.itemsSkipped > 0
                ? `. ${success.itemsSkipped} ${
                    success.itemsSkipped === 1 ? noun.one : noun.many
                  } already in the task ${
                    success.itemsSkipped === 1 ? "was" : "were"
                  } skipped`
                : ""}
            </p>
            {success.scoresAdded > 0 && (
              <p className="text-sm text-muted-foreground">
                {success.scoresRunUuid ? (
                  <Link
                    href={`/human-alignment/tasks/${success.taskUuid}/evaluator-runs/${success.scoresRunUuid}`}
                    className="underline hover:text-foreground"
                  >
                    {success.scoresAdded}{" "}
                    {success.scoresAdded === 1 ? "score" : "scores"}
                  </Link>
                ) : (
                  `${success.scoresAdded} ${
                    success.scoresAdded === 1 ? "score" : "scores"
                  }`
                )}{" "}
                the evaluators already gave came across, so you do not have to
                run the evaluators again.
              </p>
            )}
            <div className="flex items-center justify-end gap-2 md:gap-3">
              <button
                onClick={onClose}
                className="h-9 md:h-10 px-4 rounded-lg text-sm md:text-base font-medium border border-border bg-background dark:bg-muted hover:bg-muted/50 dark:hover:bg-accent transition-colors cursor-pointer"
              >
                Back
              </button>
              <Link
                href={`/human-alignment/tasks/${success.taskUuid}`}
                className="h-9 md:h-10 px-4 flex items-center rounded-lg text-sm md:text-base font-medium bg-foreground text-background hover:opacity-90 transition-opacity cursor-pointer"
              >
                View task
              </Link>
            </div>
          </div>
        ) : (
          <div className="space-y-4">
            {skippedCount > 0 && (
              <div className="flex items-start gap-2 rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2.5 text-sm text-foreground">
                <svg
                  className="w-4 h-4 mt-0.5 shrink-0 text-amber-600 dark:text-amber-400"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                  strokeWidth={2}
                  aria-hidden
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M13 16h-1v-4h-1m1-4h.01M12 2a10 10 0 100 20 10 10 0 000-20z"
                  />
                </svg>
                <span>
                  {skippedCount} {skippedCount === 1 ? "item" : "items"} could
                  not be added for labelling.
                </span>
              </div>
            )}
            {showExistingTaskPicker && (
              <div className="inline-flex rounded-lg border border-border p-0.5 bg-muted/30">
                <button
                  type="button"
                  onClick={() => setMode("existing")}
                  disabled={submitting}
                  className={`h-8 px-3 rounded-md text-xs md:text-sm font-medium transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed ${
                    mode === "existing"
                      ? "bg-foreground text-background"
                      : "text-muted-foreground hover:text-foreground"
                  }`}
                >
                  Use existing task
                </button>
                <button
                  type="button"
                  onClick={() => setMode("new")}
                  disabled={submitting}
                  className={`h-8 px-3 rounded-md text-xs md:text-sm font-medium transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed ${
                    mode === "new"
                      ? "bg-foreground text-background"
                      : "text-muted-foreground hover:text-foreground"
                  }`}
                >
                  Create new task
                </button>
              </div>
            )}

            {tasksLoading ? (
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <svg
                  className="w-4 h-4 animate-spin"
                  fill="none"
                  viewBox="0 0 24 24"
                >
                  <circle
                    className="opacity-25"
                    cx="12"
                    cy="12"
                    r="10"
                    stroke="currentColor"
                    strokeWidth="4"
                  />
                  <path
                    className="opacity-75"
                    fill="currentColor"
                    d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                  />
                </svg>
                Loading tasks
              </div>
            ) : tasksError ? (
              <p className="text-sm text-red-500">{tasksError}</p>
            ) : showExistingTaskPicker && mode === "existing" ? (
              <div>
                <label className="block text-sm font-medium mb-2">
                  Select the labelling task to add the {noun.many} to
                </label>
                <Select
                  value={selectedTaskUuid}
                  onChange={(e) => setSelectedTaskUuid(e.target.value)}
                  disabled={submitting}
                  className="cursor-pointer disabled:cursor-not-allowed"
                >
                  <option value="">Select a task</option>
                  {supportedTasks.map((t) => (
                    <option key={t.uuid} value={t.uuid}>
                      {t.name}
                      {typeof t.item_count === "number"
                        ? ` (${t.item_count} items)`
                        : ""}
                    </option>
                  ))}
                </Select>
                {evaluatorUuids.size > 0 && (
                  <p className="mt-1.5 text-xs text-muted-foreground">
                    Only tasks that already include {evaluatorPhrase} used by
                    this run are shown
                  </p>
                )}
              </div>
            ) : (
              <>
                {!showExistingTaskPicker && (
                  <p className="text-sm text-muted-foreground">
                    {noExistingTasksMessage}
                  </p>
                )}
                {newTaskForm}
              </>
            )}

            {submitError && (
              <p className="text-sm text-red-500">{submitError}</p>
            )}

            <div className="flex items-center justify-end gap-2 md:gap-3 pt-2">
              <button
                onClick={onClose}
                disabled={submitting}
                className="h-9 md:h-10 px-4 rounded-lg text-sm md:text-base font-medium border border-border bg-background dark:bg-muted hover:bg-muted/50 dark:hover:bg-accent transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Cancel
              </button>
              <button
                onClick={handleSubmit}
                disabled={!canSubmit}
                className="h-9 md:h-10 px-4 rounded-lg text-sm md:text-base font-medium bg-foreground text-background hover:opacity-90 transition-opacity cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {submitting ? "Adding…" : actionLabel}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
