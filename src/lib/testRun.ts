// Helpers shared by the "Run test" / "Save and run" flow across the agent
// Tests tab and the standalone /tests page.

// The minimal test record the runner needs. Both pages keep their own
// structurally-identical `TestData` type; this captures the shared shape so the
// found-or-synthesize logic below lives in one place.
export type RunnableTest = {
  uuid: string;
  name: string;
  description: string;
  type: "response" | "tool_call" | "conversation";
  config: Record<string, any>;
  created_at: string;
  updated_at: string;
};

// After saving an edited test, pick the record to hand to the runner: prefer
// the fresh copy from the refreshed list (matched by uuid), otherwise
// synthesize a minimal record from what was just submitted. Running only needs
// the uuid; the remaining fields are for display, so the synthesized fallback
// keeps the run working even when the refetch didn't return the test.
export function resolveEditedTestToRun<T extends RunnableTest>(
  refreshed: T[] | undefined,
  submitted: {
    uuid: string;
    name: string;
    type: RunnableTest["type"];
    config: Record<string, any>;
  },
): RunnableTest {
  const found = refreshed?.find((t) => t.uuid === submitted.uuid);
  if (found) return found;
  return {
    uuid: submitted.uuid,
    name: submitted.name,
    description: "",
    type: submitted.type,
    config: submitted.config,
    created_at: "",
    updated_at: "",
  };
}
