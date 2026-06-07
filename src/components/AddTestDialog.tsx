"use client";

import React, {
  useState,
  useEffect,
  useLayoutEffect,
  useRef,
  useCallback,
} from "react";
import { createPortal } from "react-dom";
import { signOut } from "next-auth/react";
import { useAccessToken } from "@/hooks";
import { getDefaultHeaders } from "@/lib/api";
import { ToolPicker, AvailableTool } from "@/components/ToolPicker";
import { NestedContainer } from "@/components/ui/NestedContainer";
import {
  readToolParameters,
  NormalizedToolParam,
} from "@/lib/toolParams";
import { INBUILT_TOOLS } from "@/constants/inbuilt-tools";
import { useHideFloatingButton } from "@/components/AppLayout";
import { formatTurnTimestamp } from "@/components/test-results/shared";

// A single expected parameter row in a tool-call test. The shape is recursive:
// `object`-typed parameters carry their own `properties` (nested rows) so the
// dialog can render a section-within-a-section. `required` is derived from the
// tool's declared schema and gates whether the row can be removed. `custom`
// rows are user-added (free-form name + value) — they appear for
// structured-output tools with no declared parameters and for `object` params
// that declare no properties of their own.
// Data types a custom (user-added) expected parameter can take — mirrors the
// set offered in the add-tool dialog's ParameterCard.
const EXPECTED_PARAM_TYPES = [
  "boolean",
  "integer",
  "number",
  "string",
  "object",
  "array",
] as const;

// How a leaf parameter's expected value is matched against the actual tool call:
// `exact` compares the literal value, `llm_judge` hands the actual value to an
// LLM along with the user's free-text criteria. Booleans are always `exact`.
type MatchType = "exact" | "llm_judge";

// The UI-level match mode shown in the per-parameter dropdown. "null" is a
// presentation-only variant of an exact match (emitted as value: null).
type MatchMode = "exact" | "llm_judge" | "null";

type ExpectedParam = {
  id: string;
  name: string;
  value: string;
  // Match strategy for this leaf row. Always `exact` for objects (containers)
  // and booleans. Drives whether the value box or the criteria box is shown.
  matchType: MatchType;
  // Free-text judging criteria, used only when `matchType === "llm_judge"`.
  criteria: string;
  // When true, the expected value is `null` — the value field is disabled and
  // the row emits `{ match_type: "exact", value: null }`. Exact-match only.
  isNull?: boolean;
  // Optional per-parameter judge model override (round-tripped from saved
  // tests; not surfaced as an input in the UI).
  judgeModel?: string;
  required: boolean;
  // JSON-schema data type ("string", "integer", "object", "array", …). Drives
  // the type picker for custom rows and how the value is coerced on save.
  dataType: string;
  isObject: boolean;
  custom: boolean;
  // True for `object` params that declare no properties — the user may add
  // arbitrary key/value rows under them.
  allowCustomKeys: boolean;
  properties?: ExpectedParam[];
};

// Read a saved tool-call argument value into a leaf row's match fields. Argument
// values may be a literal (legacy exact match), an explicit
// `{ match_type: "exact", value }`, or `{ match_type: "llm_judge", criteria,
// judge_model? }`. A dict containing a `match_type` key is always a spec.
const parseArgMatch = (
  v: any,
): { matchType: MatchType; value: any; criteria: string; judgeModel?: string } => {
  if (
    v !== null &&
    typeof v === "object" &&
    !Array.isArray(v) &&
    "match_type" in v
  ) {
    if (v.match_type === "llm_judge") {
      return {
        matchType: "llm_judge",
        value: undefined,
        criteria: typeof v.criteria === "string" ? v.criteria : "",
        judgeModel: typeof v.judge_model === "string" ? v.judge_model : undefined,
      };
    }
    // Explicit exact spec — unwrap to the literal value.
    return { matchType: "exact", value: v.value, criteria: "" };
  }
  return { matchType: "exact", value: v, criteria: "" };
};

// Best-effort JSON data type for a saved argument value (edit mode).
const inferExpectedDataType = (v: any): string => {
  if (Array.isArray(v)) return "array";
  if (v !== null && typeof v === "object") return "object";
  if (typeof v === "boolean") return "boolean";
  if (typeof v === "number") return Number.isInteger(v) ? "integer" : "number";
  return "string";
};

// Coerce a custom/leaf row's string value into the JSON type the user picked.
const coerceExpectedValue = (value: string, dataType: string): any => {
  const trimmed = value.trim();
  switch (dataType) {
    case "integer":
    case "number": {
      const n = Number(trimmed);
      return trimmed !== "" && !Number.isNaN(n) ? n : value;
    }
    case "boolean":
      if (trimmed === "true") return true;
      if (trimmed === "false") return false;
      return value;
    case "array":
    case "object":
      try {
        return JSON.parse(trimmed);
      } catch {
        return value;
      }
    case "string":
      return value;
    default:
      try {
        return JSON.parse(trimmed);
      } catch {
        return value;
      }
  }
};

// True when a leaf row's (non-empty) value is malformed for its declared type —
// e.g. non-numeric text in a number/integer field. Drives inline error styling
// and gates saving. Empty values are handled separately by required-ness.
const expectedValueTypeError = (value: string, dataType: string): boolean => {
  const v = value.trim();
  if (!v) return false;
  if (dataType === "integer") return !/^[+-]?\d+$/.test(v);
  if (dataType === "number") return !Number.isFinite(Number(v));
  return false;
};

type SelectedToolConfig = {
  id: string;
  name: string;
  expectation: "should-call" | "should-not-call";
  acceptAnyParameterValues: boolean;
  isInbuilt: boolean;
  // True when the tool declares no parameters but is a structured-output tool —
  // the user may add arbitrary top-level expected parameters for the test.
  allowCustomParameters: boolean;
  expectedParameters: ExpectedParam[];
};

let expParamIdCounter = 0;
const newExpParamId = () =>
  `exp-${++expParamIdCounter}-${Math.random().toString(36).slice(2, 8)}`;

const expectedValueToString = (v: any): string => {
  if (v === null || v === undefined) return "";
  if (typeof v === "object") return JSON.stringify(v);
  return String(v);
};

// Map a normalized schema parameter (from @/lib/toolParams, shared with the
// tool builder) into an ExpectedParam, attaching test-editor-specific fields.
const normalizedToExpectedParam = (n: NormalizedToolParam): ExpectedParam => {
  const isObject = n.dataType === "object";
  return {
    id: newExpParamId(),
    name: n.name,
    value: "",
    matchType: "exact",
    criteria: "",
    required: n.required,
    dataType: n.dataType,
    isObject,
    custom: false,
    // An object that declares no properties lets the user add arbitrary keys.
    allowCustomKeys: isObject && (n.properties?.length ?? 0) === 0,
    properties: isObject
      ? (n.properties ?? []).map(normalizedToExpectedParam)
      : undefined,
  };
};

// Build the expected-parameter tree (no values) from a tool's stored config.
// Returns the param list plus whether the user may add arbitrary top-level keys
// (true for structured-output tools that declare no parameters).
const buildExpectedParamsFromToolConfig = (
  config: Record<string, any> | undefined,
): { params: ExpectedParam[]; allowCustom: boolean } => {
  const isWebhook = config?.type === "webhook";
  const params = readToolParameters(config).map(normalizedToExpectedParam);
  const allowCustom = params.length === 0 && !isWebhook;
  return { params, allowCustom };
};

// Deep-clone an expected-parameter node, assigning fresh ids throughout so the
// result can be safely re-inserted into the tree (used when re-adding a
// previously-removed optional schema parameter).
const cloneExpParamFresh = (param: ExpectedParam): ExpectedParam => ({
  ...param,
  id: newExpParamId(),
  value: "",
  criteria: "",
  isNull: false,
  properties: param.properties
    ? param.properties.map(cloneExpParamFresh)
    : param.properties,
});

// A blank user-added parameter row of the given data type.
const makeCustomParam = (dataType: string = "string"): ExpectedParam => {
  const isObject = dataType === "object";
  return {
    id: newExpParamId(),
    name: "",
    // Booleans default to "true" since the only valid values are true/false.
    value: dataType === "boolean" ? "true" : "",
    matchType: "exact",
    criteria: "",
    required: false,
    dataType,
    isObject,
    custom: true,
    allowCustomKeys: isObject,
    properties: isObject ? [] : undefined,
  };
};

// Build a custom param row from a saved argument value, inferring its type.
const customParamFromArg = (name: string, raw: any): ExpectedParam => {
  const { matchType, value: v, criteria, judgeModel } = parseArgMatch(raw);
  if (matchType === "llm_judge") {
    return {
      id: newExpParamId(),
      name,
      value: "",
      matchType: "llm_judge",
      criteria,
      judgeModel,
      required: false,
      dataType: "string",
      isObject: false,
      custom: true,
      allowCustomKeys: false,
      properties: undefined,
    };
  }
  const isObj = v !== null && typeof v === "object" && !Array.isArray(v);
  return {
    id: newExpParamId(),
    name,
    value: isObj || v === null ? "" : expectedValueToString(v),
    matchType: "exact",
    criteria: "",
    isNull: v === null,
    required: false,
    dataType: inferExpectedDataType(v),
    isObject: isObj,
    custom: true,
    allowCustomKeys: isObj,
    properties: isObj ? argsToCustomParams(v) : undefined,
  };
};

// Build a pure-custom tree from a saved arguments object when no schema is
// available (e.g. the tool was deleted, or it declares no parameters).
const argsToCustomParams = (args: Record<string, any>): ExpectedParam[] =>
  Object.entries(args).map(([name, v]) => customParamFromArg(name, v));

// Overlay saved tool-call argument values onto a schema-derived param tree
// (edit mode). Required params are always kept; optional ones the saved test
// didn't assert are dropped; saved keys with no matching schema param surface
// as custom rows.
const overlayArgsOntoParams = (
  schemaParams: ExpectedParam[],
  args: Record<string, any>,
): ExpectedParam[] => {
  const schemaNames = new Set(schemaParams.map((p) => p.name));
  const merged: ExpectedParam[] = [];

  for (const p of schemaParams) {
    const present = Object.prototype.hasOwnProperty.call(args, p.name);
    if (!present) {
      if (p.required) merged.push(p);
      continue;
    }
    const rawVal = args[p.name];
    if (p.isObject) {
      // Objects are containers; if a saved value arrived wrapped in an explicit
      // exact spec, unwrap it before recursing into the nested properties.
      const unwrapped = parseArgMatch(rawVal).value;
      const childArgs =
        unwrapped !== null &&
        typeof unwrapped === "object" &&
        !Array.isArray(unwrapped)
          ? unwrapped
          : {};
      merged.push({
        ...p,
        properties: overlayArgsOntoParams(p.properties || [], childArgs),
      });
    } else {
      const { matchType, value, criteria, judgeModel } = parseArgMatch(rawVal);
      const isNull = matchType === "exact" && value === null;
      merged.push({
        ...p,
        matchType,
        criteria,
        judgeModel,
        isNull,
        value:
          matchType === "llm_judge" || isNull
            ? ""
            : expectedValueToString(value),
      });
    }
  }

  for (const [name, v] of Object.entries(args)) {
    if (schemaNames.has(name)) continue;
    merged.push(customParamFromArg(name, v));
  }

  return merged;
};

// Pure tree helpers keyed by a path of param ids.
const updateExpParamAtPath = (
  params: ExpectedParam[],
  path: string[],
  fn: (p: ExpectedParam) => ExpectedParam,
): ExpectedParam[] => {
  if (path.length === 0) return params;
  const [head, ...rest] = path;
  return params.map((p) => {
    if (p.id !== head) return p;
    if (rest.length === 0) return fn(p);
    return {
      ...p,
      properties: updateExpParamAtPath(p.properties || [], rest, fn),
    };
  });
};

const removeExpParamAtPath = (
  params: ExpectedParam[],
  path: string[],
): ExpectedParam[] => {
  if (path.length === 0) return params;
  const [head, ...rest] = path;
  if (rest.length === 0) return params.filter((p) => p.id !== head);
  return params.map((p) =>
    p.id === head
      ? { ...p, properties: removeExpParamAtPath(p.properties || [], rest) }
      : p,
  );
};

const addExpParamAtPath = (
  params: ExpectedParam[],
  parentPath: string[],
  newParam: ExpectedParam,
): ExpectedParam[] => {
  if (parentPath.length === 0) return [...params, newParam];
  const [head, ...rest] = parentPath;
  return params.map((p) =>
    p.id === head
      ? {
          ...p,
          properties: addExpParamAtPath(p.properties || [], rest, newParam),
        }
      : p,
  );
};

// Convert the expected-parameter tree into the `arguments` object sent to the
// backend. Objects recurse into a nested container; leaf rows are always emitted
// as an explicit match spec — `{ match_type: "exact", value }` or
// `{ match_type: "llm_judge", criteria, judge_model? }` — never a bare literal.
// Empty optional/custom rows are skipped; exact values are parsed as JSON when
// possible so numbers/booleans/objects round-trip.
const buildArgsFromExpectedParams = (
  params: ExpectedParam[],
): Record<string, any> => {
  const obj: Record<string, any> = {};
  for (const p of params) {
    const name = p.name.trim();
    if (!name) continue;
    if (p.isObject) {
      obj[name] = buildArgsFromExpectedParams(p.properties || []);
    } else if (p.matchType === "llm_judge") {
      if (!p.criteria.trim() && !p.required) continue;
      const spec: Record<string, any> = {
        match_type: "llm_judge",
        criteria: p.criteria.trim(),
      };
      if (p.judgeModel?.trim()) spec.judge_model = p.judgeModel.trim();
      obj[name] = spec;
    } else if (p.isNull) {
      // Explicit null assertion — always emitted, even for optional params.
      obj[name] = { match_type: "exact", value: null };
    } else {
      if (!p.value.trim() && !p.required) continue;
      obj[name] = {
        match_type: "exact",
        value: coerceExpectedValue(p.value, p.dataType),
      };
    }
  }
  return obj;
};

// True when any row is incomplete: a kept schema param missing its value, or a
// half-filled custom row. Fully-blank custom rows are ignored (treated as not
// yet used) so a freshly-added row doesn't hard-block until touched.
const hasInvalidExpectedParams = (params: ExpectedParam[]): boolean => {
  for (const p of params) {
    if (p.isObject) {
      if (hasInvalidExpectedParams(p.properties || [])) return true;
      continue;
    }
    const named = p.name.trim();
    // The required/filled field depends on the match strategy: criteria for an
    // LLM judge, the expected value otherwise. A null assertion always counts
    // as filled.
    const filled =
      p.matchType === "llm_judge"
        ? p.criteria.trim()
        : p.isNull
          ? "null"
          : p.value.trim();
    if (p.custom) {
      // A fully-blank custom row is ignored (not yet used).
      if (!named && !filled) continue;
      if (!named || !filled) return true;
    } else if (!filled) {
      return true;
    }
    // A filled-in exact value must also be well-formed for its type.
    if (
      p.matchType !== "llm_judge" &&
      !p.isNull &&
      expectedValueTypeError(p.value, p.dataType)
    )
      return true;
  }
  return false;
};

export type TestConfig = {
  history: Array<{
    role: "assistant" | "user" | "tool";
    content?: string;
    tool_calls?: Array<{
      id: string;
      function: {
        name: string;
        arguments: string;
      };
      type: "function";
    }>;
    tool_call_id?: string;
    /** Optional per-turn timestamp. Round-tripped opaquely through the
     * dialog so bulk-uploaded labelling items don't lose timestamps when
     * edited. The dialog never asks the user to set this. */
    created_at?: string;
  }>;
  evaluation: {
    type: "tool_call" | "response" | "conversation";
    tool_calls?: Array<{
      tool: string;
      arguments: Record<string, any>;
      is_called?: boolean;
      accept_any_arguments?: boolean;
    }>;
    criteria?: string;
  };
};

// Evaluator type for the conversation tab — picker is filtered to this.
const CONVERSATION_EVALUATOR_TYPE = "conversation";

type TestTab = "next-reply" | "tool-invocation" | "conversation";

