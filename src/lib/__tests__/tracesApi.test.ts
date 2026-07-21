import {
  fetchTraces,
  fetchTrace,
  bulkDeleteMatchingTraces,
  convertTracesToTests,
} from "../tracesApi";
import { apiGet, apiPost } from "../api";

jest.mock("../api", () => ({
  __esModule: true,
  apiGet: jest.fn(),
  apiPost: jest.fn(),
}));

const mockApiGet = apiGet as jest.Mock;
const mockApiPost = apiPost as jest.Mock;

beforeEach(() => {
  mockApiGet.mockReset();
  mockApiPost.mockReset();
});

describe("fetchTraces", () => {
  it("sends limit and offset, omitting blank filters", async () => {
    mockApiGet.mockResolvedValue({ items: [], total: 0, limit: 50, offset: 0 });

    await fetchTraces("tok", { limit: 50, offset: 100 });

    const [url, token] = mockApiGet.mock.calls[0];
    expect(token).toBe("tok");
    const query = new URLSearchParams(url.split("?")[1]);
    expect(query.get("limit")).toBe("50");
    expect(query.get("offset")).toBe("100");
    expect(query.has("q")).toBe(false);
    expect(query.has("conversation_id")).toBe(false);
  });

  it("passes a trimmed q and the conversation filter through", async () => {
    mockApiGet.mockResolvedValue({ items: [], total: 0, limit: 50, offset: 0 });

    await fetchTraces("tok", {
      limit: 25,
      offset: 0,
      q: "  polio  ",
      conversationId: "conv-1",
    });

    const query = new URLSearchParams(mockApiGet.mock.calls[0][0].split("?")[1]);
    expect(query.get("q")).toBe("polio");
    expect(query.get("conversation_id")).toBe("conv-1");
  });

  it("does not send a whitespace-only q", async () => {
    mockApiGet.mockResolvedValue({ items: [], total: 0, limit: 50, offset: 0 });

    await fetchTraces("tok", { limit: 25, offset: 0, q: "   " });

    const query = new URLSearchParams(mockApiGet.mock.calls[0][0].split("?")[1]);
    expect(query.has("q")).toBe(false);
  });

  it("returns the paginated envelope unchanged", async () => {
    const envelope = {
      items: [{ uuid: "t1" }],
      total: 1,
      limit: 50,
      offset: 0,
    };
    mockApiGet.mockResolvedValue(envelope);

    const result = await fetchTraces("tok", { limit: 50, offset: 0 });
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

describe("bulkDeleteMatchingTraces", () => {
  it("POSTs select_all with trimmed filters", async () => {
    mockApiPost.mockResolvedValue({ deleted: 3 });

    const result = await bulkDeleteMatchingTraces("tok", {
      q: "  polio  ",
      conversationId: "conv-1",
    });

    expect(mockApiPost).toHaveBeenCalledWith(
      "/traces/bulk-delete",
      "tok",
      { select_all: true, q: "polio", conversation_id: "conv-1" },
    );
    expect(result).toEqual({ deleted: 3 });
  });

  it("omits empty filters, keeping only select_all", async () => {
    mockApiPost.mockResolvedValue({ deleted: 0 });

    await bulkDeleteMatchingTraces("tok", { q: "  ", conversationId: undefined });

    expect(mockApiPost).toHaveBeenCalledWith("/traces/bulk-delete", "tok", {
      select_all: true,
    });
  });
});

describe("convertTracesToTests", () => {
  it("shapes a response conversion with evaluators and agents", async () => {
    mockApiPost.mockResolvedValue({ created: 2, test_uuids: ["t1", "t2"] });

    const result = await convertTracesToTests("tok", {
      traceIds: ["a", "b"],
      type: "response",
      evaluatorUuids: ["ev1", "ev2"],
      agentUuids: ["ag1"],
    });

    expect(mockApiPost).toHaveBeenCalledWith("/traces/convert-to-tests", "tok", {
      trace_ids: ["a", "b"],
      type: "response",
      evaluators: [{ evaluator_uuid: "ev1" }, { evaluator_uuid: "ev2" }],
      agent_uuids: ["ag1"],
    });
    expect(result).toEqual({ created: 2, test_uuids: ["t1", "t2"] });
  });

  it("sends accept_any_arguments only for tool_call and omits empty evaluators/agents", async () => {
    mockApiPost.mockResolvedValue({ created: 1, test_uuids: ["t1"] });

    await convertTracesToTests("tok", {
      traceIds: ["a"],
      type: "tool_call",
      acceptAnyArguments: true,
    });

    expect(mockApiPost).toHaveBeenCalledWith("/traces/convert-to-tests", "tok", {
      trace_ids: ["a"],
      type: "tool_call",
      accept_any_arguments: true,
    });
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
    expect(body).not.toHaveProperty("agent_uuids");
  });
});
