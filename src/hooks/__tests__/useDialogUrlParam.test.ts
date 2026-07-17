import { renderHook, act } from "@testing-library/react";
import { useDialogUrlParam } from "@/hooks/useDialogUrlParam";

// Control what useSearchParams returns per-test. The hook uses it only as a
// re-render trigger; the value it acts on is read from window.location, so
// tests keep the two in sync via `setUrl`.
let mockSearch = new URLSearchParams();
jest.mock("next/navigation", () => ({
  __esModule: true,
  useSearchParams: () => mockSearch,
}));

describe("useDialogUrlParam", () => {
  // Point both window.location (what the hook reads) and the useSearchParams
  // mock (what re-triggers the effect) at the same query string.
  const setUrl = (qs: string) => {
    window.history.replaceState(null, "", qs ? `/tests?${qs}` : "/tests");
    mockSearch = new URLSearchParams(qs);
  };

  let pushSpy: jest.SpyInstance;
  let replaceSpy: jest.SpyInstance;

  beforeEach(() => {
    setUrl("");
    pushSpy = jest.spyOn(window.history, "pushState");
    replaceSpy = jest.spyOn(window.history, "replaceState");
  });

  afterEach(() => {
    pushSpy.mockRestore();
    replaceSpy.mockRestore();
  });

  it("calls onOpen with the param value present on mount", () => {
    setUrl("testId=abc");
    const onOpen = jest.fn();
    renderHook(() => useDialogUrlParam({ param: "testId", onOpen }));
    expect(onOpen).toHaveBeenCalledTimes(1);
    expect(onOpen).toHaveBeenCalledWith("abc");
  });

  it("does not call onOpen when the param is absent", () => {
    setUrl("");
    const onOpen = jest.fn();
    renderHook(() => useDialogUrlParam({ param: "testId", onOpen }));
    expect(onOpen).not.toHaveBeenCalled();
  });

  it("does not call onOpen while disabled, then fires when enabled flips true", () => {
    setUrl("testId=abc");
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
    setUrl("testId=abc");
    const onOpen = jest.fn();
    const { rerender } = renderHook(() =>
      useDialogUrlParam({ param: "testId", onOpen }),
    );
    rerender();
    rerender();
    expect(onOpen).toHaveBeenCalledTimes(1);
  });

  it("calls onClose when the param disappears from the URL (Back button)", () => {
    setUrl("testId=abc");
    const onOpen = jest.fn();
    const onClose = jest.fn();
    const { rerender } = renderHook(() =>
      useDialogUrlParam({ param: "testId", onOpen, onClose }),
    );
    expect(onOpen).toHaveBeenCalledTimes(1);

    // Back removes the param.
    setUrl("");
    rerender();
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("does not call onClose on mount when no param was ever present", () => {
    setUrl("");
    const onOpen = jest.fn();
    const onClose = jest.fn();
    renderHook(() => useDialogUrlParam({ param: "testId", onOpen, onClose }));
    expect(onClose).not.toHaveBeenCalled();
  });

  it("re-opens when the param returns (Forward button)", () => {
    setUrl("testId=abc");
    const onOpen = jest.fn();
    const onClose = jest.fn();
    const { rerender } = renderHook(() =>
      useDialogUrlParam({ param: "testId", onOpen, onClose }),
    );
    setUrl("");
    rerender();
    setUrl("testId=abc");
    rerender();
    expect(onOpen).toHaveBeenCalledTimes(2);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("pushes a new history entry when opening so Back can close it", () => {
    const onOpen = jest.fn();
    const { result } = renderHook(() =>
      useDialogUrlParam({ param: "testId", onOpen }),
    );
    act(() => result.current.setParam("xyz"));
    expect(pushSpy).toHaveBeenCalledTimes(1);
    expect(pushSpy.mock.calls[0][2]).toBe("/tests?testId=xyz");
    expect(window.location.search).toBe("?testId=xyz");
  });

  it("replaces in place when closing (no new history entry)", () => {
    setUrl("testId=xyz");
    const onOpen = jest.fn();
    const { result } = renderHook(() =>
      useDialogUrlParam({ param: "testId", onOpen }),
    );
    pushSpy.mockClear();
    replaceSpy.mockClear();
    act(() => result.current.setParam(null));
    expect(pushSpy).not.toHaveBeenCalled();
    expect(replaceSpy).toHaveBeenCalledTimes(1);
    expect(window.location.search).toBe("");
  });

  it("does not write history when the param already matches (shared-link open)", () => {
    setUrl("testId=abc");
    const onOpen = jest.fn();
    const { result } = renderHook(() =>
      useDialogUrlParam({ param: "testId", onOpen }),
    );
    pushSpy.mockClear();
    replaceSpy.mockClear();
    // openEditTest re-writes the same id it was opened with — should be a no-op.
    act(() => result.current.setParam("abc"));
    expect(pushSpy).not.toHaveBeenCalled();
    expect(replaceSpy).not.toHaveBeenCalled();
  });

  it("preserves other existing query params when opening", () => {
    setUrl("tab=tests&foo=bar");
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

  it("does not re-fire onOpen after setParam writes the same value", () => {
    const onOpen = jest.fn();
    const { result, rerender } = renderHook(() =>
      useDialogUrlParam({ param: "testId", onOpen }),
    );
    act(() => result.current.setParam("abc"));
    // A subsequent render where the router snapshot now reflects the write.
    setUrl("testId=abc");
    rerender();
    expect(onOpen).not.toHaveBeenCalled();
  });
});
