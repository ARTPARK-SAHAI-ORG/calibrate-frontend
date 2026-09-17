import { act, renderHook, waitFor } from "@/test-utils";
import {
  useAgentRuns,
  type RunResultFilter,
  type RunTypeFilter,
} from "../useAgentRuns";
import { POLLING_INTERVAL_MS } from "@/constants/polling";

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
/** The one call (if any) that named this run via `around`. */
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

  it("asks for around once, doesn't re-ask for the page it just landed on, then pages normally from there", async () => {
    global.fetch = jest.fn(async (url: string) =>
      jsonResponse({
        items: [runB],
        total: 200,
        offset: url.includes("around=") ? 50 : undefined,
      }),
    ) as jest.Mock;

    const { result } = setup("run-b");
    await waitFor(() => expect(result.current.offset).toBe(50));

    // The page it landed on is already in hand — no follow-up request for
    // the same page.
    expect((global.fetch as jest.Mock).mock.calls.length).toBe(1);

    act(() => result.current.nextPage());
    await waitFor(() =>
      expect(lastRunsUrl().searchParams.get("offset")).toBe("100"),
    );
    expect(lastRunsUrl().searchParams.has("around")).toBe(false);
    expect((global.fetch as jest.Mock).mock.calls.length).toBe(2);
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

describe("useAgentRuns initialOffset", () => {
  /** Renders with a starting page, and lets the filter be changed after. */
  function setupWithInitialOffset(initialOffset: number) {
    return renderHook(
      ({
        filter,
        typeFilter,
      }: {
        filter: RunResultFilter;
        typeFilter?: RunTypeFilter;
      }) =>
        useAgentRuns({
          agentUuid: AGENT_UUID,
          accessToken: "tok",
          pageSize: 50,
          filter,
          typeFilter,
          initialOffset,
        }),
      {
        initialProps: { filter: "all" } as {
          filter: RunResultFilter;
          typeFilter?: RunTypeFilter;
        },
      },
    );
  }

  beforeEach(() => {
    global.fetch = jest.fn(async (url: string) =>
      jsonResponse({
        items: [runA],
        total: 200,
        offset: Number(new URL(url).searchParams.get("offset")),
      }),
    ) as jest.Mock;
  });

  it("starts on the page it was given rather than page one", async () => {
    const { result } = setupWithInitialOffset(50);

    await waitFor(() => expect(result.current.items).toEqual([runA]));
    expect(result.current.offset).toBe(50);
    expect(lastRunsUrl().searchParams.get("offset")).toBe("50");
  });

  it("stays on that page when nothing about the list has changed", async () => {
    const { result, rerender } = setupWithInitialOffset(50);
    await waitFor(() => expect(result.current.offset).toBe(50));

    // Re-rendering on its own must not send the list back to page one —
    // this is what broke the page surviving a reload in development, where
    // React renders and mounts everything an extra time.
    rerender({ filter: "all" });
    rerender({ filter: "all" });

    await waitFor(() => expect(result.current.offset).toBe(50));
    expect(lastRunsUrl().searchParams.get("offset")).toBe("50");
  });

  it("goes back to page one when the filter really does change", async () => {
    const { result, rerender } = setupWithInitialOffset(50);
    await waitFor(() => expect(result.current.offset).toBe(50));

    rerender({ filter: "failed" });

    await waitFor(() => expect(result.current.offset).toBe(0));
    expect(lastRunsUrl().searchParams.get("offset")).toBe("0");
    expect(lastRunsUrl().searchParams.get("has_failures")).toBe("true");
  });

  it("goes back to page one and asks for benchmarks only when that filter changes", async () => {
    const { result, rerender } = setupWithInitialOffset(50);
    await waitFor(() => expect(result.current.offset).toBe(50));
    expect(lastRunsUrl().searchParams.has("type")).toBe(false);

    rerender({ filter: "all", typeFilter: "llm-benchmark" });

    await waitFor(() => expect(result.current.offset).toBe(0));
    expect(lastRunsUrl().searchParams.get("type")).toBe("llm-benchmark");
  });
});

describe("useAgentRuns background refresh", () => {
  const runningRun = {
    uuid: "run-live",
    name: "",
    type: "llm-unit-test",
    status: "in_progress",
  };

  /** Renders the hook and records `isLoading` on every render. */
  function setupRecording(firstPage: unknown[]) {
    global.fetch = jest.fn(async () =>
      jsonResponse({ items: firstPage, total: firstPage.length, offset: 0 }),
    ) as jest.Mock;
    const loadingSeen: boolean[] = [];
    const { result } = renderHook(() => {
      const hook = useAgentRuns({
        agentUuid: AGENT_UUID,
        accessToken: "tok",
        pageSize: 50,
        filter: "all",
        aroundRunId: null,
      });
      loadingSeen.push(hook.isLoading);
      return hook;
    });
    return { result, loadingSeen };
  }

  async function tick() {
    await act(async () => {
      jest.advanceTimersByTime(POLLING_INTERVAL_MS);
    });
  }

  beforeEach(() => {
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it("re-asks for the page, not the runs themselves, while a run is going", async () => {
    const { result } = setupRecording([runningRun]);
    await waitFor(() => expect(result.current.items).toEqual([runningRun]));
    const before = (global.fetch as jest.Mock).mock.calls.length;

    await tick();

    expect((global.fetch as jest.Mock).mock.calls.length).toBe(before + 1);
    expect(lastRunsUrl().pathname).toBe(
      `/agent-tests/agent/${AGENT_UUID}/runs`,
    );
    // The whole point: no run detail is downloaded to learn a status.
    const paths = urls().map((u) => u.pathname);
    expect(
      paths.some(
        (p) =>
          p.startsWith("/agent-tests/run/") ||
          p.startsWith("/agent-tests/benchmark/"),
      ),
    ).toBe(false);
  });

  it("asks for nothing more once every run on the page has finished", async () => {
    const { result } = setupRecording([runA, runB]);
    await waitFor(() => expect(result.current.items).toEqual([runA, runB]));
    const before = (global.fetch as jest.Mock).mock.calls.length;

    await tick();
    await tick();

    expect((global.fetch as jest.Mock).mock.calls.length).toBe(before);
  });

  it("refreshes without putting the list back into loading", async () => {
    const { result, loadingSeen } = setupRecording([runningRun]);
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    loadingSeen.length = 0;

    await tick();

    expect(loadingSeen).not.toContain(true);
    expect(result.current.isLoading).toBe(false);
  });
});
