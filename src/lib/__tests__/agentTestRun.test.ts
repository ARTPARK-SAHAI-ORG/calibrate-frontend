import { signOut } from "next-auth/react";
import { startAgentTestRun } from "../agentTestRun";

jest.mock("next-auth/react", () => ({
  __esModule: true,
  signOut: jest.fn(),
}));

const BACKEND = "http://backend.test";

function jsonResponse(body: unknown, ok = true, status = ok ? 200 : 500) {
  return { ok, status, json: async () => body };
}

describe("startAgentTestRun", () => {
  const originalBackendUrl = process.env.NEXT_PUBLIC_BACKEND_URL;

  beforeEach(() => {
    process.env.NEXT_PUBLIC_BACKEND_URL = BACKEND;
    (global.fetch as any) = jest.fn();
    (signOut as jest.Mock).mockClear();
  });

  afterEach(() => {
    process.env.NEXT_PUBLIC_BACKEND_URL = originalBackendUrl;
    jest.clearAllMocks();
  });

  it("posts the given test uuids and returns the new run uuid", async () => {
    (global.fetch as jest.Mock).mockResolvedValue(
      jsonResponse({ task_id: "run-1" }),
    );

    const taskId = await startAgentTestRun({
      agentUuid: "agent-1",
      testUuids: ["t1", "t2"],
      accessToken: "token",
    });

    expect(taskId).toBe("run-1");
    const [url, init] = (global.fetch as jest.Mock).mock.calls[0];
    expect(url).toBe(`${BACKEND}/agent-tests/agent/agent-1/run`);
    expect(init.method).toBe("POST");
    expect(JSON.parse(init.body)).toEqual({ test_uuids: ["t1", "t2"] });
  });

  it("omits test uuids when running every linked test", async () => {
    (global.fetch as jest.Mock).mockResolvedValue(
      jsonResponse({ task_id: "run-2" }),
    );

    const taskId = await startAgentTestRun({
      agentUuid: "agent-1",
      testUuids: ["t1"],
      runAllLinked: true,
      accessToken: "token",
    });

    expect(taskId).toBe("run-2");
    const [, init] = (global.fetch as jest.Mock).mock.calls[0];
    expect(JSON.parse(init.body)).toEqual({});
  });

  it("signs out and returns null on a 401", async () => {
    (global.fetch as jest.Mock).mockResolvedValue(
      jsonResponse(null, false, 401),
    );

    const taskId = await startAgentTestRun({
      agentUuid: "agent-1",
      testUuids: ["t1"],
      accessToken: "token",
    });

    expect(taskId).toBeNull();
    expect(signOut).toHaveBeenCalledWith({ callbackUrl: "/login" });
  });

  it("throws when the server rejects the run", async () => {
    (global.fetch as jest.Mock).mockResolvedValue(
      jsonResponse(null, false, 500),
    );

    await expect(
      startAgentTestRun({
        agentUuid: "agent-1",
        testUuids: ["t1"],
        accessToken: "token",
      }),
    ).rejects.toThrow("Failed to start test run");
  });

  it("throws when the backend url is missing", async () => {
    delete process.env.NEXT_PUBLIC_BACKEND_URL;

    await expect(
      startAgentTestRun({
        agentUuid: "agent-1",
        testUuids: ["t1"],
        accessToken: "token",
      }),
    ).rejects.toThrow("BACKEND_URL environment variable is not set");
    expect(global.fetch).not.toHaveBeenCalled();
  });
});
