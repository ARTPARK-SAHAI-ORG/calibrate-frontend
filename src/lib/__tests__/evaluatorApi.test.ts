import { signOut } from "next-auth/react";
import {
  isOwnedEvaluator,
  getEvaluatorErrorMessage,
  isEvaluatorNameConflict,
  fetchAllEvaluators,
  fetchAgentEvaluators,
  setAgentEvaluators,
  attachEvaluatorToAgent,
  detachEvaluatorFromAgent,
  deleteEvaluator,
  type EvaluatorData,
} from "../evaluatorApi";

jest.mock("next-auth/react", () => ({
  signOut: jest.fn(),
}));

function mockResponse(
  init: {
    ok?: boolean;
    status?: number;
    headers?: Record<string, string>;
    jsonBody?: unknown;
    textBody?: string;
  } = {},
): Response {
  const {
    ok = true,
    status = 200,
    headers = {},
    jsonBody,
    textBody,
  } = init;
  return {
    ok,
    status,
    headers: { get: (key: string) => headers[key.toLowerCase()] ?? null },
    json: async () => jsonBody,
    text: async () =>
      textBody ?? (jsonBody != null ? JSON.stringify(jsonBody) : ""),
  } as Response;
}

beforeEach(() => {
  process.env.NEXT_PUBLIC_BACKEND_URL = "http://test-backend";
  (signOut as jest.Mock).mockClear();
  global.fetch = jest.fn();
});

describe("isOwnedEvaluator", () => {
  it("returns false for built-in defaults via is_default", () => {
    expect(isOwnedEvaluator({ is_default: true } as EvaluatorData)).toBe(
      false,
    );
  });

  it("returns true for non-default agent-list evaluators via is_default", () => {
    expect(isOwnedEvaluator({ is_default: false } as EvaluatorData)).toBe(true);
  });

  it("returns false when owner_user_id is null on library list items", () => {
    expect(
      isOwnedEvaluator({ owner_user_id: null } as EvaluatorData),
    ).toBe(false);
  });

  it("returns true when owner_user_id is set on library list items", () => {
    expect(
      isOwnedEvaluator({ owner_user_id: "user-1" } as EvaluatorData),
    ).toBe(true);
  });
});

describe("getEvaluatorErrorMessage", () => {
  it("reads detail from a JSON error body", async () => {
    const message = await getEvaluatorErrorMessage(
      mockResponse({
        ok: false,
        status: 400,
        headers: { "content-type": "application/json" },
        jsonBody: { detail: "Bad request" },
      }),
      "fallback",
    );
    expect(message).toBe("Bad request");
  });

  it("falls back to response text when JSON has no detail", async () => {
    const message = await getEvaluatorErrorMessage(
      mockResponse({
        ok: false,
        status: 500,
        headers: { "content-type": "application/json" },
        jsonBody: { error: "nope" },
        textBody: "Server exploded",
      }),
      "fallback",
    );
    expect(message).toBe("Server exploded");
  });

  it("uses the fallback when the body is empty", async () => {
    const message = await getEvaluatorErrorMessage(
      mockResponse({ ok: false, status: 500, textBody: "" }),
      "fallback",
    );
    expect(message).toBe("fallback");
  });
});

describe("isEvaluatorNameConflict", () => {
  it("detects a 409 duplicate-name conflict", () => {
    expect(
      isEvaluatorNameConflict(
        mockResponse({ status: 409 }),
        "Evaluator name already exists",
      ),
    ).toBe(true);
  });

  it("returns false for other statuses or messages", () => {
    expect(
      isEvaluatorNameConflict(
        mockResponse({ status: 409 }),
        "Something else",
      ),
    ).toBe(false);
    expect(
      isEvaluatorNameConflict(
        mockResponse({ status: 400 }),
        "Evaluator name already exists",
      ),
    ).toBe(false);
  });
});

