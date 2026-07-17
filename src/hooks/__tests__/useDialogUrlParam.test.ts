import { renderHook, act } from "@testing-library/react";
import { useDialogUrlParam } from "@/hooks/useDialogUrlParam";

// Control what useSearchParams returns per-test. The global jest.setup mock
// returns an empty URLSearchParams; here we override it so we can drive the
// deep-link read path.
let mockSearch = new URLSearchParams();
jest.mock("next/navigation", () => ({
  __esModule: true,
  useSearchParams: () => mockSearch,
}));

describe("useDialogUrlParam", () => {
  const setSearch = (qs: string) => {
    mockSearch = new URLSearchParams(qs);
  };

  beforeEach(() => {
    setSearch("");
    // Reset the jsdom URL between tests.
    window.history.replaceState(null, "", "/tests");
  });

  it("calls onOpen with the param value present on mount", () => {
    setSearch("testId=abc");
    const onOpen = jest.fn();
    renderHook(() => useDialogUrlParam({ param: "testId", onOpen }));
    expect(onOpen).toHaveBeenCalledTimes(1);
    expect(onOpen).toHaveBeenCalledWith("abc");
  });

  it("does not call onOpen when the param is absent", () => {
    setSearch("");
    const onOpen = jest.fn();
    renderHook(() => useDialogUrlParam({ param: "testId", onOpen }));
    expect(onOpen).not.toHaveBeenCalled();
  });

  it("does not call onOpen while disabled, then fires when enabled flips true", () => {
    setSearch("testId=abc");
    const onOpen = jest.fn();
    const { rerender } = renderHook(
      ({ enabled }) => useDialogUrlParam({ param: "testId", enabled, onOpen }),
      { initialProps: { enabled: false } },
    );
    expect(onOpen).not.toHaveBeenCalled();
    rerender({ enabled: true });
    expect(onOpen).toHaveBeenCalledWith("abc");
  });

  it("only opens once per value across re-renders", () => {
    setSearch("testId=abc");
    const onOpen = jest.fn();
    const { rerender } = renderHook(() =>
      useDialogUrlParam({ param: "testId", onOpen }),
    );
    rerender();
    rerender();
    expect(onOpen).toHaveBeenCalledTimes(1);
  });

  it("resets its guard when the param is removed, so re-adding it re-opens", () => {
    setSearch("testId=abc");
    const onOpen = jest.fn();
    const { rerender } = renderHook(() =>
      useDialogUrlParam({ param: "testId", onOpen }),
    );
    expect(onOpen).toHaveBeenCalledTimes(1);

    // Param removed from the URL (e.g. dialog closed elsewhere / navigated).
    setSearch("");
    rerender();
    expect(onOpen).toHaveBeenCalledTimes(1);

    // Re-adding the same value opens again (the guard was reset on removal).
    setSearch("testId=abc");
    rerender();
    expect(onOpen).toHaveBeenCalledTimes(2);
  });

  it("setParam(value) writes the param to the URL without a router navigation", () => {
    const onOpen = jest.fn();
    const { result } = renderHook(() =>
      useDialogUrlParam({ param: "testId", onOpen }),
    );
    act(() => result.current.setParam("xyz"));
    expect(window.location.search).toBe("?testId=xyz");
    expect(window.location.pathname).toBe("/tests");
  });

  it("setParam(null) removes the param and drops the query string when empty", () => {
    window.history.replaceState(null, "", "/tests?testId=xyz");
    const onOpen = jest.fn();
    const { result } = renderHook(() =>
      useDialogUrlParam({ param: "testId", onOpen }),
    );
    act(() => result.current.setParam(null));
    expect(window.location.search).toBe("");
    expect(window.location.pathname).toBe("/tests");
  });

  it("setParam preserves other existing query params", () => {
    window.history.replaceState(null, "", "/tests?tab=tests&foo=bar");
    const onOpen = jest.fn();
    const { result } = renderHook(() =>
      useDialogUrlParam({ param: "testId", onOpen }),
    );
    act(() => result.current.setParam("abc"));
    const params = new URLSearchParams(window.location.search);
    expect(params.get("tab")).toBe("tests");
    expect(params.get("foo")).toBe("bar");
    expect(params.get("testId")).toBe("abc");
  });

  it("does not re-fire onOpen when the URL changes to a value already written via setParam", () => {
    const onOpen = jest.fn();
    const { result, rerender } = renderHook(() =>
      useDialogUrlParam({ param: "testId", onOpen }),
    );
    act(() => result.current.setParam("abc"));
    // Simulate a subsequent render where searchParams now reflects the value
    // we just wrote (e.g. a router-driven update to the same id).
    setSearch("testId=abc");
    rerender();
    expect(onOpen).not.toHaveBeenCalled();
  });
});
