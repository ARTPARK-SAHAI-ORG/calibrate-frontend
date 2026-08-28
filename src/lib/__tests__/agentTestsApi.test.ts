import {
  fetchAgentTestsPage,
  fetchAllAgentTests,
  unlinkTestsFromAgent,
} from "../agentTestsApi";
import { apiGet, apiPost } from "../api";

jest.mock("../api", () => ({
  __esModule: true,
  apiGet: jest.fn(),
  apiPost: jest.fn(),
  unwrapList: jest.requireActual("../api").unwrapList,
}));

const mockGet = apiGet as jest.Mock;
const mockPost = apiPost as jest.Mock;

/** The address the last call asked for. */
function lastPath(): string {
  return mockGet.mock.calls[mockGet.mock.calls.length - 1][0];
}

beforeEach(() => {
  mockGet.mockReset();
  mockPost.mockReset();
  mockGet.mockResolvedValue({ items: [], total: 0 });
});

describe("fetchAgentTestsPage", () => {
  it("asks for one page of one agent's tests", async () => {
    await fetchAgentTestsPage("tok", {
      agentUuid: "a1",
      limit: 25,
      offset: 50,
    });
    expect(lastPath()).toBe("/agent-tests/agent/a1/tests?limit=25&offset=50");
    expect(mockGet).toHaveBeenCalledWith(expect.any(String), "tok");
  });

  it("sends the search text with the match mode the reader picked", async () => {
    await fetchAgentTestsPage("tok", {
      agentUuid: "a1",
      limit: 10,
      offset: 0,
      q: "  refund  ",
      qMode: "starts-with",
    });
    expect(lastPath()).toContain("q=refund");
    expect(lastPath()).toContain("q_mode=starts_with");
  });

  it("leaves the search out when nothing was typed", async () => {
    await fetchAgentTestsPage("tok", {
      agentUuid: "a1",
      limit: 10,
      offset: 0,
      q: "   ",
    });
    expect(lastPath()).not.toContain("q=");
  });

  it("asks for both kinds of reply test under the Agent Response filter", async () => {
    await fetchAgentTestsPage("tok", {
      agentUuid: "a1",
      limit: 10,
      offset: 0,
      type: "response",
    });
    expect(decodeURIComponent(lastPath())).toContain("type=response,general");
  });

  it("asks for one kind under the other filters", async () => {
    await fetchAgentTestsPage("tok", {
      agentUuid: "a1",
      limit: 10,
      offset: 0,
      type: "tool_call",
    });
    expect(lastPath()).toContain("type=tool_call");
    expect(lastPath()).not.toContain("response");
  });

  it("sends no type at all when every kind is wanted", async () => {
    await fetchAgentTestsPage("tok", {
      agentUuid: "a1",
      limit: 10,
      offset: 0,
      type: "all",
    });
    expect(lastPath()).not.toContain("type=");
  });
});

describe("fetchAllAgentTests", () => {
  it("asks for every linked test, with no page size", async () => {
    mockGet.mockResolvedValue({ items: [{ uuid: "t1" }], total: 1 });
    const tests = await fetchAllAgentTests("tok", "a1");
    expect(lastPath()).toBe("/agent-tests/agent/a1/tests");
    expect(tests).toEqual([{ uuid: "t1" }]);
  });

  it("reads a bare list too", async () => {
    mockGet.mockResolvedValue([{ uuid: "t1" }, { uuid: "t2" }]);
    expect(await fetchAllAgentTests("tok", "a1")).toHaveLength(2);
  });
});

describe("unlinkTestsFromAgent", () => {
  it("takes the whole selection off the agent in one call", async () => {
    mockPost.mockResolvedValue({ deleted_count: 2 });
    const result = await unlinkTestsFromAgent("tok", "a1", ["t1", "t2"]);
    expect(mockPost).toHaveBeenCalledWith("/agent-tests/bulk-unlink", "tok", {
      agent_uuid: "a1",
      test_uuids: ["t1", "t2"],
    });
    expect(result.deleted_count).toBe(2);
  });
});
