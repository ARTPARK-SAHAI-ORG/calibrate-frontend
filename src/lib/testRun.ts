// Helpers shared by the "Run test" / "Save and run" flow across the agent
// Tests tab and the standalone /tests page.

// The minimal test record the runner needs. Both pages keep their own
// structurally-identical `TestData` type; this captures the shared shape so the
// record-building logic below lives in one place.
export type RunnableTest = {
  uuid: string;
  name: string;
  description: string;
  type: "response" | "tool_call" | "conversation";
  config: Record<string, any>;
  created_at: string;
  updated_at: string;
};

// Build the record handed to the runner after saving an edited test. Running
// only needs the uuid (which we already hold as the open test's id — the
// `?testId` in the URL) plus the name for display; the remaining fields are
// filler so the shape matches `TestData`. No list lookup is involved, so the
// run can't be missed even if a refetch hasn't landed.
export function buildTestToRun(test: {
  uuid: string;
  name: string;
  type: RunnableTest["type"];
  config: Record<string, any>;
}): RunnableTest {
  return {
    uuid: test.uuid,
    name: test.name,
    description: "",
    type: test.type,
    config: test.config,
    created_at: "",
    updated_at: "",
  };
}
