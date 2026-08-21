import { act, renderHook, waitFor } from "@/test-utils";
import { useAgentRuns } from "../useAgentRuns";

jest.mock("../../lib/reportError", () => ({
  __esModule: true,
  reportError: jest.fn(),
}));

const BACKEND = "http://test-backend";
const AGENT_UUID = "agent-1";

const runA = { uuid: "run-a", name: "", type: "llm-unit-test", status: "done" };
const runB = { uuid: "run-b", name: "", type: "llm-unit-test", status: "done" };

function jsonResponse(data: unknown, ok = true, status = 200) {
  return { ok, status, json: async () => data };
}

function urls() {
  return (global.fetch as jest.Mock).mock.calls.map(
    ([url]) => new URL(String(url)),
  );
}
function lastRunsUrl() {
  const all = urls();
  return all[all.length - 1];
}
/** The one call (if any) that named this run via `around`. Landing on that
 * run's page fires a second, plain follow-up fetch for the same page, so the
 * `around` call itself isn't always the last one sent. */
function aroundUrl(runId: string) {
  return urls().find((u) => u.searchParams.get("around") === runId);
}

beforeEach(() => {
  jest.clearAllMocks();
  process.env.NEXT_PUBLIC_BACKEND_URL = BACKEND;
});

function setup(aroundRunId: string | null) {
  return renderHook(() =>
    useAgentRuns({
      agentUuid: AGENT_UUID,
      accessToken: "tok",
      pageSize: 50,
      filter: "all",
      aroundRunId,
    }),
  );
}

describe("useAgentRuns around", () => {
  it("sends around instead of offset, and lands the list where the backend says", async () => {
    global.fetch = jest.fn(async () =>
      jsonResponse({ items: [runB], total: 200, offset: 50 }),
    ) as jest.Mock;

    const { result } = setup("run-b");
    await waitFor(() => expect(result.current.items).toEqual([runB]));

    const around = aroundUrl("run-b");
    expect(around).toBeDefined();
    expect(around?.searchParams.has("offset")).toBe(false);
    // The page the run actually lives on, not page one.
    await waitFor(() => expect(result.current.offset).toBe(50));
    expect(result.current.aroundNotFound).toBe(false);
  });

  it("asks for around once, then pages normally on top of the landed offset", async () => {
    global.fetch = jest.fn(async (url: string) =>
      jsonResponse({
        items: [runB],
        total: 200,
        offset: url.includes("around=") ? 50 : undefined,
      }),
    ) as jest.Mock;

    const { result } = setup("run-b");
    await waitFor(() => expect(result.current.offset).toBe(50));
    // Let the plain follow-up fetch for the landed page settle too.
    await waitFor(() =>
      expect(
        urls().some(
          (u) => !u.searchParams.has("around") && u.searchParams.get("offset") === "50",
        ),
      ).toBe(true),
    );

    act(() => result.current.nextPage());
    await waitFor(() => expect(lastRunsUrl().searchParams.get("offset")).toBe("100"));
    expect(lastRunsUrl().searchParams.has("around")).toBe(false);
  });

  it("falls back to page one and reports not-found when the run isn't in the results", async () => {
    global.fetch = jest.fn(async (url: string) => {
      if (url.includes("around=")) return jsonResponse({}, false, 404);
      return jsonResponse({ items: [runA], total: 1, offset: 0 });
    }) as jest.Mock;

    const { result } = setup("run-gone");
    await waitFor(() => expect(result.current.aroundNotFound).toBe(true));
    await waitFor(() => expect(result.current.items).toEqual([runA]));
    expect(result.current.offset).toBe(0);
  });

  it("falls back to page one from a later page when the run isn't found there either", async () => {
    global.fetch = jest.fn(async (url: string) => {
      if (url.includes("around=")) return jsonResponse({}, false, 404);
      const offset = Number(new URL(url).searchParams.get("offset"));
      return jsonResponse({ items: [runA], total: 200, offset });
    }) as jest.Mock;

    const { result, rerender } = renderHook(
      ({ aroundRunId }: { aroundRunId: string | null }) =>
        useAgentRuns({
          agentUuid: AGENT_UUID,
          accessToken: "tok",
          pageSize: 50,
          filter: "all",
          aroundRunId,
        }),
      { initialProps: { aroundRunId: null as string | null } },
    );
    await waitFor(() => expect(result.current.items).toEqual([runA]));

    // Land on a later page first, same as ordinary paging.
    act(() => result.current.nextPage());
    await waitFor(() => expect(result.current.offset).toBe(50));

    // A run link comes in for a run that turns out not to exist either. The
    // fallback has to explicitly ask for page one — offset is already 50, so
    // just setting it to 0 wouldn't retrigger the fetch on its own.
    rerender({ aroundRunId: "run-gone" });
    await waitFor(() => expect(result.current.aroundNotFound).toBe(true));
    await waitFor(() => expect(result.current.offset).toBe(0));
  });

  it("pages normally with no aroundRunId", async () => {
    global.fetch = jest.fn(async () =>
      jsonResponse({ items: [runA], total: 1, offset: 0 }),
    ) as jest.Mock;

    setup(null);
    await waitFor(() =>
      expect(lastRunsUrl().searchParams.get("offset")).toBe("0"),
    );
    expect(lastRunsUrl().searchParams.has("around")).toBe(false);
  });
});
