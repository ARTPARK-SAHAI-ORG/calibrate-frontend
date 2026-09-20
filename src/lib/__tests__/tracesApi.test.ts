import {
  fetchTraces,
  fetchTrace,
  fetchTraceLabels,
  fetchTraceScores,
  fetchTraceScoringEligibility,
  setAgentTraceScoring,
  configWithTraceScoring,
  fetchTraceUsage,
  scoreAgentTraces,
  convertTracesToTests,
  selectAllBody,
  convertTracesErrorMessage,
  validateApiKeyForAgent,
  traceInputTurns,
  MAX_TRACES_PAGE_SIZE,
  type TraceScoreAverage,
} from "../tracesApi";
import { apiGet, apiPost, apiPut } from "../api";

jest.mock("../api", () => ({
  __esModule: true,
  apiGet: jest.fn(),
  apiPost: jest.fn(),
  apiPut: jest.fn(),
  getBackendUrl: jest.fn(() => "https://api.example.com"),
}));

const mockApiGet = apiGet as jest.Mock;
const mockApiPost = apiPost as jest.Mock;
const mockApiPut = apiPut as jest.Mock;

beforeEach(() => {
  mockApiGet.mockReset();
  mockApiPost.mockReset();
  mockApiPut.mockReset();
});

describe("fetchTraces", () => {
  it("sends limit, offset and the agent, and no search term when none is given", async () => {
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
    expect(query.has("output_type")).toBe(false);
  });

  it("sends the output filter, and leaves it off when everything is wanted", async () => {
    mockApiGet.mockResolvedValue({ items: [], total: 0, limit: 50, offset: 0 });

    await fetchTraces("tok", {
      limit: 50,
      offset: 0,
      agentId: "ag-1",
      outputType: "tool_call",
    });
    expect(
      new URLSearchParams(mockApiGet.mock.calls[0][0].split("?")[1]).get(
        "output_type",
      ),
    ).toBe("tool_call");

    await fetchTraces("tok", {
      limit: 50,
      offset: 0,
      agentId: "ag-1",
      outputType: "response",
    });
    expect(
      new URLSearchParams(mockApiGet.mock.calls[1][0].split("?")[1]).get(
        "output_type",
      ),
    ).toBe("response");

    await fetchTraces("tok", {
      limit: 50,
      offset: 0,
      agentId: "ag-1",
      outputType: "all",
    });
    expect(
      new URLSearchParams(mockApiGet.mock.calls[2][0].split("?")[1]).has(
        "output_type",
      ),
    ).toBe(false);
  });

  it("sends the trimmed search term, and leaves a blank one off", async () => {
    mockApiGet.mockResolvedValue({ items: [], total: 0, limit: 50, offset: 0 });

    await fetchTraces("tok", {
      limit: 50,
      offset: 0,
      agentId: "ag-1",
      q: "  polio  ",
    });
    expect(
      new URLSearchParams(mockApiGet.mock.calls[0][0].split("?")[1]).get("q"),
    ).toBe("polio");

    await fetchTraces("tok", {
      limit: 50,
      offset: 0,
      agentId: "ag-1",
      q: "  ",
    });
    expect(
      new URLSearchParams(mockApiGet.mock.calls[1][0].split("?")[1]).has("q"),
    ).toBe(false);
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

describe("fetchTraceScores", () => {
  it("GETs the full scoring history, newest first", async () => {
    const payload = { runs: [{ run_uuid: "r1", status: "completed" }] };
    mockApiGet.mockResolvedValue(payload);

    await expect(fetchTraceScores("tok", "t1")).resolves.toBe(payload);
    expect(mockApiGet).toHaveBeenCalledWith("/traces/t1/scores", "tok");
  });
});

describe("fetchTraceScoringEligibility", () => {
  it("GETs the JWT eligibility partition for the agent", async () => {
    const payload = { eligible: [], ineligible: [] };
    mockApiGet.mockResolvedValue(payload);

    await expect(fetchTraceScoringEligibility("tok", "ag-1")).resolves.toBe(
      payload,
    );
    expect(mockApiGet).toHaveBeenCalledWith(
      "/agents/ag-1/trace-scoring-eligibility",
      "tok",
    );
  });
});

describe("configWithTraceScoring", () => {
  it("keeps everything already stored, inside and outside the traces block", () => {
    expect(
      configWithTraceScoring(
        {
          system_prompt: "hi",
          traces: { retention_days: 30, scoring: { last_run: "x" } },
        },
        true,
      ),
    ).toEqual({
      system_prompt: "hi",
      traces: {
        retention_days: 30,
        scoring: { last_run: "x", enabled: true },
      },
    });
  });

  it("builds the block when the config has never held one", () => {
    expect(configWithTraceScoring({ system_prompt: "hi" }, false)).toEqual({
      system_prompt: "hi",
      traces: { scoring: { enabled: false } },
    });
  });
});

describe("setAgentTraceScoring", () => {
  it("sends the stored config back with the setting changed", async () => {
    mockApiPut.mockResolvedValue({ trace_scoring_enabled: true });

    await expect(
      setAgentTraceScoring("tok", "ag-1", { system_prompt: "hi" }, true),
    ).resolves.toEqual({ trace_scoring_enabled: true });
    expect(mockApiPut).toHaveBeenCalledWith("/agents/ag-1", "tok", {
      config: { system_prompt: "hi", traces: { scoring: { enabled: true } } },
    });
  });
});

describe("fetchTraceUsage", () => {
  it("reads how much of the workspace limits is used", async () => {
    mockApiGet.mockResolvedValue({
      traces_stored: 412,
      max_traces: 50000,
      traces_scored: 100,
      max_scored_traces: 100,
    });

    await expect(fetchTraceUsage("tok")).resolves.toEqual({
      traces_stored: 412,
      max_traces: 50000,
      traces_scored: 100,
      max_scored_traces: 100,
    });
    expect(mockApiGet).toHaveBeenCalledWith("/traces/usage", "tok");
  });
});

describe("scoreAgentTraces", () => {
  it("POSTs to the agent's score-traces endpoint and returns the queued count", async () => {
    mockApiPost.mockResolvedValue({ queued: 4 });

    await expect(scoreAgentTraces("tok", "ag-1")).resolves.toEqual({
      queued: 4,
    });
    expect(mockApiPost).toHaveBeenCalledWith(
      "/agents/ag-1/score-traces",
      "tok",
      {},
    );
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
  it("shapes a response conversion with plain evaluator ids", async () => {
    mockApiPost.mockResolvedValue({ created: 2, test_uuids: ["t1", "t2"] });

    const result = await convertTracesToTests("tok", {
      traceIds: ["a", "b"],
      type: "response",
      evaluatorUuids: ["ev1", "ev2"],
    });

    expect(mockApiPost).toHaveBeenCalledWith(
      "/traces/convert-to-tests",
      "tok",
      {
        trace_ids: ["a", "b"],
        type: "response",
        evaluators: ["ev1", "ev2"],
      },
    );
    expect(result).toEqual({ created: 2, test_uuids: ["t1", "t2"] });
  });

  it("shapes a general conversion the same way, with its own type", async () => {
    mockApiPost.mockResolvedValue({ created: 1, test_uuids: ["t1"] });

    await convertTracesToTests("tok", {
      traceIds: ["a"],
      type: "general",
      evaluatorUuids: ["ev1"],
    });

    expect(mockApiPost).toHaveBeenCalledWith(
      "/traces/convert-to-tests",
      "tok",
      { trace_ids: ["a"], type: "general", evaluators: ["ev1"] },
    );
  });

  it("sends accept_any_arguments only for tool_call and omits empty evaluators", async () => {
    mockApiPost.mockResolvedValue({ created: 1, test_uuids: ["t1"] });

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
    mockApiPost.mockResolvedValue({ created: 1, test_uuids: ["t1"] });

    await convertTracesToTests("tok", {
      traceIds: ["a"],
      type: "response",
      evaluatorUuids: ["ev1"],
    });

    const body = mockApiPost.mock.calls[0][2];
    expect(body).not.toHaveProperty("accept_any_arguments");
    // The backend links each created test to the trace's own agent.
    expect(body).not.toHaveProperty("agent_uuids");
  });
});

describe("fetchTraces with labels", () => {
  it("sends one labels value per picked label, and none when nothing is picked", async () => {
    mockApiGet.mockResolvedValue({ items: [], total: 0, limit: 50, offset: 0 });

    await fetchTraces("tok", {
      limit: 50,
      offset: 0,
      agentId: "ag-1",
      labels: ["production", "v2.1"],
    });
    expect(
      new URLSearchParams(mockApiGet.mock.calls[0][0].split("?")[1]).getAll(
        "labels",
      ),
    ).toEqual(["production", "v2.1"]);

    await fetchTraces("tok", {
      limit: 50,
      offset: 0,
      agentId: "ag-1",
      labels: [],
    });
    expect(
      new URLSearchParams(mockApiGet.mock.calls[1][0].split("?")[1]).has(
        "labels",
      ),
    ).toBe(false);
  });
});

describe("fetchTraceLabels", () => {
  it("asks for one agent's labels and reads them out of the response", async () => {
    mockApiGet.mockResolvedValue({ labels: ["production", "staging"] });

    expect(await fetchTraceLabels("tok", "ag 1")).toEqual([
      "production",
      "staging",
    ]);
    expect(mockApiGet.mock.calls[0][0]).toBe("/traces/labels?agent_id=ag%201");
    expect(mockApiGet.mock.calls[0][1]).toBe("tok");
  });

  it("reads a bare list, and an empty one when there are no labels", async () => {
    mockApiGet.mockResolvedValue(["production"]);
    expect(await fetchTraceLabels("tok", "ag-1")).toEqual(["production"]);

    mockApiGet.mockResolvedValue({});
    expect(await fetchTraceLabels("tok", "ag-1")).toEqual([]);
  });
});

describe("selectAllBody", () => {
  it("carries the agent, the search text and the output type", () => {
    expect(
      selectAllBody({
        agentId: "ag-1",
        q: "  refund  ",
        outputType: "tool_call",
      }),
    ).toEqual({
      select_all: true,
      agent_id: "ag-1",
      q: "refund",
      output_type: "tool_call",
    });
  });

  it("carries the picked labels, and leaves them out when none are picked", () => {
    expect(selectAllBody({ agentId: "ag-1", labels: ["production"] })).toEqual({
      select_all: true,
      agent_id: "ag-1",
      labels: ["production"],
    });
    expect(selectAllBody({ agentId: "ag-1", labels: [] })).toEqual({
      select_all: true,
      agent_id: "ag-1",
    });
  });

  it("leaves out a blank search and the all-outputs filter", () => {
    expect(
      selectAllBody({ agentId: "ag-1", q: "   ", outputType: "all" }),
    ).toEqual({ select_all: true, agent_id: "ag-1" });
    expect(selectAllBody({ agentId: "ag-1" })).toEqual({
      select_all: true,
      agent_id: "ag-1",
    });
  });
});

describe("convertTracesToTests for every trace the list matches", () => {
  it("sends the filters instead of the ticked ids", async () => {
    mockApiPost.mockResolvedValue({
      created: 3,
      test_uuids: ["t1", "t2", "t3"],
    });

    await convertTracesToTests("tok", {
      traceIds: ["stale-1"],
      selectAll: { agentId: "ag-1", q: "refund", outputType: "response" },
      type: "response",
      evaluatorUuids: ["ev1"],
    });

    const body = mockApiPost.mock.calls[0][2];
    expect(body).toEqual({
      select_all: true,
      agent_id: "ag-1",
      q: "refund",
      output_type: "response",
      type: "response",
      evaluators: ["ev1"],
    });
    // The ticks are left out on purpose: the backend re-reads the rows, so a
    // tick from a page that has since changed cannot slip through.
    expect(body).not.toHaveProperty("trace_ids");
  });
});

describe("convertTracesErrorMessage", () => {
  const failure = (detail: unknown) =>
    new Error(`Request failed: 400 - ${JSON.stringify({ detail })}`);

  it("reads the messages naming the evaluators that cannot be used", () => {
    expect(
      convertTracesErrorMessage(
        failure({
          error: "Some evaluators cannot be used.",
          evaluators: ["Tone needs values for its variables."],
        }),
      ),
    ).toBe("Tone needs values for its variables.");
  });

  it("counts the traces the backend rejected", () => {
    expect(
      convertTracesErrorMessage(
        failure({
          error: "These traces recorded no tool calls.",
          trace_ids: ["t1", "t2"],
        }),
      ),
    ).toBe("These traces recorded no tool calls. 2 traces could not be used.");
  });

  it("reads a plain text detail", () => {
    expect(
      convertTracesErrorMessage(
        failure("response tests require at least one evaluator"),
      ),
    ).toBe("response tests require at least one evaluator");
  });

  it("gives nothing back when there is no readable detail", () => {
    expect(convertTracesErrorMessage(new Error("network"))).toBeNull();
    expect(
      convertTracesErrorMessage(new Error("Request failed: 500 - {oops")),
    ).toBeNull();
    expect(convertTracesErrorMessage(failure({ other: 1 }))).toBeNull();
  });
});

describe("traceInputTurns", () => {
  it("keeps a stored conversation as it is", () => {
    const turns = [{ role: "user", content: "Hi" }];
    expect(traceInputTurns(turns)).toBe(turns);
  });

  it("reads plain text as the one user turn it stands for", () => {
    expect(traceInputTurns("When is the next vaccination?")).toEqual([
      { role: "user", content: "When is the next vaccination?" },
    ]);
  });

  it("gives nothing back for empty text or a missing input", () => {
    expect(traceInputTurns("   ")).toEqual([]);
    expect(traceInputTurns(null)).toEqual([]);
    expect(traceInputTurns(undefined)).toEqual([]);
  });
});

describe("fetchTraces score averages", () => {
  it("asks for the averages only when they are wanted", async () => {
    mockApiGet.mockResolvedValue({ items: [], total: 0, limit: 50, offset: 0 });

    await fetchTraces("tok", {
      limit: 50,
      offset: 0,
      agentId: "ag-1",
      includeScoreAverages: true,
    });
    expect(
      new URLSearchParams(mockApiGet.mock.calls[0][0].split("?")[1]).get(
        "include_score_averages",
      ),
    ).toBe("true");

    await fetchTraces("tok", {
      limit: 50,
      offset: 50,
      agentId: "ag-1",
      includeScoreAverages: false,
    });
    expect(
      new URLSearchParams(mockApiGet.mock.calls[1][0].split("?")[1]).has(
        "include_score_averages",
      ),
    ).toBe(false);

    await fetchTraces("tok", { limit: 50, offset: 50, agentId: "ag-1" });
    expect(
      new URLSearchParams(mockApiGet.mock.calls[2][0].split("?")[1]).has(
        "include_score_averages",
      ),
    ).toBe(false);
  });

  it("hands back the averages the backend sent", async () => {
    const score_averages: TraceScoreAverage[] = [
      {
        evaluator_uuid: "ev-1",
        name: "Tone",
        output_type: "binary",
        traces_scored: 40,
        average: 0.75,
      },
      {
        evaluator_uuid: "ev-2",
        name: "Helpfulness",
        output_type: "rating",
        traces_scored: 40,
        average: 3.5,
        scale_min: 1,
        scale_max: 5,
      },
    ];
    mockApiGet.mockResolvedValue({
      items: [],
      total: 0,
      limit: 50,
      offset: 0,
      score_averages,
    });

    const result = await fetchTraces("tok", {
      limit: 50,
      offset: 0,
      agentId: "ag-1",
      includeScoreAverages: true,
    });
    expect(result.score_averages).toEqual(score_averages);
  });
});