// The three selectable test types, shared by the create-phase intro picker
// (large cards) and the compact in-dialog type switcher (top-left boxes) so
// both surfaces stay in sync. `label` is the short box label; `title` is the
// full heading; `description` is the one-liner shown on the intro cards.
const TEST_TYPE_OPTIONS: Array<{
  tab: TestTab;
  label: string;
  title: string;
  description: string;
}> = [
  {
    tab: "next-reply",
    label: "Next reply",
    title: "Next reply test",
    description: "Evaluate the agent's response given a conversation history",
  },
  {
    tab: "tool-invocation",
    label: "Tool call",
    title: "Tool call test",
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

export type EvaluatorVariableDef = {
  name: string;
  description?: string;
  default?: string;
};

// Hydrated evaluator row as returned by GET /tests/{uuid}.evaluators[]
// (`uuid` is the evaluator's id; we expose it as `evaluator_uuid` to match the
// write-side EvaluatorRef shape on POST/PUT bodies)
export type AttachedEvaluatorInit = {
  evaluator_uuid: string;
  name: string;
  description?: string | null;
  slug: string | null;
  variables: EvaluatorVariableDef[];
  variable_values?: Record<string, string> | null;
};

export type EvaluatorRefPayload = {
  evaluator_uuid: string;
  variable_values?: Record<string, string>;
};

// The default LLM "Correctness" evaluator. Identified by a stable backend slug.
const DEFAULT_NEXT_REPLY_EVALUATOR_SLUG = "default-llm-next-reply";

type AttachedEvaluator = {
  evaluator_uuid: string;
  name: string;
  description?: string;
  slug: string | null;
  variables: EvaluatorVariableDef[];
  variable_values: Record<string, string>;
};

type LLMEvaluatorOption = {
  uuid: string;
  name: string;
  description?: string;
  slug: string | null;
  owner_user_id: string | null;
  variables: EvaluatorVariableDef[];
  /** "llm" for next-reply tab, "conversation" for conversation tab. */
  evaluator_type?: string;
};

type AddTestDialogProps = {
  isOpen: boolean;
  onClose: () => void;
  isEditing: boolean;
  isLoading: boolean;
  isCreating: boolean;
  createError: string | null;
  /** Duplicate-name 409 message rendered inline next to the name input. */
  nameError?: string | null;
  testName: string;
  setTestName: (name: string) => void;
  /**
   * Optional free-form description for a labelling item. Shown only when
   * `mode === "labelItem"` (LLM / simulation item creation & edit).
   */
  itemDescription?: string;
  setItemDescription?: (description: string) => void;
  validationAttempted: boolean;
  onSubmit: (config: TestConfig, evaluators: EvaluatorRefPayload[]) => void;
  initialTab?: "next-reply" | "tool-invocation" | "conversation";
  initialConfig?: TestConfig;
  initialEvaluators?: AttachedEvaluatorInit[];
  /**
   * "test" (default) — original behaviour with Next reply / Tool invocation
   * tabs and "Test" labels.
   * "labelItem" — used by the human-alignment task page. Hides the tabs
   * (always next-reply view), and rewords any user-visible "Test" copy to
   * "Item". The caller is responsible for hooking onSubmit up to the
   * labelling-items API.
   */
  mode?: "test" | "labelItem";
  /**
   * If true, the last message in the conversation is allowed to be from the
   * agent (or a tool call). Used for simulation labelling items, where the
   * conversation is a static transcript rather than a prompt awaiting a reply.
   */
  allowAgentLastMessage?: boolean;
  /**
   * If true, REQUIRE the last message to be from the agent (assistant).
   * Used for LLM labelling items, where the trailing assistant turn is the
   * `agent_response` being judged. Takes precedence over `allowAgentLastMessage`.
   */
  requireAssistantLastMessage?: boolean;
};

export function AddTestDialog({
  isOpen,
  onClose,
  isEditing,
  isLoading,
  isCreating,
  createError,
  nameError,
  testName,
  setTestName,
  itemDescription,
  setItemDescription,
  validationAttempted,
  onSubmit,
  initialTab,
  initialConfig,
  initialEvaluators,
  mode = "test",
  allowAgentLastMessage = false,
  requireAssistantLastMessage = false,
}: AddTestDialogProps) {
  // Hide the floating "Talk to Us" button when this dialog is open
  useHideFloatingButton(isOpen);

  const isLabelItem = mode === "labelItem";
  const itemNoun = isLabelItem ? "item" : "test";
  const ItemNoun = isLabelItem ? "Item" : "Test";

  const backendAccessToken = useAccessToken();
  const [activeTab, setActiveTab] = useState<TestTab>(
    isLabelItem ? "next-reply" : initialTab || "next-reply",
  );
  // Tabs that pair the conversation history with attached evaluators (vs. the
  // tool-invocation tab, which uses a tool picker instead). Used to gate the
  // shared evaluator-related UI and validation paths below.
  const isEvaluatorTab =
    activeTab === "next-reply" || activeTab === "conversation";

  // Two-phase create flow: when creating a brand-new test we first show a
  // centred type picker (the same three boxes as the bulk-upload modal),
  // then animate into the full editor. Editing (type is immutable),
  // labelItem mode, and duplicating (the type is inherited via `initialTab`)
  // all skip the intro entirely. `typeChosen` gates which phase renders;
  // `editorEntered` drives the entrance transition once chosen.
  const showTypeIntroFlow = !isLabelItem && !isEditing && !initialTab;
  const [typeChosen, setTypeChosen] = useState<boolean>(!showTypeIntroFlow);
  const [editorEntered, setEditorEntered] =
    useState<boolean>(!showTypeIntroFlow);

  // Reset the phase whenever the dialog (re)opens so a fresh create always
  // starts on the picker and an edit always lands straight in the editor.
  useEffect(() => {
    if (!isOpen) return;
    const skipIntro = isLabelItem || isEditing || !!initialTab;
    setTypeChosen(skipIntro);
    setEditorEntered(skipIntro);
  }, [isOpen, isLabelItem, isEditing, initialTab]);

  // Drive the editor's scale/opacity entrance on the frame after the type is
  // chosen, so the swap from the intro picker reads as an animation.
  useEffect(() => {
    if (!typeChosen) {
      setEditorEntered(false);
      return;
    }
    if (editorEntered) return;
    const raf = requestAnimationFrame(() => setEditorEntered(true));
    return () => cancelAnimationFrame(raf);
  }, [typeChosen, editorEntered]);

  // Pick a type from the intro picker and slide into the full editor.
  const chooseTestType = (tab: TestTab) => {
    setActiveTab(tab);
    setTypeChosen(true);
  };

  // Available tools state - declared early so it's available for initialConfig parsing
  const [availableTools, setAvailableTools] = useState<AvailableTool[]>([]);
  const [availableToolsLoading, setAvailableToolsLoading] = useState(false);

  // Update active tab when initialTab changes (when opening an existing test)
  useEffect(() => {
    if (initialTab) {
      setActiveTab(initialTab);
    }
  }, [initialTab]);

  // Track if tools have been fetched (even if the result is empty)
  const [toolsFetched, setToolsFetched] = useState(false);

  // Populate fields from initialConfig when editing an existing test
  // Wait for tools fetch to complete so we can properly determine tool types
  useEffect(() => {
    if (initialConfig && toolsFetched) {
      // Parse history and convert to chatMessages format
      if (initialConfig.history && initialConfig.history.length > 0) {
        const messages: Array<{
          id: string;
          role: "agent" | "user" | "tool_call" | "tool_response";
          content: string;
          toolName?: string;
          toolId?: string;
          toolParams?: Array<{ name: string; value: string; group?: string }>;
          isWebhook?: boolean;
          linkedToolCallId?: string;
          createdAt?: string;
        }> = [];

        // Helper to format value - stringify objects/arrays for display
        const formatValue = (val: any): string => {
          if (val === null) return "null";
          if (val === undefined) return "";
          if (typeof val === "object") {
            try {
              return JSON.stringify(val, null, 2);
            } catch {
              return String(val);
            }
          }
          return String(val);
        };

        // Track tool call IDs for linking tool responses
        const toolCallIds: string[] = [];

        initialConfig.history.forEach((historyItem, index) => {
          const createdAt =
            typeof historyItem.created_at === "string"
              ? historyItem.created_at
              : undefined;
          if (historyItem.role === "assistant") {
            if (historyItem.tool_calls && historyItem.tool_calls.length > 0) {
              // This is a tool call message
              const toolCall = historyItem.tool_calls[0];
              let parsedArgs: Record<string, any> = {};
              try {
                parsedArgs = JSON.parse(toolCall.function.arguments);
              } catch {
                parsedArgs = {};
              }

              const toolCallId = toolCall.id || `tool-${index}`;
              toolCallIds.push(toolCallId);

              // Look up the tool by name to check its actual config type
              const tool = availableTools.find(
                (t) => t.name === toolCall.function.name,
              );
              const isWebhook = tool?.config?.type === "webhook";

              let toolParams: Array<{
                name: string;
                value: string;
                group?: string;
              }> = [];

              if (isWebhook) {
                // Extract params from body, query with their group (headers are not shown in UI)
                const webhookKeys = ["body", "query"];
                webhookKeys.forEach((groupKey) => {
                  const groupValue = parsedArgs[groupKey];
                  if (
                    groupValue &&
                    typeof groupValue === "object" &&
                    !Array.isArray(groupValue)
                  ) {
                    Object.entries(groupValue).forEach(
                      ([paramName, paramValue]) => {
                        toolParams.push({
                          name: paramName,
                          value: formatValue(paramValue),
                          group: groupKey,
                        });
                      },
                    );
                  }
                });
              } else {
                // Regular tool params (non-webhook)
                toolParams = Object.entries(parsedArgs).map(
                  ([name, value]) => ({
                    name,
                    value: formatValue(value),
                  }),
                );
              }

              messages.push({
                id: toolCallId,
                role: "tool_call",
                content: "",
                toolId: toolCall.id,
                toolName: toolCall.function.name,
                toolParams,
                isWebhook,
                ...(createdAt ? { createdAt } : {}),
              });
            } else {
              // Regular assistant message
              messages.push({
                id: `msg-${index}`,
                role: "agent",
                content: historyItem.content || "",
                ...(createdAt ? { createdAt } : {}),
              });
            }
          } else if (historyItem.role === "user") {
            messages.push({
              id: `msg-${index}`,
              role: "user",
              content: historyItem.content || "",
              ...(createdAt ? { createdAt } : {}),
            });
          } else if (historyItem.role === "tool" && historyItem.content) {
            // Tool response message - link to the tool call
            const linkedToolCallId =
              historyItem.tool_call_id ||
              toolCallIds[toolCallIds.length - 1] ||
              "";
            // Find the linked tool call to get its name
            const linkedToolCall = messages.find(
              (m) =>
                m.role === "tool_call" &&
                (m.toolId === linkedToolCallId || m.id === linkedToolCallId),
            );
            messages.push({
              id: `tool-response-${index}`,
              role: "tool_response",
              content: historyItem.content,
              linkedToolCallId,
              toolName: linkedToolCall?.toolName || "",
              ...(createdAt ? { createdAt } : {}),
            });
          }
        });

        if (messages.length > 0) {
          setChatMessages(messages);
        }
      }

      // Populate evaluation fields. Note: response-type tests no longer keep a
      // free-text `criteria` on the config — the value lives in the attached
      // correctness evaluator's `variable_values.criteria` (handled separately
      // in the attached-evaluators initialization effect below).
      if (initialConfig.evaluation) {
        if (initialConfig.evaluation.type === "tool_call") {
          const toolCalls = initialConfig.evaluation.tool_calls;

          // Check if tool_calls is empty array
          if (!toolCalls || toolCalls.length === 0) {
            setSelectedTools([]);
          } else {
            // Populate all tool calls
            const tools: SelectedToolConfig[] = toolCalls.map((toolCall) => {
              const expectation: "should-call" | "should-not-call" =
                toolCall.is_called === false
                  ? "should-not-call"
                  : "should-call";
              const acceptAny = toolCall.accept_any_arguments === true;

              // Check if this is an inbuilt tool by matching tool id or name
              const inbuiltTool = INBUILT_TOOLS.find(
                (t) => t.id === toolCall.tool || t.name === toolCall.tool,
              );
              const matchedTool = availableTools.find(
                (t) => t.uuid === toolCall.tool || t.name === toolCall.tool,
              );
              const savedArgs =
                toolCall.arguments &&
                typeof toolCall.arguments === "object" &&
                !Array.isArray(toolCall.arguments)
                  ? toolCall.arguments
                  : {};

              // Reconstruct the expected-parameter tree. When the tool's
              // schema is available we overlay saved values onto it so we
              // recover required/optional flags and nesting; otherwise we
              // rebuild flat custom rows straight from the saved arguments.
              let expectedParameters: ExpectedParam[] = [];
              let allowCustomParameters = false;
              if (!acceptAny) {
                if (matchedTool && !inbuiltTool) {
                  const { params, allowCustom } =
                    buildExpectedParamsFromToolConfig(matchedTool.config);
                  allowCustomParameters = allowCustom;
                  expectedParameters = overlayArgsOntoParams(params, savedArgs);
                } else {
                  expectedParameters = argsToCustomParams(savedArgs);
                  allowCustomParameters = !inbuiltTool;
                }
              }

              return {
                id: inbuiltTool ? inbuiltTool.id : toolCall.tool,
                name: inbuiltTool ? inbuiltTool.name : toolCall.tool,
                expectation,
                acceptAnyParameterValues: acceptAny,
                isInbuilt: !!inbuiltTool,
                allowCustomParameters,
                expectedParameters,
              };
            });
            setSelectedTools(tools);
          }
        }
      }
    }
  }, [initialConfig, toolsFetched, availableTools]);

  const [selectedTools, setSelectedTools] = useState<SelectedToolConfig[]>([]);

  // Evaluators attached to this test (next-reply tab only).
  const [attachedEvaluators, setAttachedEvaluators] = useState<
    AttachedEvaluator[]
  >([]);
  // Tracks whether the initial population (from initialEvaluators / legacy
  // criteria / default-correctness auto-attach) has run. Without this we'd
  // re-stomp the user's edits every time props update.
  const [attachedEvaluatorsInitialized, setAttachedEvaluatorsInitialized] =
    useState(false);
  // All available LLM evaluators (defaults + user-owned), used by the picker
  // and for resolving the default-correctness evaluator on init.
  const [availableLLMEvaluators, setAvailableLLMEvaluators] = useState<
    LLMEvaluatorOption[]
  >([]);
  const [evaluatorsLoading, setEvaluatorsLoading] = useState(false);
  const [evaluatorsFetched, setEvaluatorsFetched] = useState(false);
  const [evaluatorPickerOpen, setEvaluatorPickerOpen] = useState(false);
  const [evaluatorPickerSearch, setEvaluatorPickerSearch] = useState("");

  const [localValidationAttempted, setLocalValidationAttempted] =
    useState(false);
  // Dialog-level message for failed tool-call validation (e.g. an unset boolean
  // or an incomplete parameter). Shown in the footer; cleared on each attempt.
  const [toolValidationError, setToolValidationError] = useState<string | null>(
    null,
  );
  const [toolDropdownOpen, setToolDropdownOpen] = useState(false);
  // Collapsed object-parameter rows (keyed by the param's unique id). Objects
  // default to expanded; the user can fold them to tame deeply nested schemas.
  const [collapsedParamIds, setCollapsedParamIds] = useState<Set<string>>(
    new Set(),
  );
  const toggleParamCollapsed = (paramId: string) =>
    setCollapsedParamIds((prev) => {
      const next = new Set(prev);
      if (next.has(paramId)) next.delete(paramId);
      else next.add(paramId);
      return next;
    });
  const [chatMessages, setChatMessages] = useState<
    Array<{
      id: string;
      role: "agent" | "user" | "tool_call" | "tool_response";
      content: string;
      toolName?: string;
      toolId?: string;
      toolParams?: Array<{ name: string; value: string; group?: string }>;
      isWebhook?: boolean;
      linkedToolCallId?: string; // For tool_response to link back to tool_call
      createdAt?: string;
    }>
  >(() => {
    const u = (id: string) => ({
      id,
      role: "user" as const,
      content: "",
    });
    const a = (id: string) => ({
      id,
      role: "agent" as const,
      content: "",
    });
    if (requireAssistantLastMessage) {
      // LLM task add-item: conversation must end with the agent's reply,
      // since that's the message being graded.
      return [u("1"), a("2")];
    }
    if (allowAgentLastMessage) {
      // Simulation add-item: a short but complete conversation transcript
      // (any role can be last).
      return [u("1"), a("2"), u("3"), a("4"), u("5"), a("6")];
    }
    // Default test (next-reply AND conversation): user → agent → user. The
    // final user turn is what the agent will reply to when the test runs —
    // conversation tests also generate the agent's next reply live, then
    // judge the full conversation, so they must end on a user turn too.
    return [u("1"), a("2"), u("3")];
  });

  const [pendingFocusId, setPendingFocusId] = useState<string | null>(null);

  const addChatMessage = (role: "agent" | "user") => {
    const id = Date.now().toString();
    setChatMessages([...chatMessages, { id, role, content: "" }]);
    setPendingFocusId(id);
  };

  const addToolCallMessage = (
    toolId: string,
    toolName: string,
    params: Array<{ name: string; value: string; group?: string }>,
    isWebhook: boolean = false,
  ) => {
    const toolCallId = Date.now().toString();
    const newMessages: typeof chatMessages = [
      ...chatMessages,
      {
        id: toolCallId,
        role: "tool_call",
        content: "",
        toolId,
        toolName,
        toolParams: params,
        isWebhook,
      },
    ];

    // If it's a webhook tool, automatically add a tool response message after it
    if (isWebhook) {
      newMessages.push({
        id: (Date.now() + 1).toString(),
        role: "tool_response",
        content: '{\n  "status": "success",\n  "response": {}\n}',
        linkedToolCallId: toolCallId,
        toolName,
      });
    }

    setChatMessages(newMessages);
    setToolCallDropdownOpen(false);
    setPendingToolCall(null);
    if (params.length > 0) {
      setPendingFocusId(toolCallId);
    }
  };

  const updateChatMessage = (id: string, content: string) => {
    setChatMessages(
      chatMessages.map((msg) => (msg.id === id ? { ...msg, content } : msg)),
    );
  };

  const updateToolCallParam = (
    messageId: string,
    paramName: string,
    value: string,
    group?: string,
  ) => {
    setChatMessages(
      chatMessages.map((msg) =>
        msg.id === messageId && msg.toolParams
          ? {
              ...msg,
              toolParams: msg.toolParams.map((p) =>
                p.name === paramName && p.group === group ? { ...p, value } : p,
              ),
            }
          : msg,
      ),
    );
  };

  const removeChatMessage = (id: string) => {
    const messageToRemove = chatMessages.find((msg) => msg.id === id);

    // If removing a tool_call that's a webhook, also remove its linked tool_response
    if (messageToRemove?.role === "tool_call" && messageToRemove?.isWebhook) {
      setChatMessages(
        chatMessages.filter(
          (msg) => msg.id !== id && msg.linkedToolCallId !== id,
        ),
      );
    } else {
      setChatMessages(chatMessages.filter((msg) => msg.id !== id));
    }
  };

  const [addMessageDropdownOpen, setAddMessageDropdownOpen] = useState(false);
  const [toolCallDropdownOpen, setToolCallDropdownOpen] = useState(false);
  const [pendingToolCall, setPendingToolCall] = useState<{
    toolId: string;
    toolName: string;
    params: Array<{ name: string; value: string }>;
  } | null>(null);
  const [showCloseConfirmation, setShowCloseConfirmation] = useState(false);

  const chatEndRef = useRef<HTMLDivElement>(null);

  // The tool-call dropdown is anchored to the "Add message" button but its
  // panel is rendered in a portal with fixed positioning so it escapes the
  // scrollable chat container's clipping (otherwise it hides beneath the
  // dialog's sticky header). Track the trigger's viewport rect to place it.
  const toolCallAnchorRef = useRef<HTMLDivElement>(null);
  const [toolCallAnchorRect, setToolCallAnchorRect] = useState<{
    left: number;
    right: number;
    top: number;
    bottom: number;
  } | null>(null);

  useLayoutEffect(() => {
    if (!toolCallDropdownOpen) return;
    const update = () => {
      const el = toolCallAnchorRef.current;
      if (!el) return;
      const r = el.getBoundingClientRect();
      setToolCallAnchorRect({
        left: r.left,
        right: r.right,
        top: r.top,
        bottom: r.bottom,
      });
    };
    update();
    window.addEventListener("scroll", update, true);
    window.addEventListener("resize", update);
    return () => {
      window.removeEventListener("scroll", update, true);
      window.removeEventListener("resize", update);
    };
  }, [toolCallDropdownOpen]);

  // Scroll to bottom when new messages are added
  useEffect(() => {
    if (chatMessages.length > 0) {
      chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
    }
  }, [chatMessages.length]);

  // After a new chat message is added, focus its textarea so the user
  // can start typing immediately. For a tool call, focus the first
  // param input instead. We pass preventScroll so the browser doesn't
  // bring the input into view at the top of the visible area — that
  // would push the trailing + / delete buttons off-screen. Instead we
  // explicitly scroll the chat sentinel into view so the action row
  // below the new bubble stays visible.
  useEffect(() => {
    if (!pendingFocusId) return;
    let focused: HTMLElement | null = null;
    const textArea = document.querySelector(
      `textarea[data-msg-id="${pendingFocusId}"]`,
    );
    if (textArea instanceof HTMLTextAreaElement) {
      focused = textArea;
    } else {
      const firstParam = document.querySelector(
        `input[data-tool-call-id="${pendingFocusId}"]`,
      );
      if (firstParam instanceof HTMLInputElement) focused = firstParam;
    }
    if (!focused) return;
    focused.focus({ preventScroll: true });
    chatEndRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
    setPendingFocusId(null);
  }, [pendingFocusId, chatMessages]);

  // Stable ref callback for auto-resizing textareas on mount. Inline
  // ref callbacks re-run on every parent re-render (toggling unrelated
  // state like the add-message dropdown), which would reset every
  // textarea's height to `auto` and back, causing the scroll container
  // to thrash and jump to the top. A useCallback-memoised callback
  // only runs on actual mount.
  const autoSizeOnMount = useCallback((el: HTMLTextAreaElement | null) => {
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${el.scrollHeight}px`;
  }, []);

  // Fetch available tools when dialog opens
  useEffect(() => {
    const fetchTools = async () => {
      if (!isOpen || !backendAccessToken) return;

      try {
        setAvailableToolsLoading(true);
        const backendUrl = process.env.NEXT_PUBLIC_BACKEND_URL;
        if (!backendUrl) {
          throw new Error("BACKEND_URL environment variable is not set");
        }

        const response = await fetch(`${backendUrl}/tools`, {
          method: "GET",
          headers: getDefaultHeaders(backendAccessToken),
        });

        if (response.status === 401) {
          await signOut({ callbackUrl: "/login" });
          return;
        }

        if (!response.ok) {
          throw new Error("Failed to fetch tools");
        }

        const data: AvailableTool[] = await response.json();
        setAvailableTools(data);
      } catch (err) {
        console.error("Error fetching tools:", err);
      } finally {
        setAvailableToolsLoading(false);
        setToolsFetched(true);
      }
    };

    fetchTools();
  }, [isOpen, backendAccessToken]);

  // Fetch available LLM evaluators (defaults + user-owned) when dialog opens.
  // Used both for the "Add evaluator" picker and to resolve the default
  // correctness evaluator on initial population.
  useEffect(() => {
    const fetchLLMEvaluators = async () => {
      if (!isOpen || !backendAccessToken) return;

      try {
        setEvaluatorsLoading(true);
        const backendUrl = process.env.NEXT_PUBLIC_BACKEND_URL;
        if (!backendUrl) {
          throw new Error("BACKEND_URL environment variable is not set");
        }

        const response = await fetch(
          `${backendUrl}/evaluators?include_defaults=true`,
          {
            method: "GET",
            headers: getDefaultHeaders(backendAccessToken),
          },
        );

        if (response.status === 401) {
          await signOut({ callbackUrl: "/login" });
          return;
        }

        if (!response.ok) {
          throw new Error("Failed to fetch evaluators");
        }

        const raw: Array<{
          uuid: string;
          name: string;
          description?: string;
          slug: string | null;
          owner_user_id: string | null;
          evaluator_type?: string;
          live_version?: { variables?: EvaluatorVariableDef[] | null } | null;
        }> = await response.json();

        const llm: LLMEvaluatorOption[] = raw
          .filter(
            (e) =>
              e.evaluator_type === "llm" ||
              e.evaluator_type === CONVERSATION_EVALUATOR_TYPE,
          )
          .map((e) => ({
            uuid: e.uuid,
            name: e.name,
            description: e.description,
            slug: e.slug,
            owner_user_id: e.owner_user_id,
            evaluator_type: e.evaluator_type,
            variables: Array.isArray(e.live_version?.variables)
              ? (e.live_version!.variables as EvaluatorVariableDef[])
              : [],
          }));
        setAvailableLLMEvaluators(llm);
      } catch (err) {
        console.error("Error fetching evaluators:", err);
      } finally {
        setEvaluatorsLoading(false);
        setEvaluatorsFetched(true);
      }
    };

    fetchLLMEvaluators();
  }, [isOpen, backendAccessToken]);

  // Build initial variable_values for a freshly-attached evaluator: prefer
  // explicit values, then variable defaults, then empty string.
  const buildInitialVariableValues = (
    variables: EvaluatorVariableDef[],
    explicit?: Record<string, string> | null,
  ): Record<string, string> => {
    const values: Record<string, string> = {};
    for (const v of variables) {
      if (explicit && typeof explicit[v.name] === "string") {
        values[v.name] = explicit[v.name];
      } else if (typeof v.default === "string") {
        values[v.name] = v.default;
      } else {
        values[v.name] = "";
      }
    }
    return values;
  };

  // Initialize attached evaluators once props + evaluator list have settled.
  // Three cases:
  //   1. Edit with hydrated evaluators[] → use as-is.
  //   2. Edit on a legacy test (no evaluators[] but config.evaluation.criteria
  //      is a string) → auto-attach default-correctness with that criteria
  //      pre-filled into its `criteria` variable.
  //   3. New test → auto-attach default-correctness with empty values.
  // Re-runs only until initialized; the user's subsequent edits are preserved.
  useEffect(() => {
    if (attachedEvaluatorsInitialized) return;
    if (!evaluatorsFetched) return;
    // For edit, also wait for the parent's GET to finish so initialConfig /
    // initialEvaluators are settled.
    if (isEditing && isLoading) return;

    if (initialEvaluators && initialEvaluators.length > 0) {
      setAttachedEvaluators(
        initialEvaluators.map((e) => ({
          evaluator_uuid: e.evaluator_uuid,
          name: e.name,
          description: e.description ?? undefined,
          slug: e.slug,
          variables: e.variables ?? [],
          variable_values: buildInitialVariableValues(
            e.variables ?? [],
            e.variable_values ?? undefined,
          ),
        })),
      );
      setAttachedEvaluatorsInitialized(true);
      return;
    }

    const correctness = availableLLMEvaluators.find(
      (e) => e.slug === DEFAULT_NEXT_REPLY_EVALUATOR_SLUG,
    );

    // Legacy edit/duplicate: pre-fill criteria from the old free-text field.
    // Guarded by the presence of criteria text, so it only fires for tests
    // that actually carry it (never for a from-scratch create).
    if (
      initialConfig?.evaluation?.type === "response" &&
      typeof initialConfig.evaluation.criteria === "string" &&
      initialConfig.evaluation.criteria.length > 0 &&
      correctness
    ) {
      setAttachedEvaluators([
        {
          evaluator_uuid: correctness.uuid,
          name: correctness.name,
          description: correctness.description,
          slug: correctness.slug,
          variables: correctness.variables,
          variable_values: buildInitialVariableValues(correctness.variables, {
            criteria: initialConfig.evaluation.criteria,
          }),
        },
      ]);
      setAttachedEvaluatorsInitialized(true);
      return;
    }

    // New test (or edit with no usable initial state): auto-attach default
    // correctness only on the next-reply tab. Tool-invocation tests are
    // unchanged and don't carry evaluators today.
    if (!isEditing && activeTab === "next-reply" && correctness) {
      setAttachedEvaluators([
        {
          evaluator_uuid: correctness.uuid,
          name: correctness.name,
          description: correctness.description,
          slug: correctness.slug,
          variables: correctness.variables,
          variable_values: buildInitialVariableValues(correctness.variables),
        },
      ]);
      setAttachedEvaluatorsInitialized(true);
      return;
    }

    // Nothing to attach; mark initialized so manual adds can proceed.
    setAttachedEvaluatorsInitialized(true);
  }, [
    attachedEvaluatorsInitialized,
    evaluatorsFetched,
    availableLLMEvaluators,
    initialEvaluators,
    initialConfig,
    isEditing,
    isLoading,
    activeTab,
  ]);

  // Create-mode only: when the user switches between the evaluator-based
  // tabs (next-reply ↔ conversation), drop every attached evaluator that
  // doesn't belong to the newly selected type. This removes the auto-seeded
  // next-reply "Correctness" evaluator (an `llm` evaluator) when moving to
  // the conversation tab — conversation tests only accept `simulation`
  // evaluators, and the backend rejects a mismatch — and symmetrically
  // clears any simulation evaluators when moving back. Editing is left
  // untouched (the type is immutable there). Only fires on an actual tab
  // change, so the next-reply default seeded on first load survives.
  const prevTabRef = useRef(activeTab);
  useEffect(() => {
    const prev = prevTabRef.current;
    prevTabRef.current = activeTab;
    if (prev === activeTab) return;
    if (isEditing) return;
    if (!isEvaluatorTab) return;
    const wantedType =
      activeTab === "conversation" ? CONVERSATION_EVALUATOR_TYPE : "llm";
    setAttachedEvaluators((prevAttached) =>
      prevAttached.filter(
        (e) =>
          availableLLMEvaluators.find((o) => o.uuid === e.evaluator_uuid)
            ?.evaluator_type === wantedType,
      ),
    );
  }, [activeTab, isEditing, isEvaluatorTab, availableLLMEvaluators]);

  const updateEvaluatorVariableValue = (
    evaluatorUuid: string,
    variableName: string,
    value: string,
  ) => {
    setAttachedEvaluators((prev) =>
      prev.map((e) =>
        e.evaluator_uuid === evaluatorUuid
          ? {
              ...e,
              variable_values: { ...e.variable_values, [variableName]: value },
            }
          : e,
      ),
    );
  };

  const removeAttachedEvaluator = (evaluatorUuid: string) => {
    setAttachedEvaluators((prev) =>
      prev.filter((e) => e.evaluator_uuid !== evaluatorUuid),
    );
  };

  const closeEvaluatorPicker = () => {
    setEvaluatorPickerOpen(false);
    setEvaluatorPickerSearch("");
  };

  const attachEvaluatorFromOption = (option: LLMEvaluatorOption) => {
    setAttachedEvaluators((prev) => {
      if (prev.some((e) => e.evaluator_uuid === option.uuid)) return prev;
      return [
        ...prev,
        {
          evaluator_uuid: option.uuid,
          name: option.name,
          description: option.description,
          slug: option.slug,
          variables: option.variables,
          variable_values: buildInitialVariableValues(option.variables),
        },
      ];
    });
    closeEvaluatorPicker();
  };

  const addToolFromSelection = (tool: AvailableTool) => {
    // Webhook tools default to "accept any arguments".
    const isWebhook = tool.config?.type === "webhook";
    const { params, allowCustom } = buildExpectedParamsFromToolConfig(
      tool.config,
    );

    const newTool: SelectedToolConfig = {
      id: tool.uuid,
      name: tool.name,
      expectation: "should-call",
      acceptAnyParameterValues: isWebhook,
      isInbuilt: false,
      allowCustomParameters: allowCustom,
      expectedParameters: params,
    };

    setSelectedTools([...selectedTools, newTool]);
    setToolDropdownOpen(false);
  };

  const selectInbuiltTool = (toolId: string, toolName: string) => {
    const newTool: SelectedToolConfig = {
      id: toolId,
      name: toolName,
      expectation: "should-call",
      acceptAnyParameterValues: false,
      isInbuilt: true,
      allowCustomParameters: false,
      expectedParameters: [],
    };
    setSelectedTools([...selectedTools, newTool]);
    setToolDropdownOpen(false);
  };

  const removeTool = (toolId: string) => {
    setSelectedTools(selectedTools.filter((t) => t.id !== toolId));
  };

  // Rebuild the expected-parameter tree for a selected tool from its schema.
  const getExpectedParamsForTool = (toolId: string, toolName: string) => {
    const tool = availableTools.find(
      (t) => t.uuid === toolId || t.name === toolName,
    );
    return buildExpectedParamsFromToolConfig(tool?.config);
  };

  // Update a specific tool's configuration
  const updateToolConfig = (
    toolId: string,
    updates: Partial<SelectedToolConfig>,
  ) => {
    setSelectedTools(
      selectedTools.map((tool) => {
        if (tool.id !== toolId) return tool;

        const updatedTool = { ...tool, ...updates };

        // If toggling acceptAnyParameterValues off, repopulate parameters
        if (
          updates.acceptAnyParameterValues === false &&
          tool.acceptAnyParameterValues === true
        ) {
          updatedTool.expectedParameters = getExpectedParamsForTool(
            tool.id,
            tool.name,
          ).params;
        }

        // If changing to should-call and params are empty and acceptAny is off
        if (
          updates.expectation === "should-call" &&
          tool.expectation !== "should-call" &&
          !updatedTool.acceptAnyParameterValues &&
          updatedTool.expectedParameters.length === 0
        ) {
          updatedTool.expectedParameters = getExpectedParamsForTool(
            tool.id,
            tool.name,
          ).params;
        }

        return updatedTool;
      }),
    );
  };

  // Apply a pure transform to a tool's expected-parameter tree.
  const mutateToolParams = (
    toolId: string,
    fn: (params: ExpectedParam[]) => ExpectedParam[],
  ) => {
    setSelectedTools((prev) =>
      prev.map((tool) =>
        tool.id === toolId
          ? { ...tool, expectedParameters: fn(tool.expectedParameters) }
          : tool,
      ),
    );
  };

  // Update an expected parameter's value (by path of param ids).
  const updateExpectedParamValue = (
    toolId: string,
    path: string[],
    value: string,
  ) =>
    mutateToolParams(toolId, (params) =>
      updateExpParamAtPath(params, path, (p) => ({ ...p, value })),
    );

  // Update a custom expected parameter's name.
  const updateExpectedParamName = (
    toolId: string,
    path: string[],
    name: string,
  ) =>
    mutateToolParams(toolId, (params) =>
      updateExpParamAtPath(params, path, (p) => ({ ...p, name })),
    );

  // Switch a leaf parameter's match mode: exact value, LLM-judge, or null.
  // "null" is modelled as an exact match with the `isNull` flag set; switching
  // into it clears any typed value so the disabled field doesn't show stale
  // text.
  const updateExpectedParamMatchMode = (
    toolId: string,
    path: string[],
    mode: MatchMode,
  ) =>
    mutateToolParams(toolId, (params) =>
      updateExpParamAtPath(params, path, (p) => ({
        ...p,
        matchType: mode === "llm_judge" ? "llm_judge" : "exact",
        isNull: mode === "null",
        value: mode === "null" ? "" : p.value,
      })),
    );

  // Update an LLM-judged parameter's criteria text.
  const updateExpectedParamCriteria = (
    toolId: string,
    path: string[],
    criteria: string,
  ) =>
    mutateToolParams(toolId, (params) =>
      updateExpParamAtPath(params, path, (p) => ({ ...p, criteria })),
    );

  // Update a custom expected parameter's data type, re-deriving the object/
  // nested-keys flags so switching to/from `object` behaves correctly.
  const updateExpectedParamType = (
    toolId: string,
    path: string[],
    dataType: string,
  ) =>
    mutateToolParams(toolId, (params) =>
      updateExpParamAtPath(params, path, (p) => {
        const isObject = dataType === "object";
        // Booleans can only be true/false — default to "true" so there's always
        // a valid selection. Objects clear their (now meaningless) value, and
        // leaving boolean for another type clears the leftover true/false.
        const value = isObject
          ? ""
          : dataType === "boolean"
            ? p.value === "true" || p.value === "false"
              ? p.value
              : "true"
            : p.dataType === "boolean"
              ? ""
              : p.value;
        // Booleans and objects are always exact-matched, so drop any LLM-judge
        // selection (and its criteria) when switching to those types.
        const matchType =
          isObject || dataType === "boolean" ? "exact" : p.matchType;
        return {
          ...p,
          dataType,
          isObject,
          allowCustomKeys: isObject,
          properties: isObject ? p.properties || [] : undefined,
          value,
          matchType,
          criteria: matchType === "exact" ? "" : p.criteria,
          // Objects are containers and can't carry a null assertion.
          isNull: isObject ? false : p.isNull,
        };
      }),
    );

  // Remove an optional / custom expected parameter.
  const removeExpectedParam = (toolId: string, path: string[]) =>
    mutateToolParams(toolId, (params) => removeExpParamAtPath(params, path));

  // Add a blank custom expected parameter under the given parent (root = []).
  const addCustomExpectedParam = (toolId: string, parentPath: string[]) =>
    mutateToolParams(toolId, (params) =>
      addExpParamAtPath(params, parentPath, makeCustomParam("string")),
    );

  // Check if a tool declares any parameters in its config.
  const toolHasParams = (toolId: string, toolName: string) => {
    const tool = availableTools.find(
      (t) => t.uuid === toolId || t.name === toolName,
    );
    return readToolParameters(tool?.config).length > 0;
  };

  // Small "Required" / "Optional" pill shown next to each parameter row.
  const renderRequiredBadge = (required: boolean) => (
    <span
      className={`text-[11px] leading-none px-2 py-1 rounded-full border ${
        required
          ? "border-border bg-background text-muted-foreground"
          : "border-border bg-muted text-muted-foreground"
      }`}
    >
      {required ? "Required" : "Optional"}
    </span>
  );

  // Data-type picker for custom (user-added) parameter rows. Mirrors the type
  // options offered in the add-tool dialog.
  const renderParamTypeSelect = (
    toolId: string,
    path: string[],
    dataType: string,
  ) => (
    <div className="relative flex-shrink-0">
      <select
        value={dataType}
        onChange={(e) => updateExpectedParamType(toolId, path, e.target.value)}
        aria-label="Parameter type"
        className="h-7 pl-2.5 pr-6 rounded-lg text-xs bg-background text-foreground border border-border focus:outline-none focus:ring-2 focus:ring-accent cursor-pointer appearance-none capitalize"
      >
        {EXPECTED_PARAM_TYPES.map((t) => (
          <option key={t} value={t} className="capitalize">
            {t}
          </option>
        ))}
      </select>
      <div className="absolute inset-y-0 right-0 flex items-center pr-1.5 pointer-events-none">
        <svg
          className="w-3 h-3 text-muted-foreground"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          strokeWidth={2}
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M19.5 8.25l-7.5 7.5-7.5-7.5"
          />
        </svg>
      </div>
    </div>
  );

  // Match-mode picker shown beside each leaf parameter's value: "Is exactly"
  // compares the literal value, "satisfies the criteria" judges the actual
  // value against an LLM (non-boolean only), and "Is null" asserts the value is
  // null. Styled in the inverted (foreground) palette to set it apart from the
  // value / criteria field beside it.
  const renderMatchTypeSelect = (
    toolId: string,
    path: string[],
    mode: MatchMode,
    allowLlm: boolean,
  ) => (
    <div className="relative flex-shrink-0">
      <select
        value={mode}
        onChange={(e) =>
          updateExpectedParamMatchMode(toolId, path, e.target.value as MatchMode)
        }
        aria-label="Match mode"
        className="h-10 pl-3 pr-8 rounded-lg text-sm font-medium bg-foreground text-background border border-transparent hover:opacity-90 focus:outline-none focus:ring-2 focus:ring-accent cursor-pointer appearance-none transition-opacity"
      >
        <option value="exact">Is exactly</option>
        {allowLlm && (
          <option value="llm_judge">satisfies the criteria</option>
        )}
        <option value="null">Is null</option>
      </select>
      <div className="absolute inset-y-0 right-0 flex items-center pr-2 pointer-events-none">
        <svg
          className="w-4 h-4 text-background"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          strokeWidth={2}
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M19.5 8.25l-7.5 7.5-7.5-7.5"
          />
        </svg>
      </div>
    </div>
  );

  // Small trash button for removing optional / custom parameter rows.
  const renderRemoveParamButton = (toolId: string, path: string[]) => (
    <button
      onClick={() => removeExpectedParam(toolId, path)}
      aria-label="Remove parameter"
      className="w-8 h-8 flex-shrink-0 flex items-center justify-center rounded-lg text-muted-foreground hover:text-foreground hover:bg-accent transition-colors cursor-pointer"
    >
      <svg
        className="w-4 h-4"
        fill="none"
        viewBox="0 0 24 24"
        stroke="currentColor"
        strokeWidth={2}
      >
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          d="M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 01-2.244 2.077H8.084a2.25 2.25 0 01-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 00-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 013.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 00-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 00-7.5 0"
        />
      </svg>
    </button>
  );

  // Render "+ name" chips for schema-declared optional parameters that the user
  // removed at this level, letting them add the parameter (and its subtree)
  // back. `schemaLevelParams` is the full set declared at this level; anything
  // not currently present must be a removed optional (required ones can't be
  // removed).
  const renderAddBackChips = (
    toolId: string,
    parentPath: string[],
    schemaLevelParams: ExpectedParam[],
    currentParams: ExpectedParam[],
  ): React.ReactNode => {
    const currentNames = new Set(currentParams.map((p) => p.name));
    const missing = schemaLevelParams.filter((s) => !currentNames.has(s.name));
    if (missing.length === 0) return null;
    return (
      <div className="flex flex-wrap items-center gap-2">
        {missing.map((s) => (
          <button
            key={s.name}
            type="button"
            onClick={() =>
              mutateToolParams(toolId, (params) =>
                addExpParamAtPath(params, parentPath, cloneExpParamFresh(s)),
              )
            }
            className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium border border-dashed border-border bg-background text-muted-foreground hover:text-foreground hover:border-foreground transition-colors cursor-pointer"
          >
            <span className="text-sm leading-none">+</span>
            {s.name}
          </button>
        ))}
      </div>
    );
  };

  // Recursively render a tool's expected-parameter rows. `object` params render
  // a nested section (with an "Add parameter" affordance when they accept
  // arbitrary keys); leaf params render a name + expected-value input.
  // `schemaLevelParams` carries the tool's declared parameters for the current
  // level so removed optional ones can be offered for re-adding.
  const renderExpectedParams = (
    toolId: string,
    params: ExpectedParam[],
    path: string[],
    schemaLevelParams: ExpectedParam[],
  ): React.ReactNode =>
    params.map((param) => {
      const paramPath = [...path, param.id];
      const showErrors =
        localValidationAttempted && activeTab === "tool-invocation";

      // The "filled in" field for a leaf depends on its match strategy: the
      // judging criteria for an LLM judge, the expected value otherwise. A null
      // assertion always counts as filled.
      const leafFilled =
        param.matchType === "llm_judge"
          ? !!param.criteria.trim()
          : param.isNull || !!param.value.trim();

      // Header: a label for declared params, or — for custom (user-added) rows —
      // a type-picker / badge / remove row with the name input on its own line
      // below. The match-type picker lives on the value row.
      const nameError =
        showErrors && param.custom && leafFilled && !param.name.trim();
      const nameInput = (
        <input
          type="text"
          value={param.name}
          onChange={(e) =>
            updateExpectedParamName(toolId, paramPath, e.target.value)
          }
          placeholder="Parameter name"
          className={`w-full h-9 px-3 rounded-lg text-sm bg-background text-foreground placeholder:text-muted-foreground border focus:outline-none focus:ring-2 focus:ring-accent ${
            nameError ? "border-red-500" : "border-border"
          }`}
        />
      );
      const header = param.custom ? (
        <div className="space-y-2">
          <div className="flex items-center gap-2">
            {renderParamTypeSelect(toolId, paramPath, param.dataType)}
            <div className="flex-1" />
            {renderRequiredBadge(param.required)}
            {!param.required && renderRemoveParamButton(toolId, paramPath)}
          </div>
          {nameInput}
        </div>
      ) : (
        <div className="flex items-center gap-2">
          <span className="flex-1 text-sm font-medium text-foreground">
            {param.name}
          </span>
          {renderRequiredBadge(param.required)}
          {!param.required && renderRemoveParamButton(toolId, paramPath)}
        </div>
      );

      if (param.isObject) {
        const children = param.properties || [];
        const collapsed = collapsedParamIds.has(param.id);
        const childCount = children.length;
        // Schema-declared properties for this object (empty for custom objects),
        // used to offer removed optional sub-params for re-adding.
        const schemaNode = schemaLevelParams.find(
          (s) => !s.custom && s.name === param.name,
        );
        const childSchemaParams = schemaNode?.properties || [];
        const collapseToggle = (
          <button
            type="button"
            onClick={() => toggleParamCollapsed(param.id)}
            aria-label={collapsed ? "Expand parameter" : "Collapse parameter"}
            aria-expanded={!collapsed}
            className="flex-shrink-0 inline-flex items-center justify-center px-2 py-1 rounded-md border border-transparent bg-foreground text-background hover:opacity-90 transition-opacity cursor-pointer"
          >
            <svg
              className="w-3 h-3"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={2.5}
            >
              {collapsed ? (
                // chevron down (click to expand)
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M19.5 8.25l-7.5 7.5-7.5-7.5"
                />
              ) : (
                // chevron up (click to collapse)
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M4.5 15.75l7.5-7.5 7.5 7.5"
                />
              )}
            </svg>
          </button>
        );
        return (
          <div
            key={param.id}
            className="bg-background border border-border rounded-xl p-4 space-y-2"
          >
            {param.custom ? (
              // Custom object row: controls on top, name input on its own line.
              <>
                <div className="flex items-center gap-2">
                  {renderParamTypeSelect(toolId, paramPath, param.dataType)}
                  <div className="flex-1" />
                  {collapseToggle}
                  {renderRequiredBadge(param.required)}
                  {!param.required && renderRemoveParamButton(toolId, paramPath)}
                </div>
                <input
                  type="text"
                  value={param.name}
                  onChange={(e) =>
                    updateExpectedParamName(toolId, paramPath, e.target.value)
                  }
                  placeholder="Parameter name"
                  className="w-full h-9 px-3 rounded-lg text-sm bg-background text-foreground placeholder:text-muted-foreground border border-border focus:outline-none focus:ring-2 focus:ring-accent"
                />
              </>
            ) : (
              <div className="flex items-center gap-2">
                <span className="flex-1 text-sm font-medium text-foreground">
                  {param.name}
                </span>
                {collapseToggle}
                {renderRequiredBadge(param.required)}
                {!param.required && renderRemoveParamButton(toolId, paramPath)}
              </div>
            )}
            {collapsed ? (
              <p className="text-xs text-muted-foreground">
                {childCount > 0
                  ? `${childCount} parameter${childCount === 1 ? "" : "s"} hidden`
                  : param.allowCustomKeys
                    ? "No parameters added"
                    : "No parameters"}
              </p>
            ) : (
              <NestedContainer
                showAddButton={param.allowCustomKeys}
                addButtonText="Add parameter"
                onAddProperty={() => addCustomExpectedParam(toolId, paramPath)}
              >
                {children.length > 0 && (
                  <div className="space-y-3">
                    {renderExpectedParams(
                      toolId,
                      children,
                      paramPath,
                      childSchemaParams,
                    )}
                  </div>
                )}
                {renderAddBackChips(
                  toolId,
                  paramPath,
                  childSchemaParams,
                  children,
                )}
                {children.length === 0 &&
                  !param.allowCustomKeys &&
                  childSchemaParams.length === children.length && (
                    <p className="text-xs text-muted-foreground text-center">
                      This object has no parameters.
                    </p>
                  )}
              </NestedContainer>
            )}
          </div>
        );
      }

      // For LLM-judged rows the criteria box replaces the value box. The field
      // is "missing" when empty but required (or a kept named row); a value is
      // "malformed" when present but wrong for its type (e.g. non-numeric); a
      // boolean is "unset" when it holds neither true nor false.
      const isLlm = param.matchType === "llm_judge";
      const isNull = !isLlm && !!param.isNull;
      const mode: MatchMode = isLlm ? "llm_judge" : isNull ? "null" : "exact";
      const typeError =
        !isLlm &&
        !isNull &&
        expectedValueTypeError(param.value, param.dataType);
      const booleanUnset =
        !isNull &&
        param.dataType === "boolean" &&
        param.value !== "true" &&
        param.value !== "false";
      const missingValue =
        !leafFilled &&
        (param.required || (!param.custom ? true : !!param.name.trim()));
      const valueError = showErrors && (missingValue || typeError || booleanUnset);
      const fieldClass = `w-full h-10 px-4 rounded-lg text-sm bg-background text-foreground placeholder:text-muted-foreground border focus:outline-none focus:ring-2 focus:ring-accent disabled:opacity-50 disabled:cursor-not-allowed ${
        valueError ? "border-red-500" : "border-border"
      }`;
      return (
        <div
          key={param.id}
          className="bg-background border border-border rounded-xl p-4 space-y-1.5"
        >
          {header}
          {param.dataType === "boolean" ? (
            // Booleans match exactly (yes/no) or assert null — no LLM judging.
            <div className="flex items-center gap-2">
              {renderMatchTypeSelect(toolId, paramPath, mode, false)}
              {isNull ? (
                <input
                  type="text"
                  value="null"
                  disabled
                  readOnly
                  className={`${fieldClass} flex-1 min-w-0`}
                />
              ) : (
                <div className="relative flex-1 min-w-0">
                  <select
                    value={booleanUnset ? "" : param.value}
                    onChange={(e) =>
                      updateExpectedParamValue(toolId, paramPath, e.target.value)
                    }
                    className={`${fieldClass} pr-10 cursor-pointer appearance-none`}
                  >
                    {/* Hidden placeholder so an unset boolean renders blank
                      without adding a selectable "Select…" entry to the list. */}
                    <option value="" disabled hidden></option>
                    <option value="true">true</option>
                    <option value="false">false</option>
                  </select>
                  <div className="absolute inset-y-0 right-0 flex items-center pr-3 pointer-events-none">
                    <svg
                      className="w-4 h-4 text-muted-foreground"
                      fill="none"
                      viewBox="0 0 24 24"
                      stroke="currentColor"
                      strokeWidth={2}
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        d="M19.5 8.25l-7.5 7.5-7.5-7.5"
                      />
                    </svg>
                  </div>
                </div>
              )}
            </div>
          ) : (
            // Match-mode picker sits inline with the expected value / criteria.
            <div className="flex items-start gap-2">
              {renderMatchTypeSelect(toolId, paramPath, mode, true)}
              {isLlm ? (
                // LLM judge — describe what a correct value looks like.
                <input
                  type="text"
                  value={param.criteria}
                  onChange={(e) =>
                    updateExpectedParamCriteria(
                      toolId,
                      paramPath,
                      e.target.value,
                    )
                  }
                  placeholder="e.g. A friendly reminder with the date"
                  className={`${fieldClass} flex-1 min-w-0`}
                />
              ) : isNull ? (
                <input
                  type="text"
                  value="null"
                  disabled
                  readOnly
                  className={`${fieldClass} flex-1 min-w-0`}
                />
              ) : (
                <input
                  type="text"
                  value={param.value}
                  onChange={(e) =>
                    updateExpectedParamValue(toolId, paramPath, e.target.value)
                  }
                  placeholder={
                    param.dataType === "array"
                      ? 'Expected value, e.g. ["a", "b"]'
                      : param.dataType === "integer" ||
                          param.dataType === "number"
                        ? "Expected number"
                        : "Expected value"
                  }
                  className={`${fieldClass} flex-1 min-w-0`}
                />
              )}
            </div>
          )}
          {showErrors && isLlm && missingValue && (
            <p className="text-xs text-red-500">Enter judging criteria.</p>
          )}
          {showErrors && booleanUnset && (
            <p className="text-xs text-red-500">Select true or false.</p>
          )}
          {showErrors && typeError && (
            <p className="text-xs text-red-500">
              Enter a valid {param.dataType === "integer" ? "integer" : "number"}
              .
            </p>
          )}
        </div>
      );
    });

  // Generate a UUID for tool calls
  const generateUUID = () => {
    return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
      const r = (Math.random() * 16) | 0;
      const v = c === "x" ? r : (r & 0x3) | 0x8;
      return v.toString(16);
    });
  };

  // Build the config object for API submission
  const buildConfig = (): TestConfig => {
    const history: TestConfig["history"] = [];

    // Convert chat messages to the API format
    for (const message of chatMessages) {
      const ts = message.createdAt ? { created_at: message.createdAt } : {};
      if (message.role === "agent") {
        history.push({
          role: "assistant",
          content: message.content,
          ...ts,
        });
      } else if (message.role === "user") {
        history.push({
          role: "user",
          content: message.content,
          ...ts,
        });
      } else if (message.role === "tool_call") {
        // Generate a unique ID for this tool call
        const toolCallId = generateUUID();

        // Build the arguments object from tool params
        const argsObj: Record<string, any> = {};
        if (message.toolParams) {
          for (const param of message.toolParams) {
            // For webhook tools, group params by their group (query, body)
            // Note: Headers are not shown in conversation history UI
            if (message.isWebhook && param.group) {
              if (param.group === "body") {
                if (!argsObj.body) argsObj.body = {};
                argsObj.body[param.name] = param.value;
              } else if (param.group === "query") {
                if (!argsObj.query) argsObj.query = {};
                argsObj.query[param.name] = param.value;
              }
            } else {
              argsObj[param.name] = param.value;
            }
          }
        }

        // Add the assistant message with tool_calls
        history.push({
          role: "assistant",
          tool_calls: [
            {
              id: toolCallId,
              function: {
                name: message.toolName || "",
                arguments: JSON.stringify(argsObj),
              },
              type: "function",
            },
          ],
          ...ts,
        });

        // For webhook tools, find the linked tool_response message and add it to history
        // For non-webhook tools, don't add any tool response
        if (message.isWebhook) {
          const linkedResponse = chatMessages.find(
            (m) =>
              m.role === "tool_response" && m.linkedToolCallId === message.id,
          );
          if (linkedResponse && linkedResponse.content) {
            history.push({
              role: "tool",
              content: linkedResponse.content,
              tool_call_id: toolCallId,
              ...(linkedResponse.createdAt
                ? { created_at: linkedResponse.createdAt }
                : {}),
            });
          }
        }
      }
      // Skip tool_response messages as they're handled with their linked tool_call
    }

    // Build the evaluation object based on the active tab
    let evaluation: TestConfig["evaluation"];

    if (activeTab === "tool-invocation") {
      if (selectedTools.length > 0) {
        // Build tool_calls array from all selected tools. The "should not
        // have been called" expectation is intentionally suppressed for now
        // — every selected tool is treated as `should-call` regardless of
        // any pre-existing `expectation` value loaded from the backend, so
        // the API always receives a positive should-call payload.
        const toolCalls = selectedTools.map((tool) => {
          const toolIdentifier = tool.isInbuilt ? tool.id : tool.name;

          const expectedArgs = tool.acceptAnyParameterValues
            ? {}
            : buildArgsFromExpectedParams(tool.expectedParameters);

          return {
            tool: toolIdentifier,
            arguments: expectedArgs,
            accept_any_arguments: tool.acceptAnyParameterValues,
          };
        });

        evaluation = {
          type: "tool_call",
          tool_calls: toolCalls,
        };
      } else {
        // No tool selected - test that no tool is called
        evaluation = {
          type: "tool_call",
          tool_calls: [],
        };
      }
    } else {
      // Evaluator-based tests (next-reply or conversation). The legacy
      // free-text `criteria` field is no longer sent — the user-supplied
      // criteria now lives on the attached evaluator's `variable_values`
      // (sent separately on the POST/PUT body's `evaluators` array).
      evaluation = {
        type: activeTab === "conversation" ? "conversation" : "response",
      };
    }

    return { history, evaluation };
  };

  // Build the EvaluatorRef[] payload sent alongside `config` on POST/PUT
  // /tests. Relevant for both next-reply and conversation tests. We omit
  // `variable_values` entirely when the evaluator has no variables to keep
  // the payload lean.
  const buildEvaluatorsPayload = (): EvaluatorRefPayload[] => {
    if (!isEvaluatorTab) return [];
    return attachedEvaluators.map((e) => {
      const ref: EvaluatorRefPayload = { evaluator_uuid: e.evaluator_uuid };
      if (e.variables.length > 0) {
        ref.variable_values = { ...e.variable_values };
      }
      return ref;
    });
  };

  // Returns true if any attached evaluator has at least one variable whose
  // value is empty (after trim). Used to gate the Save button.
  const hasUnfilledEvaluatorVariables = () => {
    if (!isEvaluatorTab) return false;
    for (const e of attachedEvaluators) {
      for (const v of e.variables) {
        const value = e.variable_values[v.name];
        if (typeof value !== "string" || value.trim().length === 0) {
          return true;
        }
      }
    }
    return false;
  };

  // Helper to check if tool call messages have empty params
  const hasEmptyToolCallParams = () => {
    const toolCallMessages = chatMessages.filter((m) => m.role === "tool_call");
    for (const msg of toolCallMessages) {
      if (msg.toolParams && msg.toolParams.length > 0) {
        const hasEmpty = msg.toolParams.some((p) => !p.value.trim());
        if (hasEmpty) return true;
      }
    }
    return false;
  };

  // Handle form submission
  const handleSubmit = () => {
    setLocalValidationAttempted(true);
    setToolValidationError(null);

    // Auto-hide validation errors after 3 seconds
    setTimeout(() => {
      setLocalValidationAttempted(false);
      setToolValidationError(null);
    }, 3000);

    // Validate tool call params in conversation history (for both test types)
    if (hasEmptyToolCallParams()) {
      return; // Don't submit if any tool call has empty params
    }

    // Every user/agent message must have non-empty content.
    const hasEmptyChatMessage = chatMessages.some(
      (m) => (m.role === "user" || m.role === "agent") && !m.content.trim(),
    );
    if (hasEmptyChatMessage) {
      return;
    }

    // Validate required fields based on test type
    if (isEvaluatorTab) {
      if (!testName.trim()) {
        return; // Don't submit if validation fails
      }
      // At least one evaluator and every variable on every attached evaluator
      // must have a non-empty value.
      if (attachedEvaluators.length === 0) {
        return;
      }
      if (hasUnfilledEvaluatorVariables()) {
        return;
      }
      // Validate that all tool_response messages have valid JSON
      const toolResponses = chatMessages.filter(
        (m) => m.role === "tool_response",
      );
      for (const response of toolResponses) {
        try {
          JSON.parse(response.content);
        } catch {
          return; // Don't submit if any tool response has invalid JSON
        }
      }
    } else {
      // tool-invocation - name and at least one tool are required
      if (!testName.trim() || selectedTools.length === 0) {
        return;
      }
      // For each tool that should be called with specific params, every kept
      // parameter (required ones, plus any optional/custom rows the user filled
      // in) must be complete.
      for (const tool of selectedTools) {
        if (
          tool.expectation === "should-call" &&
          !tool.acceptAnyParameterValues &&
          hasInvalidExpectedParams(tool.expectedParameters)
        ) {
          setToolValidationError(
            "Please complete every highlighted parameter — booleans need true or false, and numbers must be valid.",
          );
          return;
        }
      }
      // Validate that all tool_response messages have valid JSON
      const toolResponses = chatMessages.filter(
        (m) => m.role === "tool_response",
      );
      for (const response of toolResponses) {
        try {
          JSON.parse(response.content);
        } catch {
          return; // Don't submit if any tool response has invalid JSON
        }
      }
    }

    const config = buildConfig();
    const evaluators = buildEvaluatorsPayload();
    onSubmit(config, evaluators);
  };

  const handleBackdropClick = () => {
    setShowCloseConfirmation(true);
  };

  const handleConfirmClose = () => {
    setShowCloseConfirmation(false);
    onClose();
  };

  const handleCancelClose = () => {
    setShowCloseConfirmation(false);
  };

  if (!isOpen) return null;

  // During the intro picker nothing has been entered yet, so a backdrop
  // click can close immediately without the "discard changes?" guard.
  const handleBackdropDismiss = typeChosen ? handleBackdropClick : onClose;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/50 backdrop-blur-sm"
        onClick={handleBackdropDismiss}
      />

      {/* Create-phase intro: centred type picker (the same three boxes the
          bulk-upload modal uses). Selecting a box animates into the full
          editor, where a compact version of the same boxes stays in the
          top-left so the type can still be switched while creating. */}
      {!typeChosen && (
        <div className="relative w-full max-w-2xl mx-4 bg-background rounded-2xl shadow-2xl border border-border flex flex-col overflow-hidden animate-in-scale">
          <div className="flex items-center justify-between px-6 py-4 border-b border-border">
            <h2 className="text-lg font-semibold text-foreground">
              Create a test
            </h2>
            <button
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
          <div className="px-6 py-5">
            <label className="block text-sm font-medium text-foreground mb-3">
              Select the type of test
            </label>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              {TEST_TYPE_OPTIONS.map((opt) => (
                <button
                  key={opt.tab}
                  type="button"
                  onClick={() => chooseTestType(opt.tab)}
                  className="text-left px-4 py-3 rounded-lg border border-border bg-background hover:bg-muted/50 hover:border-foreground/40 transition-colors cursor-pointer"
                >
                  <div className="text-sm font-medium mb-0.5 text-foreground">
                    {opt.title}
                  </div>
                  <div className="text-xs leading-snug text-muted-foreground">
                    {opt.description}
                  </div>
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Close Confirmation Dialog */}
      {showCloseConfirmation && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center">
          <div
            className="absolute inset-0 bg-black/30"
            onClick={handleCancelClose}
          />
          <div className="relative bg-background rounded-xl shadow-2xl border border-border p-6 max-w-sm w-full mx-4">
            <h3 className="text-lg font-semibold text-foreground mb-2">
              Discard changes?
            </h3>
            <p className="text-sm text-muted-foreground mb-6">
              You have unsaved changes. Are you sure you want to close this
              dialog? Your changes will be lost.
            </p>
            <div className="flex items-center justify-end gap-3">
              <button
                onClick={handleCancelClose}
                className="h-10 px-4 rounded-lg text-sm font-medium bg-background text-foreground hover:bg-muted transition-colors cursor-pointer border border-border"
              >
                Cancel
              </button>
              <button
                onClick={handleConfirmClose}
                className="h-10 px-4 rounded-lg text-sm font-medium bg-red-500 text-white hover:bg-red-600 transition-colors cursor-pointer"
              >
                Discard
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Dialog */}
      {typeChosen && (
        <div
          className={`relative w-full max-w-[90rem] h-[95vh] md:h-[85vh] mx-2 md:mx-4 bg-background rounded-xl md:rounded-2xl shadow-2xl flex flex-col md:flex-row overflow-hidden border border-border transition-all duration-300 ease-out ${
            editorEntered ? "opacity-100 scale-100" : "opacity-0 scale-95"
          }`}
        >
          {/* Left Column - Form */}
          <div className="w-full md:w-1/2 flex flex-col border-b md:border-b-0 md:border-r border-border">
            {/* Tabs — hidden in labelItem mode (always next-reply). When
              editing an existing test the type is fixed (the backend no
              longer allows changing a test's type), so we show only the
              matching view's label as a static, non-switchable header. */}
            {!isLabelItem &&
              (isEditing ? (
                <div className="flex border-b border-border">
                  <div className="flex-1 py-3 md:py-4 text-sm md:text-base font-medium text-foreground border-b-2 border-foreground text-center">
                    {activeTab === "tool-invocation"
                      ? "Tool call test"
                      : activeTab === "conversation"
                        ? "Conversation test"
                        : "Next reply test"}
                  </div>
                </div>
              ) : (
                // Create phase: the same three boxes from the intro picker,
                // rendered compactly in the top-left so the type can still be
                // switched mid-create.
                <div className="flex gap-2 p-3 border-b border-border">
                  {TEST_TYPE_OPTIONS.map((opt) => (
                    <button
                      key={opt.tab}
                      onClick={() => setActiveTab(opt.tab)}
                      title={opt.title}
                      className={`flex-1 min-w-0 px-2 py-2 rounded-lg border text-xs md:text-sm font-medium transition-colors cursor-pointer truncate ${
                        activeTab === opt.tab
                          ? "bg-foreground text-background border-foreground"
                          : "bg-background border-border text-muted-foreground hover:bg-muted/50 hover:text-foreground"
                      }`}
                    >
                      {opt.label}
                    </button>
                  ))}
                </div>
              ))}

            {/* Content */}
            <div className="flex-1 overflow-y-auto overflow-x-visible p-4 md:p-6">
              {isLoading ? (
                <div className="flex items-center justify-center py-12">
                  <svg
                    className="w-6 h-6 animate-spin text-foreground"
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
                    ></circle>
                    <path
                      className="opacity-75"
                      fill="currentColor"
                      d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                    ></path>
                  </svg>
                </div>
              ) : isEvaluatorTab ? (
                <div className="space-y-6">
                  {/* Name */}
                  <div>
                    <label className="block text-base font-medium text-foreground mb-2">
                      {ItemNoun} name
                    </label>
                    <input
                      type="text"
                      value={testName}
                      onChange={(e) => setTestName(e.target.value)}
                      placeholder={`Your ${itemNoun} name`}
                      className={`w-full h-11 px-4 rounded-lg text-base bg-background text-foreground placeholder:text-muted-foreground border focus:outline-none focus:ring-2 focus:ring-accent ${
                        nameError ||
                        (localValidationAttempted &&
                          isEvaluatorTab &&
                          !testName.trim())
                          ? "border-red-500"
                          : "border-border"
                      }`}
                    />
                    {nameError ? (
                      <p className="text-xs text-red-500 mt-1">{nameError}</p>
                    ) : (
                      localValidationAttempted &&
                      isEvaluatorTab &&
                      !testName.trim() && (
                        <p className="text-xs text-red-500 mt-1">
                          {ItemNoun} name cannot be empty
                        </p>
                      )
                    )}
                  </div>

                  {/* Description (labelling items only) */}
                  {isLabelItem && setItemDescription && (
                    <div>
                      <label className="block text-base font-medium text-foreground mb-2">
                        Description
                      </label>
                      <textarea
                        value={itemDescription ?? ""}
                        onChange={(e) => setItemDescription(e.target.value)}
                        placeholder="Optional — what is this item about? Shown to annotators alongside the evaluators."
                        rows={3}
                        className="w-full px-4 py-2.5 rounded-lg text-base bg-background text-foreground placeholder:text-muted-foreground border border-border focus:outline-none focus:ring-2 focus:ring-accent resize-y"
                      />
                    </div>
                  )}

                  {/* Evaluators (next-reply tab only) */}
                  <div className="relative">
                    <div className="flex items-center justify-between mb-2">
                      <label className="text-base font-medium text-foreground">
                        Evaluators
                      </label>
                      {!isLabelItem &&
                        (() => {
                          const remainingOptions =
                            availableLLMEvaluators.filter(
                              (o) =>
                                !attachedEvaluators.some(
                                  (a) => a.evaluator_uuid === o.uuid,
                                ) &&
                                (activeTab === "conversation"
                                  ? o.evaluator_type ===
                                    CONVERSATION_EVALUATOR_TYPE
                                  : o.evaluator_type === "llm"),
                            );
                          const noOptionsLeft = remainingOptions.length === 0;
                          return (
                            <button
                              onClick={() => {
                                if (evaluatorPickerOpen) {
                                  closeEvaluatorPicker();
                                } else {
                                  setEvaluatorPickerOpen(true);
                                }
                              }}
                              disabled={
                                evaluatorsLoading || isLoading || noOptionsLeft
                              }
                              // Tinted violet so the action stands out from
                              // the neutral form chrome around it. Validation
                              // error state overrides border/text to red.
                              className={`px-3 py-1.5 text-sm font-medium rounded-lg border cursor-pointer transition-colors disabled:opacity-50 disabled:cursor-not-allowed bg-violet-500/12 border-violet-500/45 text-violet-950 dark:text-violet-100 hover:bg-violet-500/22 dark:hover:bg-violet-500/18 ${
                                localValidationAttempted &&
                                isEvaluatorTab &&
                                attachedEvaluators.length === 0
                                  ? "!border-red-500 !text-red-500 !bg-red-500/10"
                                  : ""
                              }`}
                            >
                              Add evaluator
                            </button>
                          );
                        })()}
                    </div>

                    {/* Evaluator picker dropdown */}
                    {evaluatorPickerOpen && (
                      <>
                        <div
                          className="fixed inset-0 z-[99]"
                          onClick={closeEvaluatorPicker}
                        />
                        <div className="absolute right-0 top-9 mt-1 w-80 max-h-80 flex flex-col bg-background border border-border rounded-xl shadow-2xl z-[100] overflow-hidden">
                          {/* Sticky search bar */}
                          <div className="p-2 border-b border-border bg-background">
                            <input
                              type="text"
                              value={evaluatorPickerSearch}
                              onChange={(e) =>
                                setEvaluatorPickerSearch(e.target.value)
                              }
                              placeholder="Search evaluators"
                              autoFocus
                              className="w-full h-9 px-3 rounded-md text-sm bg-background text-foreground placeholder:text-muted-foreground border border-border focus:outline-none focus:ring-1 focus:ring-accent"
                            />
                          </div>
                          <div className="flex-1 overflow-y-auto">
                            {(() => {
                              const remaining = availableLLMEvaluators.filter(
                                (o) =>
                                  !attachedEvaluators.some(
                                    (a) => a.evaluator_uuid === o.uuid,
                                  ) &&
                                  (activeTab === "conversation"
                                    ? o.evaluator_type ===
                                      CONVERSATION_EVALUATOR_TYPE
                                    : o.evaluator_type === "llm"),
                              );
                              if (remaining.length === 0) {
                                return (
                                  <div className="px-4 py-6 text-sm text-muted-foreground text-center">
                                    No more LLM evaluators to add.
                                  </div>
                                );
                              }
                              // Case-insensitive substring match against both
                              // name and description so users can search by
                              // either label or rubric snippet.
                              const query = evaluatorPickerSearch
                                .trim()
                                .toLowerCase();
                              const matches = query
                                ? remaining.filter((o) => {
                                    const name = o.name.toLowerCase();
                                    const desc = (
                                      o.description ?? ""
                                    ).toLowerCase();
                                    return (
                                      name.includes(query) ||
                                      desc.includes(query)
                                    );
                                  })
                                : remaining;
                              if (matches.length === 0) {
                                return (
                                  <div className="px-4 py-6 text-sm text-muted-foreground text-center">
                                    No evaluators match &ldquo;
                                    {evaluatorPickerSearch}&rdquo;.
                                  </div>
                                );
                              }
                              const defaults = matches.filter(
                                (o) => o.owner_user_id === null,
                              );
                              const mine = matches.filter(
                                (o) => o.owner_user_id !== null,
                              );
                              const renderRow = (o: LLMEvaluatorOption) => (
                                <button
                                  key={o.uuid}
                                  onClick={() => attachEvaluatorFromOption(o)}
                                  className="w-full text-left px-4 py-2.5 hover:bg-muted transition-colors cursor-pointer"
                                >
                                  <div className="text-sm font-medium text-foreground">
                                    {o.name}
                                  </div>
                                  {o.description && (
                                    <div className="text-xs text-muted-foreground line-clamp-2 mt-0.5">
                                      {o.description}
                                    </div>
                                  )}
                                </button>
                              );
                              return (
                                <>
                                  {defaults.length > 0 && (
                                    <div>
                                      <div className="px-4 pt-3 pb-1 text-[11px] uppercase tracking-wide text-muted-foreground">
                                        Default
                                      </div>
                                      {defaults.map(renderRow)}
                                    </div>
                                  )}
                                  {mine.length > 0 && (
                                    <div>
                                      <div className="px-4 pt-3 pb-1 text-[11px] uppercase tracking-wide text-muted-foreground">
                                        My evaluators
                                      </div>
                                      {mine.map(renderRow)}
                                    </div>
                                  )}
                                </>
                              );
                            })()}
                          </div>
                        </div>
                      </>
                    )}

                    {/* Empty / loading state */}
                    {evaluatorsLoading && attachedEvaluators.length === 0 && (
                      <div className="flex items-center gap-2 text-sm text-muted-foreground py-4">
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
                        Loading evaluators
                      </div>
                    )}
                    {!evaluatorsLoading && attachedEvaluators.length === 0 && (
                      <div
                        className={`text-sm py-4 ${
                          localValidationAttempted && isEvaluatorTab
                            ? "text-red-500"
                            : "text-muted-foreground"
                        }`}
                      >
                        {activeTab === "conversation"
                          ? "Add at least one evaluator to grade the full conversation"
                          : "Add at least one evaluator to grade the agent's next reply"}
                      </div>
                    )}

                    {/* Attached evaluator cards */}
                    <div className="space-y-4">
                      {attachedEvaluators.map((ev) => (
                        <div
                          key={ev.evaluator_uuid}
                          className="border border-border rounded-lg p-4 bg-background"
                        >
                          <div className="flex items-start justify-between gap-2 mb-3">
                            <div className="min-w-0 flex-1">
                              <div className="text-sm font-semibold text-foreground">
                                {ev.name}
                              </div>
                              {ev.description && (
                                <div className="text-xs text-muted-foreground mt-0.5 line-clamp-2">
                                  {ev.description}
                                </div>
                              )}
                            </div>
                            {!isLabelItem && (
                              <button
                                onClick={() =>
                                  removeAttachedEvaluator(ev.evaluator_uuid)
                                }
                                className="text-muted-foreground hover:text-red-500 transition-colors cursor-pointer"
                                aria-label={`Remove ${ev.name}`}
                              >
                                <svg
                                  className="w-4 h-4"
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
                            )}
                          </div>

                          {ev.variables.length > 0 && (
                            <div className="space-y-3">
                              {ev.variables.map((v) => {
                                // Uniform rendering for every evaluator variable:
                                // a small `{{name}}` monospace hint + textarea
                                // whose placeholder is the variable's
                                // `description` (falling back to `default`, then
                                // a generic prompt). No special-case label —
                                // the description carries the user-facing copy.
                                const placeholder =
                                  v.description && v.description.length > 0
                                    ? v.description
                                    : v.default && v.default.length > 0
                                      ? v.default
                                      : `Enter value for {{${v.name}}}`;
                                const value = ev.variable_values[v.name] ?? "";
                                const isMissing =
                                  localValidationAttempted &&
                                  isEvaluatorTab &&
                                  value.trim().length === 0;
                                return (
                                  <div key={v.name}>
                                    <div className="text-xs text-muted-foreground mb-1.5">
                                      <code className="font-mono">{`{{${v.name}}}`}</code>
                                    </div>
                                    <textarea
                                      value={value}
                                      onChange={(e) =>
                                        updateEvaluatorVariableValue(
                                          ev.evaluator_uuid,
                                          v.name,
                                          e.target.value,
                                        )
                                      }
                                      placeholder={placeholder}
                                      rows={4}
                                      className={`w-full px-4 py-3 rounded-lg text-base bg-background text-foreground placeholder:text-muted-foreground border focus:outline-none focus:ring-2 focus:ring-accent resize-none ${
                                        isMissing
                                          ? "border-red-500"
                                          : "border-border"
                                      }`}
                                    />
                                    {isMissing && (
                                      <p className="text-xs text-red-500 mt-1">
                                        Value cannot be empty
                                      </p>
                                    )}
                                  </div>
                                );
                              })}
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              ) : (
                <div className="space-y-6">
                  {/* Test Name */}
                  <div>
                    <label className="block text-base font-medium text-foreground mb-2">
                      Test name
                    </label>
                    <input
                      type="text"
                      value={testName}
                      onChange={(e) => setTestName(e.target.value)}
                      placeholder="Your test name"
                      className={`w-full h-11 px-4 rounded-lg text-base bg-background text-foreground placeholder:text-muted-foreground border focus:outline-none focus:ring-2 focus:ring-accent ${
                        nameError ||
                        (localValidationAttempted &&
                          activeTab === "tool-invocation" &&
                          !testName.trim())
                          ? "border-red-500"
                          : "border-border"
                      }`}
                    />
                    {nameError && (
                      <p className="text-xs text-red-500 mt-1">{nameError}</p>
                    )}
                  </div>

                  {/* Tools to test */}
                  <div className="relative">
                    <div className="flex items-center justify-between mb-2">
                      <label className="text-base font-medium text-foreground">
                        Tools to test
                      </label>
                      <button
                        onClick={() => setToolDropdownOpen(!toolDropdownOpen)}
                        className={`px-3 py-1.5 text-sm font-medium bg-background text-foreground rounded-lg hover:bg-muted transition-colors cursor-pointer border ${
                          localValidationAttempted &&
                          activeTab === "tool-invocation" &&
                          selectedTools.length === 0
                            ? "border-red-500 text-red-400"
                            : "border-border"
                        }`}
                      >
                        Add tool
                      </button>
                    </div>

                    {/* Tool Dropdown */}
                    {toolDropdownOpen && (
                      <>
                        <div
                          className="fixed inset-0 z-[99]"
                          onClick={() => {
                            setToolDropdownOpen(false);
                          }}
                        />
                        <div className="absolute right-0 top-8 mt-2 w-72 bg-background border border-border rounded-xl shadow-2xl z-[100] overflow-hidden">
                          <ToolPicker
                            availableTools={availableTools}
                            isLoading={availableToolsLoading}
                            onSelectInbuiltTool={(toolId, toolName) => {
                              selectInbuiltTool(toolId, toolName);
                            }}
                            onSelectCustomTool={(tool) => {
                              addToolFromSelection(tool);
                            }}
                            selectedToolIds={selectedTools.map((t) => t.id)}
                          />
                        </div>
                      </>
                    )}

                    {selectedTools.length === 0 ? (
                      <div className="bg-muted rounded-lg p-8 text-center ">
                        <p className="text-muted-foreground text-sm">
                          Select which tools should be called and the expected
                          parameters. If the agent does not call the right tools
                          or calls them with the wrong parameters, the test will
                          fail.
                        </p>
                      </div>
                    ) : (
                      <div className="space-y-4">
                        {selectedTools.map((tool) => {
                          // Tool's full declared parameters, used to offer
                          // removed optional ones for re-adding.
                          const toolSchemaParams = getExpectedParamsForTool(
                            tool.id,
                            tool.name,
                          ).params;
                          return (
                            <div
                              key={tool.id}
                              className="bg-muted rounded-lg p-4 border border-border"
                            >
                              {/* Tool header with name and delete button */}
                              <div className="flex items-center gap-2 mb-3">
                                <div className="flex-1 h-10 px-4 rounded-lg text-base bg-background text-foreground border border-border flex items-center">
                                  {tool.name}
                                </div>
                                <button
                                  onClick={() => removeTool(tool.id)}
                                  className="w-10 h-10 flex items-center justify-center rounded-lg text-muted-foreground hover:text-foreground hover:bg-accent transition-colors cursor-pointer"
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
                                      d="M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 01-2.244 2.077H8.084a2.25 2.25 0 01-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 00-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 013.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 00-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 00-7.5 0"
                                    />
                                  </svg>
                                </button>
                              </div>

                              {/* Expectation indicator. The "should not have been
                              called" option is intentionally hidden for now
                              and the dialog assumes "should have been called"
                              on every save (see the tool_calls payload
                              builder below). Rendered as a full-width
                              selected-state pill for visual consistency with
                              the rest of the dialog rather than a real
                              segmented control. */}
                              <div
                                className="w-full py-2.5 rounded-lg border border-border bg-foreground text-background text-sm font-medium text-center"
                                aria-label="Expected behaviour"
                              >
                                Should have been called
                              </div>

                              {/* Accept any parameter values checkbox - show when "should call" is selected and tool has parameters */}
                              {tool.expectation === "should-call" &&
                                toolHasParams(tool.id, tool.name) && (
                                  <div className="mt-4 flex items-center gap-3">
                                    <button
                                      onClick={() =>
                                        updateToolConfig(tool.id, {
                                          acceptAnyParameterValues:
                                            !tool.acceptAnyParameterValues,
                                        })
                                      }
                                      className={`w-5 h-5 rounded border-2 flex-shrink-0 flex items-center justify-center transition-colors cursor-pointer ${
                                        tool.acceptAnyParameterValues
                                          ? "bg-foreground border-foreground"
                                          : "bg-background border-muted-foreground hover:border-foreground"
                                      }`}
                                    >
                                      {tool.acceptAnyParameterValues && (
                                        <svg
                                          className="w-3 h-3 text-background"
                                          fill="none"
                                          viewBox="0 0 24 24"
                                          stroke="currentColor"
                                          strokeWidth={3}
                                        >
                                          <path
                                            strokeLinecap="round"
                                            strokeLinejoin="round"
                                            d="M4.5 12.75l6 6 9-13.5"
                                          />
                                        </svg>
                                      )}
                                    </button>
                                    <span className="text-sm font-medium text-foreground">
                                      Accept any values for the parameters
                                    </span>
                                  </div>
                                )}

                              {/* Expected parameters section - only show when
                              "should call" is selected and accept-any is off.
                              Renders for tools with declared parameters and for
                              structured-output tools that allow custom ones. */}
                              {tool.expectation === "should-call" &&
                                !tool.acceptAnyParameterValues &&
                                (tool.expectedParameters.length > 0 ||
                                  tool.allowCustomParameters ||
                                  toolSchemaParams.length > 0) && (
                                  <div className="mt-4">
                                    <div className="mb-3">
                                      <p className="text-xs text-muted-foreground mt-1">
                                        {tool.allowCustomParameters &&
                                        tool.expectedParameters.length === 0
                                          ? "Add the parameter names you expect the agent to extract and their expected values"
                                          : "Configure how each parameter for the tool call should be evaluated"}
                                      </p>
                                    </div>

                                    {tool.expectedParameters.length > 0 && (
                                      <div className="space-y-3">
                                        {renderExpectedParams(
                                          tool.id,
                                          tool.expectedParameters,
                                          [],
                                          toolSchemaParams,
                                        )}
                                      </div>
                                    )}

                                    <div className="mt-3 flex flex-wrap items-center gap-3">
                                      {tool.allowCustomParameters && (
                                        <button
                                          onClick={() =>
                                            addCustomExpectedParam(tool.id, [])
                                          }
                                          className="h-9 px-4 rounded-lg text-sm font-medium bg-background text-foreground border border-border hover:bg-muted transition-colors cursor-pointer"
                                        >
                                          + Add parameter
                                        </button>
                                      )}
                                      {renderAddBackChips(
                                        tool.id,
                                        [],
                                        toolSchemaParams,
                                        tool.expectedParameters,
                                      )}
                                    </div>
                                  </div>
                                )}
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>

            {/* Footer */}
            <div className="px-4 md:px-6 py-3 md:py-4 bg-background">
              {createError && (
                <p className="text-sm text-red-500 mb-3">{createError}</p>
              )}
              {toolValidationError && (
                <p className="text-sm text-red-500 mb-3">
                  {toolValidationError}
                </p>
              )}
              <div className="flex items-center justify-between gap-2">
                <button
                  onClick={onClose}
                  disabled={isCreating || isLoading}
                  className="h-9 md:h-10 px-4 md:px-5 rounded-lg text-sm md:text-base font-medium bg-background text-foreground hover:bg-muted transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed border border-border"
                >
                  Back
                </button>
                {(() => {
                  const lastMessage = chatMessages[chatMessages.length - 1];
                  const isEmpty = chatMessages.length === 0;
                  let isLastMessageInvalid: boolean;
                  if (requireAssistantLastMessage) {
                    isLastMessageInvalid =
                      isEmpty || lastMessage?.role !== "agent";
                  } else if (allowAgentLastMessage) {
                    isLastMessageInvalid = isEmpty;
                  } else {
                    // Next-reply AND conversation tests run the agent against
                    // the trailing user turn, so the history must end on a
                    // user message, not an agent one.
                    isLastMessageInvalid =
                      isEmpty || lastMessage?.role === "agent";
                  }
                  const isLastMessageAgent = isLastMessageInvalid;
                  const tooltipMessage = requireAssistantLastMessage
                    ? `The conversation history should end with an agent message, not a user message`
                    : `The conversation history should end with a user message, not an agent message`;
                  const isButtonDisabled =
                    isCreating || isLoading || isLastMessageInvalid;

                  return (
                    <div className="relative group">
                      <button
                        onClick={handleSubmit}
                        disabled={isButtonDisabled}
                        className="h-9 md:h-10 px-4 md:px-5 rounded-lg text-sm md:text-base font-medium bg-foreground text-background hover:opacity-90 transition-opacity cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
                      >
                        {isCreating ? (
                          <>
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
                              ></circle>
                              <path
                                className="opacity-75"
                                fill="currentColor"
                                d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                              ></path>
                            </svg>
                            {isEditing ? "Saving..." : "Creating..."}
                          </>
                        ) : isEditing ? (
                          "Save"
                        ) : (
                          "Create"
                        )}
                      </button>
                      {/* Tooltip for disabled state */}
                      {isLastMessageAgent && !isCreating && !isLoading && (
                        <div className="absolute bottom-full mb-2 right-0 opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none z-50">
                          <div className="px-3 py-2 text-sm bg-background text-foreground border border-border rounded-lg shadow-lg w-72">
                            {tooltipMessage}
                          </div>
                          {/* Arrow */}
                          <div className="absolute top-full right-4 -mt-1 w-0 h-0 border-l-[6px] border-l-transparent border-r-[6px] border-r-transparent border-t-[6px] border-t-border"></div>
                        </div>
                      )}
                    </div>
                  );
                })()}
              </div>
            </div>
          </div>

          {/* Right Column - Chat Messages */}
          <div className="w-full md:w-1/2 flex flex-col bg-muted/30 overflow-visible">
            {/* Info banner */}
            <div className="px-4 md:px-6 py-3 md:py-4 border-b border-border bg-blue-500/5">
              <div className="flex items-start gap-3">
                <svg
                  className="w-5 h-5 text-blue-600 dark:text-blue-400 mt-0.5 flex-shrink-0"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                  strokeWidth={2}
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M11.25 11.25l.041-.02a.75.75 0 011.063.852l-.708 2.836a.75.75 0 001.063.853l.041-.021M21 12a9 9 0 11-18 0 9 9 0 0118 0zm-9-3.75h.008v.008H12V8.25z"
                  />
                </svg>
                <p className="text-sm text-foreground leading-relaxed">
                  {requireAssistantLastMessage
                    ? "Your evaluators read this whole conversation and evaluate the last agent message (the one highlighted) against the evaluators. Only that final reply is scored."
                    : activeTab === "conversation"
                      ? "Given the conversation history, the agent's response is added to the conversation and the full updated conversation is graded using the evaluators added to the test"
                      : activeTab === "tool-invocation"
                        ? "Given the conversation history, check whether the agent calls the right tools with the expected parameters"
                        : "Given the conversation history, the agent's response is graded using the evaluators added to the test"}
                </p>
              </div>
            </div>
            {/* Chat Messages Area */}
            <div className="flex-1 overflow-y-auto overflow-x-visible p-4 md:p-6">
              {chatMessages.length === 0 ? (
                /* Empty State Placeholder */
                <div className="h-full flex flex-col items-center justify-center text-center px-8">
                  {/* Globe with chat icon */}
                  <div className="mb-6">
                    <svg
                      className="w-24 h-24 text-muted-foreground"
                      viewBox="0 0 100 100"
                      fill="none"
                    >
                      {/* Globe */}
                      <circle
                        cx="45"
                        cy="50"
                        r="30"
                        stroke="currentColor"
                        strokeWidth="2"
                        fill="none"
                      />
                      <ellipse
                        cx="45"
                        cy="50"
                        rx="12"
                        ry="30"
                        stroke="currentColor"
                        strokeWidth="1.5"
                        fill="none"
                      />
                      <path
                        d="M15 50 Q45 35 75 50"
                        stroke="currentColor"
                        strokeWidth="1.5"
                        fill="none"
                      />
                      <path
                        d="M15 50 Q45 65 75 50"
                        stroke="currentColor"
                        strokeWidth="1.5"
                        fill="none"
                      />
                      {/* Chat bubbles */}
                      <circle
                        cx="70"
                        cy="30"
                        r="12"
                        className="fill-muted"
                        stroke="currentColor"
                        strokeWidth="2"
                      />
                      <circle cx="66" cy="30" r="1.5" fill="currentColor" />
                      <circle cx="70" cy="30" r="1.5" fill="currentColor" />
                      <circle cx="74" cy="30" r="1.5" fill="currentColor" />
                      {/* Shadow */}
                      <ellipse
                        cx="45"
                        cy="88"
                        rx="18"
                        ry="4"
                        fill="currentColor"
                        opacity="0.2"
                      />
                    </svg>
                  </div>

                  <h3 className="text-xl font-semibold text-foreground mb-3">
                    No conversation context
                  </h3>

                  <p className="text-muted-foreground text-sm mb-6 max-w-md leading-relaxed">
                    The agent&apos;s response to the last user message will be
                    evaluated against the success criteria using examples
                    provided. Previous messages will be passed as context.
                  </p>

                  <p className="text-muted-foreground text-sm mb-4">
                    Create conversation context starting with
                  </p>

                  {/* Conversation starter buttons. Semantic tint per role so
                    they match the per-row +-menu items below — agent = sky,
                    user = amber. */}
                  <div className="flex items-center gap-3">
                    <button
                      onClick={() => addChatMessage("agent")}
                      className="px-4 py-2.5 rounded-xl border cursor-pointer transition-colors flex items-center gap-2 bg-sky-500/12 border-sky-500/45 text-sky-950 dark:text-sky-100 hover:bg-sky-500/22 dark:hover:bg-sky-500/18"
                    >
                      <svg
                        className="w-5 h-5"
                        fill="none"
                        viewBox="0 0 24 24"
                        stroke="currentColor"
                        strokeWidth={1.5}
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          d="M8.25 3v1.5M4.5 8.25H3m18 0h-1.5M4.5 12H3m18 0h-1.5m-15 3.75H3m18 0h-1.5M8.25 19.5V21M12 3v1.5m0 15V21m3.75-18v1.5m0 15V21m-9-1.5h10.5a2.25 2.25 0 002.25-2.25V6.75a2.25 2.25 0 00-2.25-2.25H6.75A2.25 2.25 0 004.5 6.75v10.5a2.25 2.25 0 002.25 2.25zm.75-12h9v9h-9v-9z"
                        />
                      </svg>
                      <span className="text-sm font-medium">Agent message</span>
                    </button>
                    <button
                      onClick={() => addChatMessage("user")}
                      className="px-4 py-2.5 rounded-xl border cursor-pointer transition-colors flex items-center gap-2 bg-amber-500/12 border-amber-500/45 text-amber-950 dark:text-amber-100 hover:bg-amber-500/22 dark:hover:bg-amber-500/18"
                    >
                      <svg
                        className="w-5 h-5"
                        fill="none"
                        viewBox="0 0 24 24"
                        stroke="currentColor"
                        strokeWidth={1.5}
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          d="M15.75 6a3.75 3.75 0 11-7.5 0 3.75 3.75 0 017.5 0zM4.501 20.118a7.5 7.5 0 0114.998 0A17.933 17.933 0 0112 21.75c-2.676 0-5.216-.584-7.499-1.632z"
                        />
                      </svg>
                      <span className="text-sm font-medium">User message</span>
                    </button>
                  </div>
                </div>
              ) : (
                <div className="space-y-4">
                  {chatMessages.map((message, index) => {
                    const evalTargetIndex =
                      requireAssistantLastMessage &&
                      chatMessages.length > 0 &&
                      chatMessages[chatMessages.length - 1].role === "agent"
                        ? chatMessages.length - 1
                        : -1;
                    const isEvalTarget = index === evalTargetIndex;
                    const lastNonToolResponseIndex =
                      chatMessages.length -
                      1 -
                      (chatMessages[chatMessages.length - 1]?.role ===
                      "tool_response"
                        ? 1
                        : 0);
                    const isLastNonToolResponse =
                      index === lastNonToolResponseIndex;
                    const showInlineDelete =
                      message.role !== "tool_response" &&
                      !isLastNonToolResponse;
                    const turnTimestamp = formatTurnTimestamp(
                      message.createdAt,
                    );
                    return (
                      <div
                        key={message.id}
                        className={`space-y-2 ${
                          message.role === "user"
                            ? "flex flex-col items-end"
                            : ""
                        } ${
                          isEvalTarget
                            ? "border-l-2 border-blue-500 pl-4 -ml-4"
                            : ""
                        }`}
                      >
                        {/* Message Header - show for agent messages and tool calls */}
                        {(message.role === "agent" ||
                          message.role === "tool_call") && (
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="text-sm font-medium text-foreground">
                              {message.role === "tool_call"
                                ? "Agent Tool Call"
                                : "Agent"}
                            </span>
                            {isEvalTarget && (
                              <span className="inline-flex items-center px-2 py-0.5 rounded-md text-[10px] font-medium uppercase tracking-wide bg-blue-500/10 text-blue-600 dark:text-blue-400">
                                Evaluation target
                              </span>
                            )}
                          </div>
                        )}

                        {/* Message Bubble - for agent and user messages */}
                        {(message.role === "agent" ||
                          message.role === "user") &&
                          (() => {
                            const isEmpty =
                              localValidationAttempted &&
                              !message.content.trim();
                            const inlineDeleteBtn = showInlineDelete ? (
                              <button
                                onClick={() => removeChatMessage(message.id)}
                                className="w-8 h-8 flex-shrink-0 rounded-lg border flex items-center justify-center cursor-pointer transition-colors bg-red-500/10 border-red-500/40 text-red-500 hover:bg-red-500/20 hover:border-red-500/60"
                                title="Remove message"
                              >
                                <svg
                                  className="w-4 h-4"
                                  fill="none"
                                  viewBox="0 0 24 24"
                                  stroke="currentColor"
                                  strokeWidth={2}
                                >
                                  <path
                                    strokeLinecap="round"
                                    strokeLinejoin="round"
                                    d="M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 01-2.244 2.077H8.084a2.25 2.25 0 01-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 00-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 013.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 00-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 00-7.5 0"
                                  />
                                </svg>
                              </button>
                            ) : null;
                            return (
                              <div
                                className={`flex w-full items-start gap-2 ${
                                  message.role === "user"
                                    ? "flex-row-reverse"
                                    : ""
                                }`}
                              >
                                {inlineDeleteBtn}
                                <div className="w-fit max-w-[50%] min-w-[180px] flex flex-col">
                                  <textarea
                                    value={message.content}
                                    placeholder={
                                      message.role === "agent"
                                        ? "Enter agent message"
                                        : "Enter user message"
                                    }
                                    onChange={(e) => {
                                      updateChatMessage(
                                        message.id,
                                        e.target.value,
                                      );
                                      // Auto-resize textarea
                                      e.target.style.height = "auto";
                                      e.target.style.height = `${e.target.scrollHeight}px`;
                                    }}
                                    onInput={(e) => {
                                      // Auto-resize on initial render and paste
                                      const target =
                                        e.target as HTMLTextAreaElement;
                                      target.style.height = "auto";
                                      target.style.height = `${target.scrollHeight}px`;
                                    }}
                                    ref={autoSizeOnMount}
                                    data-msg-id={message.id}
                                    rows={1}
                                    className={`[field-sizing:content] min-w-[180px] max-w-full px-4 py-2 rounded-xl text-sm text-foreground border focus:outline-none focus:ring-1 resize-none overflow-hidden placeholder:text-muted-foreground ${
                                      isEmpty
                                        ? "border-red-500 focus:ring-red-500"
                                        : "focus:ring-accent " +
                                          (message.role === "agent"
                                            ? "bg-background border-border"
                                            : "bg-accent border-border")
                                    }`}
                                  />
                                  {isEmpty && (
                                    <p className="text-xs text-red-500 mt-1">
                                      Message cannot be empty
                                    </p>
                                  )}
                                  {turnTimestamp && (
                                    <span
                                      className={`text-[11px] text-muted-foreground tabular-nums mt-1 ${
                                        message.role === "user"
                                          ? "self-start"
                                          : "self-end"
                                      }`}
                                    >
                                      {turnTimestamp}
                                    </span>
                                  )}
                                </div>
                              </div>
                            );
                          })()}

                        {/* Tool Call Display */}
                        {message.role === "tool_call" && (
                          <div className="flex w-full items-start gap-2">
                            {/* Delete button on the LEFT of the tool-call card
                              so it aligns with how previous agent message
                              rows place it (tool calls are always an agent
                              action, never a user one). Rendered first in
                              source order so flexbox lays it out at the
                              start of the row. */}
                            {showInlineDelete && (
                              <button
                                onClick={() => removeChatMessage(message.id)}
                                className="w-8 h-8 flex-shrink-0 rounded-lg border flex items-center justify-center cursor-pointer transition-colors bg-red-500/10 border-red-500/40 text-red-500 hover:bg-red-500/20 hover:border-red-500/60"
                                title="Remove message"
                              >
                                <svg
                                  className="w-4 h-4"
                                  fill="none"
                                  viewBox="0 0 24 24"
                                  stroke="currentColor"
                                  strokeWidth={2}
                                >
                                  <path
                                    strokeLinecap="round"
                                    strokeLinejoin="round"
                                    d="M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 01-2.244 2.077H8.084a2.25 2.25 0 01-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 00-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 013.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 00-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 00-7.5 0"
                                  />
                                </svg>
                              </button>
                            )}
                            <div className="w-1/2 flex flex-col">
                              <div className="bg-muted border border-border rounded-2xl p-4">
                                <div className="flex items-center gap-2 mb-2">
                                  <svg
                                    className="w-4 h-4 text-muted-foreground"
                                    fill="none"
                                    viewBox="0 0 24 24"
                                    stroke="currentColor"
                                    strokeWidth={1.5}
                                  >
                                    <path
                                      strokeLinecap="round"
                                      strokeLinejoin="round"
                                      d="M11.42 15.17L17.25 21A2.652 2.652 0 0021 17.25l-5.877-5.877M11.42 15.17l2.496-3.03c.317-.384.74-.626 1.208-.766M11.42 15.17l-4.655 5.653a2.548 2.548 0 11-3.586-3.586l6.837-5.63m5.108-.233c.55-.164 1.163-.188 1.743-.14a4.5 4.5 0 004.486-6.336l-3.276 3.277a3.004 3.004 0 01-2.25-2.25l3.276-3.276a4.5 4.5 0 00-6.336 4.486c.091 1.076-.071 2.264-.904 2.95l-.102.085m-1.745 1.437L5.909 7.5H4.5L2.25 3.75l1.5-1.5L7.5 4.5v1.409l4.26 4.26m-1.745 1.437l1.745-1.437m6.615 8.206L15.75 15.75M4.867 19.125h.008v.008h-.008v-.008z"
                                    />
                                  </svg>
                                  <span className="text-sm font-medium text-foreground">
                                    {message.toolName}
                                  </span>
                                  {message.isWebhook && (
                                    <span className="text-xs text-muted-foreground bg-background px-2 py-0.5 rounded">
                                      Webhook
                                    </span>
                                  )}
                                </div>
                                {message.toolParams &&
                                  message.toolParams.length > 0 && (
                                    <div className="space-y-3 mt-3">
                                      {/* Group parameters by type for webhook tools */}
                                      {message.isWebhook ? (
                                        <>
                                          {/* Query Parameters */}
                                          {message.toolParams.filter(
                                            (p) => p.group === "query",
                                          ).length > 0 && (
                                            <div className="bg-background border border-border rounded-xl p-3">
                                              <h5 className="text-xs font-medium text-muted-foreground mb-3 uppercase tracking-wide">
                                                Query
                                              </h5>
                                              <div className="space-y-3">
                                                {message.toolParams
                                                  .filter(
                                                    (p) => p.group === "query",
                                                  )
                                                  .map((param, idx) => {
                                                    const isEmpty =
                                                      !param.value.trim();
                                                    const showError =
                                                      localValidationAttempted &&
                                                      isEmpty;
                                                    return (
                                                      <div key={idx}>
                                                        <label className="block text-sm font-medium text-foreground mb-1.5">
                                                          {param.name}
                                                        </label>
                                                        <input
                                                          type="text"
                                                          value={param.value}
                                                          onChange={(e) =>
                                                            updateToolCallParam(
                                                              message.id,
                                                              param.name,
                                                              e.target.value,
                                                              param.group,
                                                            )
                                                          }
                                                          placeholder={`Enter ${param.name}`}
                                                          data-tool-call-id={
                                                            message.id
                                                          }
                                                          className={`w-full h-10 px-3 rounded-lg text-sm bg-muted text-foreground placeholder:text-muted-foreground border focus:outline-none focus:ring-2 focus:ring-accent ${
                                                            showError
                                                              ? "border-red-500"
                                                              : "border-border"
                                                          }`}
                                                        />
                                                        {showError && (
                                                          <p className="text-xs text-red-500 mt-1">
                                                            This field cannot be
                                                            empty
                                                          </p>
                                                        )}
                                                      </div>
                                                    );
                                                  })}
                                              </div>
                                            </div>
                                          )}
                                          {/* Body Parameters */}
                                          {message.toolParams.filter(
                                            (p) => p.group === "body",
                                          ).length > 0 && (
                                            <div className="bg-background border border-border rounded-xl p-3">
                                              <h5 className="text-xs font-medium text-muted-foreground mb-3 uppercase tracking-wide">
                                                Body
                                              </h5>
                                              <div className="space-y-3">
                                                {message.toolParams
                                                  .filter(
                                                    (p) => p.group === "body",
                                                  )
                                                  .map((param, idx) => {
                                                    const isEmpty =
                                                      !param.value.trim();
                                                    const showError =
                                                      localValidationAttempted &&
                                                      isEmpty;
                                                    return (
                                                      <div key={idx}>
                                                        <label className="block text-sm font-medium text-foreground mb-1.5">
                                                          {param.name}
                                                        </label>
                                                        <input
                                                          type="text"
                                                          value={param.value}
                                                          onChange={(e) =>
                                                            updateToolCallParam(
                                                              message.id,
                                                              param.name,
                                                              e.target.value,
                                                              param.group,
                                                            )
                                                          }
                                                          placeholder={`Enter ${param.name}`}
                                                          data-tool-call-id={
                                                            message.id
                                                          }
                                                          className={`w-full h-10 px-3 rounded-lg text-sm bg-muted text-foreground placeholder:text-muted-foreground border focus:outline-none focus:ring-2 focus:ring-accent ${
                                                            showError
                                                              ? "border-red-500"
                                                              : "border-border"
                                                          }`}
                                                        />
                                                        {showError && (
                                                          <p className="text-xs text-red-500 mt-1">
                                                            This field cannot be
                                                            empty
                                                          </p>
                                                        )}
                                                      </div>
                                                    );
                                                  })}
                                              </div>
                                            </div>
                                          )}
                                        </>
                                      ) : (
                                        /* Regular tool parameters */
                                        <div className="space-y-3">
                                          {message.toolParams.map(
                                            (param, idx) => {
                                              const isEmpty =
                                                !param.value.trim();
                                              const showError =
                                                localValidationAttempted &&
                                                isEmpty;
                                              return (
                                                <div key={idx}>
                                                  <label className="block text-sm font-medium text-foreground mb-1.5">
                                                    {param.name}
                                                  </label>
                                                  <input
                                                    type="text"
                                                    value={param.value}
                                                    onChange={(e) =>
                                                      updateToolCallParam(
                                                        message.id,
                                                        param.name,
                                                        e.target.value,
                                                        param.group,
                                                      )
                                                    }
                                                    placeholder={`Enter ${param.name}`}
                                                    className={`w-full h-10 px-4 rounded-lg text-sm bg-background text-foreground placeholder:text-muted-foreground border focus:outline-none focus:ring-2 focus:ring-accent ${
                                                      showError
                                                        ? "border-red-500"
                                                        : "border-border"
                                                    }`}
                                                  />
                                                  {showError && (
                                                    <p className="text-xs text-red-500 mt-1">
                                                      This field cannot be empty
                                                    </p>
                                                  )}
                                                </div>
                                              );
                                            },
                                          )}
                                        </div>
                                      )}
                                    </div>
                                  )}
                              </div>
                              {turnTimestamp && (
                                <span className="self-end text-[11px] text-muted-foreground tabular-nums mt-1">
                                  {turnTimestamp}
                                </span>
                              )}
                            </div>
                          </div>
                        )}

                        {/* Tool Response Display (for webhook tools) */}
                        {message.role === "tool_response" && (
                          <div className="w-1/2">
                            <div className="bg-muted border border-border rounded-2xl p-4">
                              <div className="flex items-center gap-2 mb-2">
                                <svg
                                  className="w-4 h-4 text-muted-foreground"
                                  fill="none"
                                  viewBox="0 0 24 24"
                                  stroke="currentColor"
                                  strokeWidth={1.5}
                                >
                                  <path
                                    strokeLinecap="round"
                                    strokeLinejoin="round"
                                    d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
                                  />
                                </svg>
                                <span className="text-sm font-medium text-foreground">
                                  Tool Response
                                </span>
                                <span className="text-xs text-muted-foreground">
                                  ({message.toolName})
                                </span>
                              </div>
                              <div className="mt-2">
                                <label className="block text-xs font-medium text-muted-foreground mb-1.5">
                                  JSON Response{" "}
                                  <span className="text-red-500">*</span>
                                </label>
                                <textarea
                                  value={message.content}
                                  onChange={(e) =>
                                    updateChatMessage(
                                      message.id,
                                      e.target.value,
                                    )
                                  }
                                  placeholder='{"status": "success", "response": {}}'
                                  rows={5}
                                  className={`w-full px-3 py-2 rounded-lg text-sm font-mono bg-background text-foreground placeholder:text-muted-foreground border focus:outline-none focus:ring-2 focus:ring-accent ${(() => {
                                    try {
                                      JSON.parse(message.content);
                                      return "border-border";
                                    } catch {
                                      return message.content.trim()
                                        ? "border-red-500"
                                        : "border-border";
                                    }
                                  })()}`}
                                />
                                {(() => {
                                  try {
                                    JSON.parse(message.content);
                                    return null;
                                  } catch {
                                    return message.content.trim() ? (
                                      <p className="text-xs text-red-500 mt-1">
                                        Invalid JSON format
                                      </p>
                                    ) : null;
                                  }
                                })()}
                              </div>
                            </div>
                          </div>
                        )}

                        {/* Message Actions — Delete + Add on the last non-tool-response message only.
                           Earlier messages get an inline delete button beside the bubble. */}
                        <div className="flex items-center gap-2 relative">
                          {message.role !== "tool_response" &&
                            isLastNonToolResponse && (
                              <button
                                onClick={() => removeChatMessage(message.id)}
                                className="w-8 h-8 rounded-lg border flex items-center justify-center cursor-pointer transition-colors bg-red-500/10 border-red-500/40 text-red-500 hover:bg-red-500/20 hover:border-red-500/60"
                                title="Remove message"
                              >
                                <svg
                                  className="w-4 h-4"
                                  fill="none"
                                  viewBox="0 0 24 24"
                                  stroke="currentColor"
                                  strokeWidth={2}
                                >
                                  <path
                                    strokeLinecap="round"
                                    strokeLinejoin="round"
                                    d="M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 01-2.244 2.077H8.084a2.25 2.25 0 01-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 00-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 013.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 00-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 00-7.5 0"
                                  />
                                </svg>
                              </button>
                            )}
                          {message.role !== "tool_response" &&
                            index ===
                              chatMessages.length -
                                1 -
                                (chatMessages[chatMessages.length - 1]?.role ===
                                "tool_response"
                                  ? 1
                                  : 0) && (
                              <>
                                <div
                                  className="relative"
                                  ref={toolCallAnchorRef}
                                >
                                  <button
                                    onClick={() =>
                                      setAddMessageDropdownOpen(
                                        !addMessageDropdownOpen,
                                      )
                                    }
                                    className="w-8 h-8 rounded-lg border flex items-center justify-center cursor-pointer transition-colors bg-emerald-500/12 border-emerald-500/45 text-emerald-700 dark:text-emerald-300 hover:bg-emerald-500/22 dark:hover:bg-emerald-500/18"
                                    title="Add message"
                                  >
                                    <svg
                                      className="w-4 h-4"
                                      fill="none"
                                      viewBox="0 0 24 24"
                                      stroke="currentColor"
                                      strokeWidth={2}
                                    >
                                      <path
                                        strokeLinecap="round"
                                        strokeLinejoin="round"
                                        d="M12 4.5v15m7.5-7.5h-15"
                                      />
                                    </svg>
                                  </button>

                                  {/* Dropdown Menu */}
                                  {addMessageDropdownOpen && (
                                    <>
                                      <div
                                        className="fixed inset-0 z-[150]"
                                        onClick={() =>
                                          setAddMessageDropdownOpen(false)
                                        }
                                      />
                                      <div
                                        className={`absolute bg-background border border-border rounded-lg shadow-xl z-[200] overflow-hidden whitespace-nowrap ${
                                          message.role === "user"
                                            ? chatMessages.length <= 2
                                              ? "right-0 top-10"
                                              : "right-0 bottom-full mb-2"
                                            : chatMessages.length <= 2
                                              ? "left-0 top-10"
                                              : "left-0 bottom-full mb-2"
                                        }`}
                                      >
                                        {/* Neutral rows (no bright fills) —
                                          the three options stay visually
                                          distinct via their icons (person /
                                          chip / crossed tools) and labels
                                          rather than colour. */}
                                        <button
                                          onClick={() => {
                                            addChatMessage("user");
                                            setAddMessageDropdownOpen(false);
                                          }}
                                          className="w-full px-3 py-1.5 flex items-center gap-2 transition-colors cursor-pointer text-foreground hover:bg-muted"
                                        >
                                          <svg
                                            className="w-4 h-4 text-muted-foreground"
                                            fill="none"
                                            viewBox="0 0 24 24"
                                            stroke="currentColor"
                                            strokeWidth={1.5}
                                          >
                                            <path
                                              strokeLinecap="round"
                                              strokeLinejoin="round"
                                              d="M15.75 6a3.75 3.75 0 11-7.5 0 3.75 3.75 0 017.5 0zM4.501 20.118a7.5 7.5 0 0114.998 0A17.933 17.933 0 0112 21.75c-2.676 0-5.216-.584-7.499-1.632z"
                                            />
                                          </svg>
                                          <span className="text-sm">
                                            User message
                                          </span>
                                        </button>
                                        <button
                                          onClick={() => {
                                            addChatMessage("agent");
                                            setAddMessageDropdownOpen(false);
                                          }}
                                          className="w-full px-3 py-1.5 flex items-center gap-2 transition-colors cursor-pointer text-foreground hover:bg-muted"
                                        >
                                          <svg
                                            className="w-4 h-4 text-muted-foreground"
                                            fill="none"
                                            viewBox="0 0 24 24"
                                            stroke="currentColor"
                                            strokeWidth={1.5}
                                          >
                                            <path
                                              strokeLinecap="round"
                                              strokeLinejoin="round"
                                              d="M8.25 3v1.5M4.5 8.25H3m18 0h-1.5M4.5 12H3m18 0h-1.5m-15 3.75H3m18 0h-1.5M8.25 19.5V21M12 3v1.5m0 15V21m3.75-18v1.5m0 15V21m-9-1.5h10.5a2.25 2.25 0 002.25-2.25V6.75a2.25 2.25 0 00-2.25-2.25H6.75A2.25 2.25 0 004.5 6.75v10.5a2.25 2.25 0 002.25 2.25zm.75-12h9v9h-9v-9z"
                                            />
                                          </svg>
                                          <span className="text-sm">
                                            Agent message
                                          </span>
                                        </button>
                                        <button
                                          onClick={() => {
                                            setAddMessageDropdownOpen(false);
                                            setToolCallDropdownOpen(true);
                                          }}
                                          className="w-full px-3 py-1.5 flex items-center gap-2 transition-colors cursor-pointer text-foreground hover:bg-muted"
                                        >
                                          <svg
                                            className="w-4 h-4 text-muted-foreground"
                                            fill="none"
                                            viewBox="0 0 24 24"
                                            stroke="currentColor"
                                            strokeWidth={1.5}
                                          >
                                            <path
                                              strokeLinecap="round"
                                              strokeLinejoin="round"
                                              d="M11.42 15.17L17.25 21A2.652 2.652 0 0021 17.25l-5.877-5.877M11.42 15.17l2.496-3.03c.317-.384.74-.626 1.208-.766M11.42 15.17l-4.655 5.653a2.548 2.548 0 11-3.586-3.586l6.837-5.63m5.108-.233c.55-.164 1.163-.188 1.743-.14a4.5 4.5 0 004.486-6.336l-3.276 3.277a3.004 3.004 0 01-2.25-2.25l3.276-3.276a4.5 4.5 0 00-6.336 4.486c.091 1.076-.071 2.264-.904 2.95l-.102.085m-1.745 1.437L5.909 7.5H4.5L2.25 3.75l1.5-1.5L7.5 4.5v1.409l4.26 4.26m-1.745 1.437l1.745-1.437m6.615 8.206L15.75 15.75M4.867 19.125h.008v.008h-.008v-.008z"
                                            />
                                          </svg>
                                          <span className="text-sm">
                                            Agent tool call
                                          </span>
                                        </button>
                                      </div>
                                    </>
                                  )}

                                  {/* Tool Call Selection Dropdown — rendered in a portal with
                                      fixed positioning so it escapes the scrollable chat container
                                      instead of being clipped beneath the sticky header. */}
                                  {toolCallDropdownOpen &&
                                    typeof window !== "undefined" &&
                                    createPortal(
                                      <>
                                        <div
                                          className="fixed inset-0 z-[150]"
                                          onClick={() => {
                                            setToolCallDropdownOpen(false);
                                            setPendingToolCall(null);
                                          }}
                                        />
                                        <div
                                          style={(() => {
                                            const r = toolCallAnchorRect;
                                            if (!r)
                                              return { left: -9999, top: 0 };
                                            const margin = 8;
                                            const estHeight = 360;
                                            const spaceBelow =
                                              window.innerHeight -
                                              r.bottom -
                                              margin;
                                            const openAbove =
                                              spaceBelow < estHeight &&
                                              r.top > spaceBelow;
                                            const alignRight =
                                              message.role === "user";
                                            return {
                                              ...(openAbove
                                                ? {
                                                    bottom:
                                                      window.innerHeight -
                                                      r.top +
                                                      margin,
                                                  }
                                                : { top: r.bottom + margin }),
                                              ...(alignRight
                                                ? {
                                                    right:
                                                      window.innerWidth -
                                                      r.right,
                                                  }
                                                : { left: r.left }),
                                            };
                                          })()}
                                          className="fixed bg-background border border-border rounded-xl shadow-xl z-[200] overflow-hidden min-w-[320px]"
                                        >
                                          {!pendingToolCall ? (
                                            <ToolPicker
                                              availableTools={availableTools}
                                              isLoading={availableToolsLoading}
                                              onSelectInbuiltTool={(
                                                toolId,
                                                toolName,
                                              ) => {
                                                addToolCallMessage(
                                                  toolId,
                                                  toolName,
                                                  [],
                                                );
                                              }}
                                              onSelectCustomTool={(tool) => {
                                                const isWebhook =
                                                  tool.config?.type ===
                                                  "webhook";
                                                let allParams: Array<{
                                                  name: string;
                                                  value: string;
                                                  group?: string;
                                                }> = [];

                                                if (
                                                  isWebhook &&
                                                  tool.config?.webhook
                                                ) {
                                                  // Extract webhook-specific parameters
                                                  const webhook =
                                                    tool.config.webhook;

                                                  // Query parameters (for GET requests)
                                                  if (
                                                    webhook.queryParameters &&
                                                    Array.isArray(
                                                      webhook.queryParameters,
                                                    )
                                                  ) {
                                                    webhook.queryParameters.forEach(
                                                      (p: any) => {
                                                        allParams.push({
                                                          name:
                                                            p.id ||
                                                            p.name ||
                                                            "",
                                                          value: "",
                                                          group: "query",
                                                        });
                                                      },
                                                    );
                                                  }

                                                  // Body parameters (for POST requests)
                                                  if (
                                                    webhook.body?.parameters &&
                                                    Array.isArray(
                                                      webhook.body.parameters,
                                                    )
                                                  ) {
                                                    webhook.body.parameters.forEach(
                                                      (p: any) => {
                                                        allParams.push({
                                                          name:
                                                            p.id ||
                                                            p.name ||
                                                            "",
                                                          value: "",
                                                          group: "body",
                                                        });
                                                      },
                                                    );
                                                  }
                                                  // Note: Headers are not shown in conversation history UI
                                                } else {
                                                  // Structured output tool - use regular parameters
                                                  const params =
                                                    tool.config?.parameters;
                                                  if (Array.isArray(params)) {
                                                    allParams = params.map(
                                                      (p: any) => ({
                                                        name:
                                                          p.id || p.name || "",
                                                        value: "",
                                                      }),
                                                    );
                                                  } else {
                                                    const propsObj =
                                                      tool.config?.parameters
                                                        ?.properties ||
                                                      tool.config?.function
                                                        ?.parameters
                                                        ?.properties ||
                                                      tool.config?.properties ||
                                                      tool.config?.parameters ||
                                                      {};
                                                    allParams = Object.keys(
                                                      propsObj,
                                                    ).map((name) => ({
                                                      name,
                                                      value: "",
                                                    }));
                                                  }
                                                }

                                                addToolCallMessage(
                                                  tool.uuid,
                                                  tool.name,
                                                  allParams,
                                                  isWebhook,
                                                );
                                              }}
                                            />
                                          ) : (
                                            <div className="p-4">
                                              <div className="flex items-center gap-2 mb-4">
                                                <button
                                                  onClick={() =>
                                                    setPendingToolCall(null)
                                                  }
                                                  className="text-muted-foreground hover:text-foreground transition-colors"
                                                >
                                                  <svg
                                                    className="w-4 h-4"
                                                    fill="none"
                                                    viewBox="0 0 24 24"
                                                    stroke="currentColor"
                                                    strokeWidth={2}
                                                  >
                                                    <path
                                                      strokeLinecap="round"
                                                      strokeLinejoin="round"
                                                      d="M15.75 19.5L8.25 12l7.5-7.5"
                                                    />
                                                  </svg>
                                                </button>
                                                <h4 className="text-sm font-medium text-foreground">
                                                  {pendingToolCall.toolName}
                                                </h4>
                                              </div>
                                              <p className="text-xs text-muted-foreground mb-3">
                                                Enter values for parameters:
                                              </p>
                                              <div className="space-y-2 max-h-[200px] overflow-y-auto">
                                                {pendingToolCall.params.map(
                                                  (param, idx) => (
                                                    <div key={idx}>
                                                      <label className="block text-xs text-muted-foreground mb-1">
                                                        {param.name}
                                                      </label>
                                                      <input
                                                        type="text"
                                                        value={param.value}
                                                        onChange={(e) => {
                                                          const newParams = [
                                                            ...pendingToolCall.params,
                                                          ];
                                                          newParams[idx].value =
                                                            e.target.value;
                                                          setPendingToolCall({
                                                            ...pendingToolCall,
                                                            params: newParams,
                                                          });
                                                        }}
                                                        placeholder={`Enter ${param.name}`}
                                                        className="w-full h-9 px-3 rounded-lg text-sm bg-background text-foreground placeholder:text-muted-foreground border border-border focus:outline-none focus:ring-1 focus:ring-accent"
                                                      />
                                                    </div>
                                                  ),
                                                )}
                                              </div>
                                              <button
                                                onClick={() =>
                                                  addToolCallMessage(
                                                    pendingToolCall.toolId,
                                                    pendingToolCall.toolName,
                                                    pendingToolCall.params,
                                                  )
                                                }
                                                className="w-full mt-4 h-9 px-4 rounded-lg text-sm font-medium bg-foreground text-background hover:opacity-90 transition-opacity cursor-pointer"
                                              >
                                                Add tool call
                                              </button>
                                            </div>
                                          )}
                                        </div>
                                      </>,
                                      document.body,
                                    )}
                                </div>
                              </>
                            )}
                        </div>
                      </div>
                    );
                  })}
                  <div ref={chatEndRef} />
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
