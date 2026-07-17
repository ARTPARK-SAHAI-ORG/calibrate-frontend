import { buildTestToRun } from "../testRun";

describe("buildTestToRun", () => {
  it("builds a runnable record from the known uuid, name, type, and config", () => {
    const config = {
      history: [{ role: "user", content: "hi" }],
      evaluation: { type: "response" },
    };
    const result = buildTestToRun({
      uuid: "test-1",
      name: "Refund test",
      type: "response",
      config,
    });
    expect(result).toEqual({
      uuid: "test-1",
      name: "Refund test",
      description: "",
      type: "response",
      config,
      created_at: "",
      updated_at: "",
    });
  });

  it("preserves the config object reference (running keys off uuid, not a copy)", () => {
    const config = { history: [], evaluation: { type: "tool_call" } };
    const result = buildTestToRun({
      uuid: "t2",
      name: "Tool test",
      type: "tool_call",
      config,
    });
    expect(result.config).toBe(config);
  });
});
