import { resolveEditedTestToRun, RunnableTest } from "../testRun";

const makeTest = (overrides: Partial<RunnableTest> = {}): RunnableTest => ({
  uuid: "test-1",
  name: "Refund test",
  description: "desc",
  type: "response",
  config: { history: [], evaluation: { type: "response" } },
  created_at: "2026-01-01T00:00:00Z",
  updated_at: "2026-01-02T00:00:00Z",
  ...overrides,
});

describe("resolveEditedTestToRun", () => {
  const submitted = {
    uuid: "test-1",
    name: "Edited name",
    type: "response" as const,
    config: { history: [{ role: "user", content: "hi" }], evaluation: { type: "response" } },
  };

  it("returns the fresh record from the refreshed list when the uuid matches", () => {
    const fresh = makeTest({ name: "Refund test (refreshed)" });
    const result = resolveEditedTestToRun([fresh], submitted);
    // The list copy wins so the runner shows the persisted values.
    expect(result).toBe(fresh);
  });

  it("synthesizes a minimal record from the submission when the list misses", () => {
    const result = resolveEditedTestToRun([makeTest({ uuid: "other" })], submitted);
    expect(result).toEqual({
      uuid: "test-1",
      name: "Edited name",
      description: "",
      type: "response",
      config: submitted.config,
      created_at: "",
      updated_at: "",
    });
  });

  it("synthesizes when the refreshed list is undefined", () => {
    const result = resolveEditedTestToRun(undefined, submitted);
    expect(result.uuid).toBe("test-1");
    expect(result.name).toBe("Edited name");
    expect(result.description).toBe("");
  });
});
