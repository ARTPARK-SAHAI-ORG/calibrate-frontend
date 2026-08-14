import {
  fetchTraces,
  fetchTrace,
  convertTracesToTests,
  validateApiKeyForAgent,
  MAX_TRACES_PAGE_SIZE,
} from "../tracesApi";
import { apiGet, apiPost } from "../api";

jest.mock("../api", () => ({
  __esModule: true,
  apiGet: jest.fn(),
  apiPost: jest.fn(),
  getBackendUrl: jest.fn(() => "https://api.example.com"),
}));

const mockApiGet = apiGet as jest.Mock;
const mockApiPost = apiPost as jest.Mock;

beforeEach(() => {
  mockApiGet.mockReset();
  mockApiPost.mockReset();
});

describe("fetchTraces", () => {
  it("sends limit, offset and the agent, and no search term", async () => {
    mockApiGet.mockResolvedValue({ items: [], total: 0, limit: 50, offset: 0 });

    await fetchTraces("tok", { limit: 50, offset: 100, agentId: "ag-1" });

    const [url, token] = mockApiGet.mock.calls[0];
    expect(token).toBe("tok");
    const query = new URLSearchParams(url.split("?")[1]);
    expect(query.get("limit")).toBe("50");
    expect(query.get("offset")).toBe("100");
    expect(query.get("agent_id")).toBe("ag-1");
    expect(query.has("q")).toBe(false);
    expect(query.has("conversation_id")).toBe(false);
  });

  it("clamps a too-large page to what the backend accepts", async () => {
    mockApiGet.mockResolvedValue({
      items: [],
      total: 0,
      limit: 200,
      offset: 0,
    });

    await fetchTraces("tok", { limit: 500, offset: 0, agentId: "ag-1" });

    const query = new URLSearchParams(
      mockApiGet.mock.calls[0][0].split("?")[1],
    );
    expect(query.get("limit")).toBe(String(MAX_TRACES_PAGE_SIZE));
    expect(MAX_TRACES_PAGE_SIZE).toBe(200);
  });

  it("leaves a page under the cap alone", async () => {
    mockApiGet.mockResolvedValue({ items: [], total: 0, limit: 25, offset: 0 });

    await fetchTraces("tok", { limit: 25, offset: 0, agentId: "ag-1" });

    const query = new URLSearchParams(
      mockApiGet.mock.calls[0][0].split("?")[1],
    );
    expect(query.get("limit")).toBe("25");
  });

  it("returns the paginated envelope unchanged", async () => {
    const envelope = {
      items: [{ uuid: "t1" }],
      total: 1,
      limit: 50,
      offset: 0,
    };
    mockApiGet.mockResolvedValue(envelope);

    const result = await fetchTraces("tok", {
      limit: 50,
      offset: 0,
      agentId: "ag-1",
    });
    expect(result).toBe(envelope);
  });
});

describe("fetchTrace", () => {
  it("GETs the trace by uuid", async () => {
    mockApiGet.mockResolvedValue({ uuid: "t1" });

    const result = await fetchTrace("tok", "t1");

    expect(mockApiGet).toHaveBeenCalledWith("/traces/t1", "tok");
    expect(result).toEqual({ uuid: "t1" });
  });
});

describe("validateApiKeyForAgent", () => {
  const originalFetch = global.fetch;

  beforeEach(() => {
    global.fetch = jest.fn();
  });

  afterEach(() => {
    global.fetch = originalFetch;
  });

  function mockResponse(status: number) {
    (global.fetch as jest.Mock).mockResolvedValue({
      ok: status >= 200 && status < 300,
      status,
    });
  }

  it("GETs the agent with only the pasted key, trimmed", async () => {
    mockResponse(200);

    await expect(validateApiKeyForAgent("  sk_live  ", "ag-1")).resolves.toBe(
      true,
    );

    expect(global.fetch).toHaveBeenCalledWith(
      "https://api.example.com/agents/ag-1",
      {
        headers: {
          accept: "application/json",
          "X-API-Key": "sk_live",
        },
      },
    );
    const headers = (global.fetch as jest.Mock).mock.calls[0][1].headers;
    expect(headers).not.toHaveProperty("Authorization");
  });

  it("returns false when the key is rejected", async () => {
    mockResponse(401);
    await expect(validateApiKeyForAgent("sk_bad", "ag-1")).resolves.toBe(false);

    mockResponse(403);
    await expect(validateApiKeyForAgent("sk_bad", "ag-1")).resolves.toBe(false);
  });

  it("throws on a missing agent rather than blaming the key", async () => {
    // A good key on an agent that is gone is not a bad key, so the caller must
    // be able to say "could not check" instead of "this key did not work".
    mockResponse(404);
    await expect(validateApiKeyForAgent("sk_live", "ag-gone")).rejects.toThrow(
      "Request failed: 404",
    );
  });

  it("throws when the check cannot complete", async () => {
    mockResponse(500);
    await expect(validateApiKeyForAgent("sk_live", "ag-1")).rejects.toThrow(
      "Request failed: 500",
    );

    (global.fetch as jest.Mock).mockRejectedValue(new Error("network"));
    await expect(validateApiKeyForAgent("sk_live", "ag-1")).rejects.toThrow(
      "network",
    );
  });
});

describe("convertTracesToTests", () => {
  it("shapes a response conversion with evaluators and agents", async () => {
    mockApiPost.mockResolvedValue({ test_uuids: ["t1", "t2"] });

    const result = await convertTracesToTests("tok", {
      traceIds: ["a", "b"],
      type: "response",
      evaluatorUuids: ["ev1", "ev2"],
      agentUuids: ["ag1"],
    });

    expect(mockApiPost).toHaveBeenCalledWith(
      "/traces/convert-to-tests",
      "tok",
      {
        trace_ids: ["a", "b"],
        type: "response",
        evaluators: [{ evaluator_uuid: "ev1" }, { evaluator_uuid: "ev2" }],
        agent_uuids: ["ag1"],
      },
    );
    expect(result).toEqual({ test_uuids: ["t1", "t2"] });
  });

  it("sends accept_any_arguments only for tool_call and omits empty evaluators/agents", async () => {
    mockApiPost.mockResolvedValue({ test_uuids: ["t1"] });

    await convertTracesToTests("tok", {
      traceIds: ["a"],
      type: "tool_call",
      acceptAnyArguments: true,
    });

    expect(mockApiPost).toHaveBeenCalledWith(
      "/traces/convert-to-tests",
      "tok",
      {
        trace_ids: ["a"],
        type: "tool_call",
        accept_any_arguments: true,
      },
    );
  });

  it("does not send accept_any_arguments for a response conversion", async () => {
    mockApiPost.mockResolvedValue({ test_uuids: ["t1"] });

    await convertTracesToTests("tok", {
      traceIds: ["a"],
      type: "response",
      evaluatorUuids: ["ev1"],
    });

    const body = mockApiPost.mock.calls[0][2];
    expect(body).not.toHaveProperty("accept_any_arguments");
    expect(body).not.toHaveProperty("agent_uuids");
  });
});
