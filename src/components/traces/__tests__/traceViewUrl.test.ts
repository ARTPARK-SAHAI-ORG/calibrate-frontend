import { act, renderHook } from "@/test-utils";
import {
  EMPTY_TRACE_VIEW,
  readTraceView,
  useTraceView,
  writeTraceView,
} from "@/components/traces/traceViewUrl";

function setSearch(search: string) {
  window.history.replaceState(null, "", `/agents/a-1${search}`);
}

beforeEach(() => setSearch(""));

describe("readTraceView", () => {
  it("reads back every choice, including several labels and several scores", () => {
    setSearch(
      "?output=tool_call&label=production&label=staging" +
        "&score=ev-1%3Afailed&score=ev-2%3A%3C%3D2&sort=ev-2&dir=desc",
    );

    expect(readTraceView()).toEqual({
      outputType: "tool_call",
      labels: ["production", "staging"],
      scores: { "ev-1": "failed", "ev-2": "<=2" },
      sortByEvaluator: "ev-2",
      sortOrder: "desc",
    });
  });

  it("falls back to everything, newest first, when the address says nothing", () => {
    expect(readTraceView()).toEqual(EMPTY_TRACE_VIEW);
  });

  it("shows every kind when the output is missing or not one of the two", () => {
    setSearch("?output=banana&sort=ev-1");

    const view = readTraceView();
    expect(view.outputType).toBe("all");
    // No direction on the address, so the scores run lowest first.
    expect(view.sortOrder).toBe("asc");
    expect(view.sortByEvaluator).toBe("ev-1");
  });

  it("ignores a score with no colon or no condition", () => {
    setSearch("?score=ev-1&score=%3Apassed&score=ev-2%3A&score=ev-3%3Apassed");

    expect(readTraceView().scores).toEqual({ "ev-3": "passed" });
  });
});

describe("writeTraceView", () => {
  it("writes only the choices that are on", () => {
    writeTraceView({
      outputType: "response",
      labels: ["production"],
      scores: { "ev-1": ">=4" },
      sortByEvaluator: null,
      sortOrder: "desc",
    });

    const params = new URLSearchParams(window.location.search);
    expect(params.get("output")).toBe("response");
    expect(params.getAll("label")).toEqual(["production"]);
    expect(params.getAll("score")).toEqual(["ev-1:>=4"]);
    // Nothing is sorted, so neither the evaluator nor its direction is written.
    expect(params.get("sort")).toBeNull();
    expect(params.get("dir")).toBeNull();
  });

  it("leaves the rest of the address alone", () => {
    setSearch("?tab=monitoring&traceId=tr-9");

    writeTraceView({
      ...EMPTY_TRACE_VIEW,
      outputType: "response",
      sortByEvaluator: "ev-1",
      sortOrder: "desc",
    });

    const params = new URLSearchParams(window.location.search);
    expect(params.get("tab")).toBe("monitoring");
    expect(params.get("traceId")).toBe("tr-9");
    expect(params.get("output")).toBe("response");
    expect(params.get("sort")).toBe("ev-1");
    expect(params.get("dir")).toBe("desc");
  });

  it("takes a filter off the address once it is turned off", () => {
    setSearch(
      "?tab=monitoring&output=response&label=staging&score=ev-1%3Afailed&sort=ev-1&dir=desc",
    );

    writeTraceView(EMPTY_TRACE_VIEW);

    expect(window.location.search).toBe("?tab=monitoring");
  });

  it("leaves a bare address when the last choice goes", () => {
    writeTraceView({ ...EMPTY_TRACE_VIEW, outputType: "response" });
    writeTraceView(EMPTY_TRACE_VIEW);

    expect(window.location.search).toBe("");
    expect(window.location.pathname).toBe("/agents/a-1");
  });

  it("round-trips what it wrote", () => {
    const view = {
      outputType: "tool_call" as const,
      labels: ["a", "b"],
      scores: { "ev-1": "passed", "ev-2": "<=3" },
      sortByEvaluator: "ev-1",
      sortOrder: "desc" as const,
    };

    writeTraceView(view);

    expect(readTraceView()).toEqual(view);
  });
});

describe("useTraceView", () => {
  it("starts from the address bar", () => {
    setSearch(
      "?output=response&label=staging&score=ev-1%3Afailed&sort=ev-1&dir=desc",
    );

    const { result } = renderHook(() => useTraceView());

    expect(result.current[0]).toEqual({
      outputType: "response",
      labels: ["staging"],
      scores: { "ev-1": "failed" },
      sortByEvaluator: "ev-1",
      sortOrder: "desc",
    });
  });

  it("writes a change to the address, keeping the choices already made", () => {
    setSearch("?tab=monitoring&output=response");

    const { result } = renderHook(() => useTraceView());
    act(() =>
      result.current[1]({ sortByEvaluator: "ev-2", sortOrder: "desc" }),
    );

    expect(result.current[0]).toEqual({
      ...EMPTY_TRACE_VIEW,
      outputType: "response",
      sortByEvaluator: "ev-2",
      sortOrder: "desc",
    });
    const params = new URLSearchParams(window.location.search);
    expect(params.get("tab")).toBe("monitoring");
    expect(params.get("output")).toBe("response");
    expect(params.get("sort")).toBe("ev-2");
    expect(params.get("dir")).toBe("desc");
  });
});

it("survives a label carrying a comma or an ampersand", () => {
  writeTraceView({ ...EMPTY_TRACE_VIEW, labels: ["a,b", "prod&test"] });

  expect(readTraceView().labels).toEqual(["a,b", "prod&test"]);
});

it("leaves the address alone when there is nothing to write", () => {
  window.history.replaceState(
    null,
    "",
    "/agents/a1?tab=monitoring&traceId=tr-9",
  );

  writeTraceView(EMPTY_TRACE_VIEW);

  expect(window.location.search).toBe("?tab=monitoring&traceId=tr-9");
});

it("keeps the part of the address after a hash", () => {
  window.history.replaceState(null, "", "/agents/a1#top");

  writeTraceView({ ...EMPTY_TRACE_VIEW, outputType: "response" });

  expect(window.location.hash).toBe("#top");
});
