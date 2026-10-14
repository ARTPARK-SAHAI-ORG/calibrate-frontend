// A workspace tool was renamed while a test form had it open. These put the new
// name on every copy the form holds. A tool picked in this session is found by
// its uuid; one loaded from a saved test only carries its old name, since the
// saved test refers to the tool by name.

type Renamed = { uuid: string; previousName: string; name: string };

type FormTool = { id: string; name: string; isInbuilt: boolean };

export function renameSelectedTool<T extends FormTool>(
  tools: T[],
  { uuid, previousName, name }: Renamed,
): T[] {
  return tools.map((t) =>
    !t.isInbuilt && (t.id === uuid || t.name === previousName)
      ? { ...t, name }
      : t,
  );
}

type FormMessage = {
  id: string;
  role: string;
  toolId?: string;
  toolName?: string;
  isInbuilt?: boolean;
  linkedToolCallId?: string;
};

export function renameToolInMessages<T extends FormMessage>(
  messages: T[],
  { uuid, previousName, name }: Renamed,
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
  return messages.map((m) =>
    calls.includes(m) ||
    (m.role === "tool_response" &&
      !!m.linkedToolCallId &&
      callIds.has(m.linkedToolCallId))
      ? { ...m, toolName: name }
      : m,
  );
}
