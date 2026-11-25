"use client";

import React, { useLayoutEffect, useRef, useState } from "react";
import { ToolPicker, type AvailableTool } from "@/components/ToolPicker";
import { OpenToolButton } from "@/components/tools/OpenToolButton";
import {
  applyToolEditToSelectedTools,
  mergeExpectedParams,
} from "@/lib/toolEditsInForm";
import { ErrorNote, NestedContainer, ViewMoreToggle } from "@/components/ui";
import { readToolParameters, NormalizedToolParam } from "@/lib/toolParams";
import { INBUILT_TOOLS } from "@/constants/inbuilt-tools";
import { isPlainObject } from "@/components/human-labelling/itemConversation";

/** One expected tool call as it is saved: on a tool-call test's evaluation,
 * and as `expected_tool_calls` on a labelling item. */
export type ExpectedToolCall = {
  tool: string;
  arguments: Record<string, any>;
  is_called?: boolean;
  accept_any_arguments?: boolean;
};

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
// LLM along with the user's free-text criteria, `any` accepts whatever value the
// agent passed (the parameter is asserted present but its value is ignored).
type MatchType = "exact" | "llm_judge" | "any";

// The UI-level match mode shown in the per-parameter dropdown. "null" is a
// presentation-only variant of an exact match (emitted as value: null).
type MatchMode = "exact" | "llm_judge" | "null" | "any";

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
// `{ match_type: "exact", value }`, `{ match_type: "llm_judge", criteria,
// judge_model? }`, or `{ match_type: "any" }` (wildcard — value ignored). A dict
// containing a `match_type` key is always a spec.
const parseArgMatch = (
  v: any,
): {
  matchType: MatchType;
  value: any;
  criteria: string;
  judgeModel?: string;
} => {
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
        judgeModel:
          typeof v.judge_model === "string" ? v.judge_model : undefined,
      };
    }
    if (v.match_type === "any") {
      // Wildcard — the parameter is asserted present but its value is ignored.
      return { matchType: "any", value: undefined, criteria: "" };
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

export type SelectedToolConfig = {
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

// Pick the parameters to pre-select when a tool is first added. Optional params
// start out unselected (offered as add-back chips); only required ones are
// shown. If a level has no required params at all, the first one is selected so
// the form isn't empty. Applied recursively to nested object properties.
const defaultSelectedParams = (params: ExpectedParam[]): ExpectedParam[] => {
  const required = params.filter((p) => p.required);
  const chosen = required.length > 0 ? required : params.slice(0, 1);
  return chosen.map((p) =>
    p.isObject
      ? { ...p, properties: defaultSelectedParams(p.properties || []) }
      : p,
  );
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
  if (matchType === "any") {
    // Wildcard — preserve the "Is any" mode; no value/type to infer.
    return {
      id: newExpParamId(),
      name,
      value: "",
      matchType: "any",
      criteria: "",
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
// (edit mode). Required params are kept unless `savedOnly`; optional ones the
// saved test didn't assert are dropped; saved keys with no matching schema
// param surface as custom rows.
const overlayArgsOntoParams = (
  schemaParams: ExpectedParam[],
  args: Record<string, any>,
  savedOnly = false,
): ExpectedParam[] => {
  const schemaNames = new Set(schemaParams.map((p) => p.name));
  const merged: ExpectedParam[] = [];

  for (const p of schemaParams) {
    const present = Object.prototype.hasOwnProperty.call(args, p.name);
    if (!present) {
      if (p.required && !savedOnly) merged.push(p);
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
        properties: overlayArgsOntoParams(
          p.properties || [],
          childArgs,
          savedOnly,
        ),
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
// as an explicit match spec — `{ match_type: "exact", value }`,
// `{ match_type: "llm_judge", criteria, judge_model? }`, or `{ match_type: "any" }`
// for the wildcard mode — never a bare literal. Empty optional/custom rows are
// skipped; exact values are parsed as JSON when possible so numbers/booleans/
// objects round-trip.
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
    } else if (p.matchType === "any") {
      // Wildcard assertion — always emitted (even for optional params) so the
      // parameter is asserted present but its value is left unchecked.
      obj[name] = { match_type: "any" };
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
    // LLM judge, the expected value otherwise. A null assertion and the "any"
    // wildcard always count as filled.
    const filled =
      p.matchType === "llm_judge"
        ? p.criteria.trim()
        : p.matchType === "any"
          ? "any"
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
      p.matchType !== "any" &&
      !p.isNull &&
      expectedValueTypeError(p.value, p.dataType)
    )
      return true;
  }
  return false;
};

// Add-back chips for removed optional params. Clamped to a single row; when the
// chips overflow that row a "View more" / "View less" toggle reveals the rest
// (mirrors the evaluator-page prompt expander). Renders nothing when there's
// nothing to add back.
function AddBackChips({
  missing,
  onAdd,
}: {
  missing: ExpectedParam[];
  onAdd: (param: ExpectedParam) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const [overflowing, setOverflowing] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const measure = () => setOverflowing(el.scrollHeight > el.clientHeight + 1);
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, [missing.length, expanded]);
  if (missing.length === 0) return null;
  return (
    <div className="w-full space-y-2">
      <div
        ref={ref}
        className={`flex flex-wrap items-center gap-2 ${
          expanded ? "" : "max-h-8 overflow-hidden"
        }`}
      >
        {missing.map((s) => (
          <button
            key={s.name}
            type="button"
            onClick={() => onAdd(s)}
            className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium border border-dashed border-border bg-background text-muted-foreground hover:text-foreground hover:border-foreground transition-colors cursor-pointer"
          >
            <span className="text-sm leading-none">+</span>
            {s.name}
          </button>
        ))}
      </div>
      {(overflowing || expanded) && (
        <ViewMoreToggle
          expanded={expanded}
          onClick={() => setExpanded((e) => !e)}
        />
      )}
    </div>
  );
}

/** Saved expected tool calls back into the editor's rows. */
/** The editor's rows for saved tool calls. `savedOnly` leaves out required
 * inputs a call does not carry, so a labelling item, which records what was
 * expected rather than what the tool needs, still saves as it was. */
export function toolCallsToSelectedTools(
  toolCalls: ExpectedToolCall[] | undefined,
  availableTools: AvailableTool[],
  savedOnly = false,
): SelectedToolConfig[] {
  if (!toolCalls || toolCalls.length === 0) return [];
  return toolCalls.map((toolCall) => {
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
    const savedArgs = isPlainObject(toolCall.arguments)
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
        expectedParameters = overlayArgsOntoParams(
          params,
          savedArgs,
          savedOnly,
        );
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
}

/** The editor's rows as the tool calls they are saved as. */
export function selectedToolsToCalls(
  tools: SelectedToolConfig[],
): ExpectedToolCall[] {
  return tools.map((tool) => ({
    tool: tool.isInbuilt ? tool.id : tool.name,
    arguments: tool.acceptAnyParameterValues
      ? {}
      : buildArgsFromExpectedParams(tool.expectedParameters),
    accept_any_arguments: tool.acceptAnyParameterValues,
    ...(tool.expectation === "should-not-call" ? { is_called: false } : {}),
  }));
}

/** True when a tool expected to be called has an incomplete parameter. */
export function selectedToolsHaveInvalidParams(
  tools: SelectedToolConfig[],
): boolean {
  return tools.some(
    (tool) =>
      tool.expectation === "should-call" &&
      !tool.acceptAnyParameterValues &&
      hasInvalidExpectedParams(tool.expectedParameters),
  );
}

/** The editor's rows and the state behind its JSON views, held by the dialog
 * so it can read the rows on save and update them when a tool changes. */
export function useToolCallExpectations() {
  const [selectedTools, setSelectedTools] = useState<SelectedToolConfig[]>([]);
  const [toolDropdownOpen, setToolDropdownOpen] = useState(false);
  // Per-tool "edit parameters as raw JSON" mode. Keyed by tool id. While in
  // JSON mode we keep an editable text buffer and a parse-error message; valid
  // JSON flows live into `expectedParameters` (the single source of truth).
  const [jsonModeToolIds, setJsonModeToolIds] = useState<Set<string>>(
    new Set(),
  );
  const [toolJsonText, setToolJsonText] = useState<Record<string, string>>({});
  const [toolJsonError, setToolJsonError] = useState<
    Record<string, string | null>
  >({});
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
      expectedParameters: defaultSelectedParams(params),
    };

    setSelectedTools([...selectedTools, newTool]);
    setToolDropdownOpen(false);
  };

  // A tool was saved: carry its new name and inputs onto the copies of it
  // this list already holds, keeping what was typed into inputs that still
  // exist.
  const applyToolSaved = (tool: AvailableTool, previousName: string) => {
    const edit = { uuid: tool.uuid, previousName, name: tool.name };
    const schema = buildExpectedParamsFromToolConfig(tool.config);
    const nextTools = applyToolEditToSelectedTools(selectedTools, edit, (t) => ({
      ...t,
      allowCustomParameters: schema.allowCustom,
      // A tool that accepts any values has no expected inputs to update.
      expectedParameters: t.acceptAnyParameterValues
        ? t.expectedParameters
        : mergeExpectedParams(
            t.expectedParameters,
            schema.params,
            (param) => defaultSelectedParams([param])[0],
          ),
    }));
    setSelectedTools(nextTools);
    // A card open in its JSON view shows text written when the view opened,
    // so rewrite it for the cards that changed or it would show old inputs.
    const changedInJson = nextTools.filter(
      (t, i) => t !== selectedTools[i] && jsonModeToolIds.has(t.id),
    );
    if (changedInJson.length > 0) {
      setToolJsonText((prev) => ({
        ...prev,
        ...Object.fromEntries(
          changedInJson.map((t) => [
            t.id,
            JSON.stringify(
              buildArgsFromExpectedParams(t.expectedParameters),
              null,
              2,
            ),
          ]),
        ),
      }));
    }
  };

  // Fresh rows with every view closed, for a dialog opened again.
  const reset = (tools: SelectedToolConfig[]) => {
    setSelectedTools(tools);
    setToolDropdownOpen(false);
    setJsonModeToolIds(new Set());
    setToolJsonText({});
    setToolJsonError({});
    setCollapsedParamIds(new Set());
  };

  return {
    reset,
    selectedTools,
    setSelectedTools,
    toolDropdownOpen,
    setToolDropdownOpen,
    jsonModeToolIds,
    setJsonModeToolIds,
    toolJsonText,
    setToolJsonText,
    toolJsonError,
    setToolJsonError,
    collapsedParamIds,
    toggleParamCollapsed,
    addToolFromSelection,
    applyToolSaved,
  };
}

/** Pick the tools a call should be made to and the parameters it should be
 * made with. Used for a tool-call test and for a labelling item's expected
 * tool calls. */
export function ToolCallExpectationsEditor({
  editor,
  heading,
  emptyText,
  availableTools,
  availableToolsLoading,
  accessToken,
  onToolSaved,
  onCreateTool,
  showErrors,
  requireAtLeastOne = false,
  createToolLabel,
}: {
  editor: ReturnType<typeof useToolCallExpectations>;
  heading: string;
  emptyText: string;
  availableTools: AvailableTool[];
  availableToolsLoading: boolean;
  accessToken?: string;
  onToolSaved: (
    tool: AvailableTool,
    previousName: string,
    allTools: AvailableTool[],
  ) => void;
  onCreateTool: () => void;
  showErrors: boolean;
  /** Marks the Add tool button when no tool is picked and errors are shown. */
  requireAtLeastOne?: boolean;
  /** A fuller name for the Create tool button when the screen has another. */
  createToolLabel?: string;
}) {
  const {
    selectedTools,
    setSelectedTools,
    toolDropdownOpen,
    setToolDropdownOpen,
    jsonModeToolIds,
    setJsonModeToolIds,
    toolJsonText,
    setToolJsonText,
    toolJsonError,
    setToolJsonError,
    collapsedParamIds,
    toggleParamCollapsed,
    addToolFromSelection,
  } = editor;

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

  // ---- Per-tool JSON editing of expected parameters ----
  // Switch a tool's parameter editor into raw-JSON mode, seeding the buffer
  // from the current expected `arguments`.
  const enterToolJsonMode = (tool: SelectedToolConfig) => {
    const args = buildArgsFromExpectedParams(tool.expectedParameters);
    setToolJsonText((prev) => ({
      ...prev,
      [tool.id]: JSON.stringify(args, null, 2),
    }));
    setToolJsonError((prev) => ({ ...prev, [tool.id]: null }));
    setJsonModeToolIds((prev) => new Set(prev).add(tool.id));
  };

  const exitToolJsonMode = (toolId: string) => {
    setJsonModeToolIds((prev) => {
      const next = new Set(prev);
      next.delete(toolId);
      return next;
    });
    setToolJsonError((prev) => ({ ...prev, [toolId]: null }));
  };

  // Live-sync raw JSON into the expected-parameter tree. Valid JSON (an object
  // of param → value / spec) is overlaid onto the tool's schema; invalid JSON
  // surfaces an error and leaves the last good parameters untouched.
  const handleToolJsonChange = (tool: SelectedToolConfig, text: string) => {
    setToolJsonText((prev) => ({ ...prev, [tool.id]: text }));
    let parsed: any;
    try {
      parsed = JSON.parse(text);
    } catch (e) {
      setToolJsonError((prev) => ({
        ...prev,
        [tool.id]: `Invalid JSON: ${(e as Error).message}`,
      }));
      return;
    }
    if (
      parsed === null ||
      typeof parsed !== "object" ||
      Array.isArray(parsed)
    ) {
      setToolJsonError((prev) => ({
        ...prev,
        [tool.id]: "The top-level value must be a JSON object of parameters.",
      }));
      return;
    }
    setToolJsonError((prev) => ({ ...prev, [tool.id]: null }));
    const schemaParams = getExpectedParamsForTool(tool.id, tool.name).params;
    const rebuilt = overlayArgsOntoParams(schemaParams, parsed);
    setSelectedTools((prev) =>
      prev.map((t) =>
        t.id === tool.id ? { ...t, expectedParameters: rebuilt } : t,
      ),
    );
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
          updatedTool.expectedParameters = defaultSelectedParams(
            getExpectedParamsForTool(tool.id, tool.name).params,
          );
        }

        // If changing to should-call and params are empty and acceptAny is off
        if (
          updates.expectation === "should-call" &&
          tool.expectation !== "should-call" &&
          !updatedTool.acceptAnyParameterValues &&
          updatedTool.expectedParameters.length === 0
        ) {
          updatedTool.expectedParameters = defaultSelectedParams(
            getExpectedParamsForTool(tool.id, tool.name).params,
          );
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

  // Switch a leaf parameter's match mode: exact value, LLM-judge, null, or any.
  // "null" is modelled as an exact match with the `isNull` flag set; "any" is the
  // wildcard mode (value ignored). Switching into null/any clears any typed value
  // so the disabled field doesn't show stale text.
  const updateExpectedParamMatchMode = (
    toolId: string,
    path: string[],
    mode: MatchMode,
  ) =>
    mutateToolParams(toolId, (params) =>
      updateExpParamAtPath(params, path, (p) => ({
        ...p,
        matchType:
          mode === "llm_judge" ? "llm_judge" : mode === "any" ? "any" : "exact",
        isNull: mode === "null",
        value: mode === "null" || mode === "any" ? "" : p.value,
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
  // value against an LLM (non-boolean only), "Is null" asserts the value is
  // null, and "Is any" accepts any value (the parameter is checked for presence
  // but its value is ignored). Styled in the inverted (foreground) palette to set
  // it apart from the value / criteria field beside it.
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
          updateExpectedParamMatchMode(
            toolId,
            path,
            e.target.value as MatchMode,
          )
        }
        aria-label="Match mode"
        className="h-10 pl-3 pr-8 rounded-lg text-sm font-medium bg-foreground text-background border border-transparent hover:opacity-90 focus:outline-none focus:ring-2 focus:ring-accent cursor-pointer appearance-none transition-opacity"
      >
        <option value="exact">Is exactly</option>
        {allowLlm && <option value="llm_judge">satisfies the criteria</option>}
        <option value="null">Is null</option>
        <option value="any">Is any</option>
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

  // Full-width name input for a custom (user-added) parameter row. `hasError`
  // applies the red outline when the row is named-but-incomplete.
  const renderParamNameInput = (
    toolId: string,
    path: string[],
    name: string,
    hasError: boolean,
  ) => (
    <input
      type="text"
      value={name}
      onChange={(e) => updateExpectedParamName(toolId, path, e.target.value)}
      placeholder="Parameter name"
      className={`w-full h-9 px-3 rounded-lg text-sm bg-background text-foreground placeholder:text-muted-foreground border focus:outline-none focus:ring-2 focus:ring-accent ${
        hasError ? "border-red-500" : "border-border"
      }`}
    />
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
    return (
      <AddBackChips
        missing={missing}
        onAdd={(s) =>
          mutateToolParams(toolId, (params) =>
            addExpParamAtPath(params, parentPath, cloneExpParamFresh(s)),
          )
        }
      />
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

      // The "filled in" field for a leaf depends on its match strategy: the
      // judging criteria for an LLM judge, the expected value otherwise. A null
      // assertion and the "any" wildcard always count as filled.
      const leafFilled =
        param.matchType === "llm_judge"
          ? !!param.criteria.trim()
          : param.matchType === "any"
            ? true
            : param.isNull || !!param.value.trim();

      // Header: a label for declared params, or — for custom (user-added) rows —
      // a type-picker / badge / remove row with the name input on its own line
      // below. The match-type picker lives on the value row.
      const nameError =
        showErrors && param.custom && leafFilled && !param.name.trim();
      const nameInput = renderParamNameInput(
        toolId,
        paramPath,
        param.name,
        nameError,
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
                  {!param.required &&
                    renderRemoveParamButton(toolId, paramPath)}
                </div>
                {renderParamNameInput(toolId, paramPath, param.name, nameError)}
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
      const isAny = param.matchType === "any";
      const isNull = !isLlm && !isAny && !!param.isNull;
      const mode: MatchMode = isLlm
        ? "llm_judge"
        : isAny
          ? "any"
          : isNull
            ? "null"
            : "exact";
      const typeError =
        !isLlm &&
        !isAny &&
        !isNull &&
        expectedValueTypeError(param.value, param.dataType);
      const booleanUnset =
        !isNull &&
        !isAny &&
        param.dataType === "boolean" &&
        param.value !== "true" &&
        param.value !== "false";
      const missingValue =
        !leafFilled &&
        (param.required || (!param.custom ? true : !!param.name.trim()));
      const valueError =
        showErrors && (missingValue || typeError || booleanUnset);
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
            // Booleans match exactly (yes/no), assert null, or accept any value —
            // no LLM judging.
            <div className="flex items-center gap-2">
              {renderMatchTypeSelect(toolId, paramPath, mode, false)}
              {/* "Is null" / "Is any" assert presence only — no value box. */}
              {!isNull && !isAny && (
                <div className="relative flex-1 min-w-0">
                  <select
                    value={booleanUnset ? "" : param.value}
                    onChange={(e) =>
                      updateExpectedParamValue(
                        toolId,
                        paramPath,
                        e.target.value,
                      )
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
              ) : isNull || isAny ? null : ( // "Is null" / "Is any" assert presence only — no value box.
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
              Enter a valid{" "}
              {param.dataType === "integer" ? "integer" : "number"}.
            </p>
          )}
        </div>
      );
    });

  return (
    <div className="relative">
      <div className="flex items-center justify-between mb-2">
        <label className="text-base font-medium text-foreground">
          {heading}
        </label>
        <div className="flex items-center gap-2">
          <button
            onClick={() =>
              setToolDropdownOpen(!toolDropdownOpen)
            }
            className={`px-3 py-1.5 text-sm font-medium rounded-lg cursor-pointer border ${
              showErrors &&
              requireAtLeastOne &&
              selectedTools.length === 0
                ? "bg-red-500/10 text-red-500 border-red-500/40 hover:bg-red-500/20 transition-colors"
                : "bg-foreground text-background border-transparent hover:opacity-90 transition-opacity"
            }`}
          >
            Add tool
          </button>
          <button
            onClick={onCreateTool}
            aria-label={createToolLabel}
            className="px-3 py-1.5 text-sm font-medium bg-background text-foreground rounded-lg hover:bg-muted transition-colors cursor-pointer border border-border"
          >
            Create tool
          </button>
        </div>
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
              accessToken={accessToken}
              onToolSaved={onToolSaved}
            />
          </div>
        </>
      )}

      {selectedTools.length === 0 ? (
        <div className="bg-muted rounded-lg p-8 text-center ">
          <p className="text-muted-foreground text-sm">
            {emptyText}
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
                  {(() => {
                    const saved = tool.isInbuilt
                      ? undefined
                      : availableTools.find((t) => t.uuid === tool.id || t.name === tool.name);
                    return saved ? (
                      <OpenToolButton
                        tool={saved}
                        accessToken={
                          accessToken
                        }
                        onToolSaved={onToolSaved}
                        className="w-10 h-10"
                      />
                    ) : null;
                  })()}
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
                      <div className="mb-3 flex items-end justify-between gap-2">
                        <p className="text-xs text-muted-foreground">
                          {tool.allowCustomParameters &&
                          tool.expectedParameters.length === 0
                            ? "Add the parameter names you expect the agent to extract and their expected values"
                            : "Configure how each parameter for the tool call should be evaluated"}
                        </p>
                        {/* Form ⇆ JSON toggle for this tool's
                          expected parameters. */}
                        <div className="inline-flex flex-shrink-0 items-center gap-0.5 rounded-lg bg-background border border-border p-0.5">
                          <button
                            type="button"
                            onClick={() =>
                              exitToolJsonMode(tool.id)
                            }
                            className={`h-7 px-3 rounded-md text-xs font-medium transition-colors cursor-pointer ${
                              jsonModeToolIds.has(tool.id)
                                ? "text-muted-foreground hover:text-foreground"
                                : "bg-foreground text-background"
                            }`}
                          >
                            Form
                          </button>
                          <button
                            type="button"
                            onClick={() =>
                              enterToolJsonMode(tool)
                            }
                            className={`h-7 px-3 rounded-md text-xs font-medium transition-colors cursor-pointer ${
                              jsonModeToolIds.has(tool.id)
                                ? "bg-foreground text-background"
                                : "text-muted-foreground hover:text-foreground"
                            }`}
                          >
                            JSON
                          </button>
                        </div>
                      </div>

                      {jsonModeToolIds.has(tool.id) ? (
                        <div className="space-y-2">
                          {toolJsonError[tool.id] && (
                            <ErrorNote>
                              <p className="whitespace-pre-line">
                                {toolJsonError[tool.id]}
                              </p>
                            </ErrorNote>
                          )}
                          <textarea
                            value={toolJsonText[tool.id] ?? ""}
                            onChange={(e) =>
                              handleToolJsonChange(
                                tool,
                                e.target.value,
                              )
                            }
                            spellCheck={false}
                            placeholder={
                              '{\n  "param": { "match_type": "exact", "value": "..." }\n}'
                            }
                            className={`w-full min-h-[240px] px-4 py-3 rounded-lg text-sm font-mono bg-background text-foreground placeholder:text-muted-foreground border focus:outline-none focus:ring-2 focus:ring-accent resize-y ${
                              toolJsonError[tool.id]
                                ? "border-red-500"
                                : "border-border"
                            }`}
                          />
                        </div>
                      ) : (
                        <>
                          {tool.expectedParameters.length >
                            0 && (
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
                                  addCustomExpectedParam(
                                    tool.id,
                                    [],
                                  )
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
                        </>
                      )}
                    </div>
                  )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
