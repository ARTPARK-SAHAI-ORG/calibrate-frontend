import {
  fetchTraces,
  fetchTrace,
  bulkDeleteMatchingTraces,
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
