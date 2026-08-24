import { attachToolsToAgent } from "../agentTools";

const originalFetch = global.fetch;

describe("attachToolsToAgent", () => {
  beforeEach(() => {
    process.env.NEXT_PUBLIC_BACKEND_URL = "http://backend.test";
  });

  afterEach(() => {
    global.fetch = originalFetch;
  });

  it("does nothing, and makes no request, for an empty tool list", async () => {
    const fetchMock = jest.fn();
    global.fetch = fetchMock as unknown as typeof fetch;
    await attachToolsToAgent("agent-1", [], "tok");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("posts the agent and tool uuids with the signed-in token", async () => {
    const fetchMock = jest.fn().mockResolvedValue({ ok: true } as Response);
    global.fetch = fetchMock as unknown as typeof fetch;
    await attachToolsToAgent("agent-1", ["tool-1", "tool-2"], "tok");
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("http://backend.test/agent-tools");
    expect(init.method).toBe("POST");
    expect(init.headers.Authorization).toBe("Bearer tok");
    expect(JSON.parse(init.body)).toEqual({
      agent_uuid: "agent-1",
      tool_uuids: ["tool-1", "tool-2"],
    });
  });

  it("throws when the backend refuses the attach", async () => {
    const fetchMock = jest.fn().mockResolvedValue({ ok: false } as Response);
    global.fetch = fetchMock as unknown as typeof fetch;
    await expect(
      attachToolsToAgent("agent-1", ["tool-1"], "tok"),
    ).rejects.toThrow("Failed to add tools to agent");
  });

  it("throws when the backend url is not configured", async () => {
    delete process.env.NEXT_PUBLIC_BACKEND_URL;
    await expect(
      attachToolsToAgent("agent-1", ["tool-1"], "tok"),
    ).rejects.toThrow("BACKEND_URL is not set");
  });
});
