"use client";

import { normalizeToolCall } from "@/components/test-results/shared";

// Lighter structured editor for correcting a tool call's expected value:
// tool name + argument key/value rows. No match modes (exact / criteria /
// any) — that's the full AddTestDialog editor; here an annotator just states
// what the correct call should be.

export type EditableArg = { key: string; value: string };
export type EditableToolCall = { tool: string; args: EditableArg[] };

function stringifyVal(v: unknown): string {
  if (v === null || v === undefined) return "";
  if (typeof v === "string") return v;
  try {
    return JSON.stringify(v);
  } catch {
    return String(v);
  }
}

// A match spec ({match_type, value?, criteria?}) has no match modes here, so
// collapse it to a plain string: criteria for llm_judge, the value otherwise.
function plainArgValue(v: unknown): string {
  if (v && typeof v === "object" && !Array.isArray(v) && "match_type" in v) {
    const spec = v as { match_type: string; value?: unknown; criteria?: string };
    if (spec.match_type === "llm_judge") return spec.criteria ?? "";
    if (spec.match_type === "any") return "";
    return stringifyVal(spec.value);
  }
  return stringifyVal(v);
}

function parseVal(s: string): unknown {
  const t = s.trim();
  if (t === "") return "";
  try {
    return JSON.parse(t);
  } catch {
    return s;
  }
}

// Tolerates any stored tool-call shape (via normalizeToolCall). Used to seed
// the editor from the item's expected_tool_calls or a saved correction.
export function callsToEditable(calls: unknown[] | null | undefined): EditableToolCall[] {
  return (calls ?? []).map((c) => {
    const { toolName, args } = normalizeToolCall(c);
    return {
      tool: toolName === "Unknown tool" ? "" : toolName,
      args: Object.entries(args ?? {}).map(([key, value]) => ({
        key,
        value: plainArgValue(value),
      })),
    };
  });
}

// The stored shape sent to the backend: plain `{ tool, arguments }`. Drops
// calls with no tool name and args with no key.
export function editableToStoredCalls(
  editable: EditableToolCall[],
): { tool: string; arguments: Record<string, unknown> }[] {
  return editable
    .filter((c) => c.tool.trim() !== "")
    .map((c) => ({
      tool: c.tool.trim(),
      arguments: Object.fromEntries(
        c.args
          .filter((a) => a.key.trim() !== "")
          .map((a) => [a.key.trim(), parseVal(a.value)]),
      ),
    }));
}

const inputCls =
  "w-full h-9 px-3 rounded-md text-sm bg-background text-foreground placeholder:text-muted-foreground border border-border focus:outline-none focus:ring-2 focus:ring-accent disabled:opacity-50 disabled:cursor-not-allowed";
const btnCls =
  "text-xs font-medium text-muted-foreground hover:text-foreground cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed";

export function CorrectedToolCallsEditor({
  value,
  onChange,
  disabled = false,
}: {
  value: EditableToolCall[];
  onChange: (v: EditableToolCall[]) => void;
  disabled?: boolean;
}) {
  const setCall = (ci: number, next: EditableToolCall) =>
    onChange(value.map((c, i) => (i === ci ? next : c)));
  const removeCall = (ci: number) =>
    onChange(value.filter((_, i) => i !== ci));
  const addCall = () =>
    onChange([...value, { tool: "", args: [] }]);

  return (
    <div className="space-y-3">
      {value.map((call, ci) => (
        <div
          key={ci}
          className="rounded-lg border border-border bg-muted/20 p-3 space-y-2"
        >
          <div className="flex items-center gap-2">
            <input
              className={inputCls}
              placeholder="Tool name"
              value={call.tool}
              disabled={disabled}
              onChange={(e) => setCall(ci, { ...call, tool: e.target.value })}
            />
            <button
              type="button"
              className={btnCls}
              disabled={disabled}
              onClick={() => removeCall(ci)}
              aria-label="Remove tool call"
            >
              Remove
            </button>
          </div>
          {call.args.map((arg, ai) => (
            <div key={ai} className="flex items-center gap-2 pl-2">
              <input
                className={`${inputCls} max-w-[10rem]`}
                placeholder="Argument"
                value={arg.key}
                disabled={disabled}
                onChange={(e) =>
                  setCall(ci, {
                    ...call,
                    args: call.args.map((a, i) =>
                      i === ai ? { ...a, key: e.target.value } : a,
                    ),
                  })
                }
              />
              <input
                className={inputCls}
                placeholder="Value"
                value={arg.value}
                disabled={disabled}
                onChange={(e) =>
                  setCall(ci, {
                    ...call,
                    args: call.args.map((a, i) =>
                      i === ai ? { ...a, value: e.target.value } : a,
                    ),
                  })
                }
              />
              <button
                type="button"
                className={btnCls}
                disabled={disabled}
                onClick={() =>
                  setCall(ci, {
                    ...call,
                    args: call.args.filter((_, i) => i !== ai),
                  })
                }
                aria-label="Remove argument"
              >
                ✕
              </button>
            </div>
          ))}
          <button
            type="button"
            className={`${btnCls} pl-2`}
            disabled={disabled}
            onClick={() =>
              setCall(ci, { ...call, args: [...call.args, { key: "", value: "" }] })
            }
          >
            + Add argument
          </button>
        </div>
      ))}
      <button type="button" className={btnCls} disabled={disabled} onClick={addCall}>
        + Add tool call
      </button>
    </div>
  );
}
