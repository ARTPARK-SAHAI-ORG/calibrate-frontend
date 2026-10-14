// A workspace tool was saved from the side panel while a form had it open.
// These carry the saved tool onto every copy the form holds: its new name and
// its current inputs. A tool picked in this session is found by its uuid; one
// loaded from a saved item or test only carries its old name, since those
// refer to the tool by name.

export type ToolEdit = { uuid: string; previousName: string; name: string };

type FlatParam = { name: string; value: string; group?: string };

/**
 * The tool's current inputs, keeping the value already typed into each input
 * that still exists. Inputs the tool no longer has are dropped.
 */
export function mergeFlatParams<T extends FlatParam>(
  current: T[],
  fresh: T[],
): T[] {
  return fresh.map((f) => {
    const kept = current.find((c) => c.name === f.name && c.group === f.group);
    return kept ? { ...f, value: kept.value } : f;
  });
}

type TreeParam = {
  name: string;
  required: boolean;
  dataType: string;
  isObject: boolean;
  custom: boolean;
  properties?: TreeParam[];
};

/**
 * The expected inputs of a tool under test, after the tool changed. Inputs
 * added by hand are kept; inputs the tool still declares keep what was set on
 * them; inputs it no longer declares are dropped; new required inputs are
 * added through `prepareNew`. Optional ones are left to be added back.
 */
export function mergeExpectedParams<T extends TreeParam>(
  current: T[],
  schema: T[],
  prepareNew: (param: T) => T,
): T[] {
  const kept = current.flatMap((c): T[] => {
    if (c.custom) return [c];
    const s = schema.find((p) => p.name === c.name);
    if (!s) return [];
    if (s.isObject !== c.isObject) return [prepareNew(s)];
    return [
      {
        ...c,
        required: s.required,
        dataType: s.dataType,
        properties: c.isObject
          ? mergeExpectedParams(
              (c.properties ?? []) as T[],
              (s.properties ?? []) as T[],
              prepareNew,
            )
          : c.properties,
      },
    ];
  });
  const added = schema
    .filter((s) => s.required && !current.some((c) => c.name === s.name))
    .map(prepareNew);
  return [...kept, ...added];
}

type FormTool = { id: string; name: string; isInbuilt: boolean };

export function applyToolEditToSelectedTools<T extends FormTool>(
  tools: T[],
  { uuid, previousName, name }: ToolEdit,
  update: (tool: T) => T = (t) => t,
): T[] {
  return tools.map((t) =>
    !t.isInbuilt && (t.id === uuid || t.name === previousName)
      ? update({ ...t, name })
      : t,
  );
}

type FormMessage = {
  id: string;
  role: string;
  toolId?: string;
  toolName?: string;
  toolParams?: FlatParam[];
  isInbuilt?: boolean;
  linkedToolCallId?: string;
};

/**
 * Renames the tool's calls and the tool responses that belong to them, and
 * gives each call the tool's current inputs (`freshParams`) when passed.
 */
export function applyToolEditToMessages<T extends FormMessage>(
  messages: T[],
  { uuid, previousName, name }: ToolEdit,
  freshParams?: FlatParam[],
): T[] {
  const calls = messages.filter(
    (m) =>
      m.role === "tool_call" &&
      !m.isInbuilt &&
      (m.toolId === uuid || m.toolName === previousName),
  );
  // A tool response points at its call by the call's id, or by the call's
  // toolId when it was loaded from a saved test.
  const callIds = new Set(
    calls.flatMap((m) => [m.id, m.toolId].filter(Boolean)),
  );
  return messages.map((m) => {
    if (calls.includes(m)) {
      return {
        ...m,
        toolName: name,
        toolParams: freshParams
          ? mergeFlatParams(m.toolParams ?? [], freshParams)
          : m.toolParams,
      };
    }
    return m.role === "tool_response" &&
      !!m.linkedToolCallId &&
      callIds.has(m.linkedToolCallId)
      ? { ...m, toolName: name }
      : m;
  });
}
