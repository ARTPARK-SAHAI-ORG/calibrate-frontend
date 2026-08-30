import { act, renderHook, waitFor } from "@/test-utils";
import { useAgentHasRuns } from "../useAgentHasRuns";

jest.mock("../../lib/reportError", () => ({
  __esModule: true,
  reportError: jest.fn(),
}));

const BACKEND = "http://test-backend";

beforeEach(() => {
  jest.clearAllMocks();
  process.env.NEXT_PUBLIC_BACKEND_URL = BACKEND;
});

function setup(token: string | null = "tok") {
  return renderHook(() => useAgentHasRuns("agent-1", token));
}

describe("useAgentHasRuns", () => {
  it("is false when the agent has no runs, and asks for one row only", async () => {
    global.fetch = jest.fn(async () => ({
      ok: true,
      status: 200,
      json: async () => ({ items: [], total: 0 }),
    })) as unknown as jest.Mock;

    const { result } = setup();
    expect(result.current.hasRuns).toBeNull();
    await waitFor(() => expect(result.current.hasRuns).toBe(false));

    const url = new URL(String((global.fetch as jest.Mock).mock.calls[0][0]));
    expect(url.pathname).toBe("/agent-tests/agent/agent-1/runs");
    expect(url.searchParams.get("limit")).toBe("1");
  });

  it("is true when the agent has runs", async () => {
    global.fetch = jest.fn(async () => ({
      ok: true,
      status: 200,
      json: async () => ({ items: [{ uuid: "run-a" }], total: 3 }),
    })) as unknown as jest.Mock;

    const { result } = setup();
    await waitFor(() => expect(result.current.hasRuns).toBe(true));
  });

  it("keeps the tab when the check fails", async () => {
    global.fetch = jest.fn(async () => ({
      ok: false,
      status: 500,
      json: async () => ({}),
    })) as unknown as jest.Mock;

    const { result } = setup();
    await waitFor(() => expect(result.current.hasRuns).toBe(true));
  });

  it("does not ask without an access token", () => {
    global.fetch = jest.fn() as unknown as jest.Mock;
    const { result } = setup(null);
    expect(global.fetch).not.toHaveBeenCalled();
    expect(result.current.hasRuns).toBeNull();
  });

  it("markHasRuns turns it on once a run starts", async () => {
    global.fetch = jest.fn(async () => ({
      ok: true,
      status: 200,
      json: async () => ({ items: [], total: 0 }),
    })) as unknown as jest.Mock;

    const { result } = setup();
    await waitFor(() => expect(result.current.hasRuns).toBe(false));
    act(() => result.current.markHasRuns());
    expect(result.current.hasRuns).toBe(true);
  });
});