describe("fetch helpers", () => {
  it("fetchAllEvaluators returns items from the paginated envelope", async () => {
    (global.fetch as jest.Mock).mockResolvedValue(
      mockResponse({
        jsonBody: {
          items: [{ uuid: "ev-1", name: "Tone" }],
          total: 1,
          limit: 100,
          offset: 0,
        },
      }),
    );

    const items = await fetchAllEvaluators("token");
    expect(items).toEqual([{ uuid: "ev-1", name: "Tone" }]);
    expect(global.fetch).toHaveBeenCalledWith(
      "http://test-backend/evaluators?include_defaults=true",
      expect.objectContaining({ method: "GET" }),
    );
  });

  it("fetchAllEvaluators signs out and returns [] on 401", async () => {
    (global.fetch as jest.Mock).mockResolvedValue(
      mockResponse({ ok: false, status: 401 }),
    );

    const items = await fetchAllEvaluators("token");
    expect(items).toEqual([]);
    expect(signOut).toHaveBeenCalledWith({ callbackUrl: "/login" });
  });

  it("fetchAllEvaluators throws on other failures", async () => {
    (global.fetch as jest.Mock).mockResolvedValue(
      mockResponse({ ok: false, status: 500 }),
    );

    await expect(fetchAllEvaluators("token")).rejects.toThrow(
      "Failed to fetch evaluators",
    );
  });

  it("setAgentEvaluators signs out and returns empty tallies on 401", async () => {
    (global.fetch as jest.Mock).mockResolvedValue(
      mockResponse({ ok: false, status: 401 }),
    );

    const result = await setAgentEvaluators("agent-1", ["ev-1"], "token");
    expect(result).toEqual({ evaluator_ids: [], linked: [], unlinked: [] });
    expect(signOut).toHaveBeenCalled();
  });

  it("attachEvaluatorToAgent throws with backend detail on failure", async () => {
    (global.fetch as jest.Mock).mockResolvedValue(
      mockResponse({
        ok: false,
        status: 400,
        headers: { "content-type": "application/json" },
        jsonBody: { detail: "Already attached" },
      }),
    );

    await expect(
      attachEvaluatorToAgent("agent-1", "ev-3", "token"),
    ).rejects.toThrow("Already attached");
  });

  it("detachEvaluatorFromAgent throws on failure", async () => {
    (global.fetch as jest.Mock).mockResolvedValue(
      mockResponse({ ok: false, status: 500, textBody: "nope" }),
    );

    await expect(
      detachEvaluatorFromAgent("agent-1", "ev-3", "token"),
    ).rejects.toThrow("nope");
  });

  it("deleteEvaluator throws on failure", async () => {
    (global.fetch as jest.Mock).mockResolvedValue(
      mockResponse({ ok: false, status: 500, textBody: "nope" }),
    );

    await expect(deleteEvaluator("ev-3", "token")).rejects.toThrow("nope");
  });

  it("fetchAgentEvaluators signs out and returns [] on 401", async () => {
    (global.fetch as jest.Mock).mockResolvedValue(
      mockResponse({ ok: false, status: 401 }),
    );

    const items = await fetchAgentEvaluators("agent-1", "token");
    expect(items).toEqual([]);
    expect(signOut).toHaveBeenCalled();
  });

  it("fetchAgentEvaluators returns items for an agent", async () => {
    (global.fetch as jest.Mock).mockResolvedValue(
      mockResponse({
        jsonBody: {
          items: [{ uuid: "ev-2", name: "Policy", is_default: true }],
          total: 1,
          limit: 100,
          offset: 0,
        },
      }),
    );

    const items = await fetchAgentEvaluators("agent-1", "token");
    expect(items).toEqual([
      { uuid: "ev-2", name: "Policy", is_default: true },
    ]);
  });

  it("setAgentEvaluators PUTs the desired id list", async () => {
    (global.fetch as jest.Mock).mockResolvedValue(
      mockResponse({
        jsonBody: {
          evaluator_ids: ["ev-1", "ev-2"],
          linked: ["ev-2"],
          unlinked: [],
        },
      }),
    );

    const result = await setAgentEvaluators("agent-1", ["ev-1", "ev-2"], "token");
    expect(result.linked).toEqual(["ev-2"]);
    expect(global.fetch).toHaveBeenCalledWith(
      "http://test-backend/agents/agent-1/evaluators",
      expect.objectContaining({
        method: "PUT",
        body: JSON.stringify({ evaluator_ids: ["ev-1", "ev-2"] }),
      }),
    );
  });

  it("setAgentEvaluators surfaces backend error detail", async () => {
    (global.fetch as jest.Mock).mockResolvedValue(
      mockResponse({
        ok: false,
        status: 400,
        headers: { "content-type": "application/json" },
        jsonBody: { detail: "Duplicate evaluator ids" },
      }),
    );

    await expect(
      setAgentEvaluators("agent-1", ["ev-1", "ev-1"], "token"),
    ).rejects.toThrow("Duplicate evaluator ids");
  });

  it("attachEvaluatorToAgent POSTs a single evaluator id", async () => {
    (global.fetch as jest.Mock).mockResolvedValue(mockResponse());

    await attachEvaluatorToAgent("agent-1", "ev-3", "token");

    expect(global.fetch).toHaveBeenCalledWith(
      "http://test-backend/agents/agent-1/evaluators",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({ evaluator_id: "ev-3" }),
      }),
    );
  });

  it("detachEvaluatorFromAgent DELETEs the link", async () => {
    (global.fetch as jest.Mock).mockResolvedValue(mockResponse());

    await detachEvaluatorFromAgent("agent-1", "ev-3", "token");

    expect(global.fetch).toHaveBeenCalledWith(
      "http://test-backend/agents/agent-1/evaluators/ev-3",
      expect.objectContaining({ method: "DELETE" }),
    );
  });

  it("deleteEvaluator DELETEs the evaluator record", async () => {
    (global.fetch as jest.Mock).mockResolvedValue(mockResponse());

    await deleteEvaluator("ev-3", "token");

    expect(global.fetch).toHaveBeenCalledWith(
      "http://test-backend/evaluators/ev-3",
      expect.objectContaining({ method: "DELETE" }),
    );
  });

  it("mutation helpers sign out on 401 without throwing", async () => {
    (global.fetch as jest.Mock).mockResolvedValue(
      mockResponse({ ok: false, status: 401 }),
    );

    await expect(
      attachEvaluatorToAgent("agent-1", "ev-3", "token"),
    ).resolves.toBeUndefined();
    await expect(
      detachEvaluatorFromAgent("agent-1", "ev-3", "token"),
    ).resolves.toBeUndefined();
    await expect(deleteEvaluator("ev-3", "token")).resolves.toBeUndefined();
    expect(signOut).toHaveBeenCalledTimes(3);
  });
});
