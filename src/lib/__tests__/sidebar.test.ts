import { renderHook, act } from "@testing-library/react";
import { useSidebarState } from "../sidebar";

function setInnerWidth(width: number) {
  Object.defineProperty(window, "innerWidth", {
    writable: true,
    configurable: true,
    value: width,
  });
}

describe("useSidebarState", () => {
  const originalWidth = window.innerWidth;

  beforeEach(() => {
    localStorage.clear();
  });

  afterEach(() => {
    setInnerWidth(originalWidth);
  });

  it("initializes open on desktop widths (>=768px)", () => {
    setInnerWidth(1024);
    const { result } = renderHook(() => useSidebarState());
    expect(result.current[0]).toBe(true);
  });

  it("initializes closed on mobile widths (<768px)", () => {
    setInnerWidth(375);
    const { result } = renderHook(() => useSidebarState());
    expect(result.current[0]).toBe(false);
  });

  it("allows manually toggling state after init", () => {
    setInnerWidth(1024);
    const { result } = renderHook(() => useSidebarState());
    expect(result.current[0]).toBe(true);

    act(() => {
      result.current[1](false);
    });

    expect(result.current[0]).toBe(false);
  });

  it("does not re-run initialization on re-render", () => {
    setInnerWidth(1024);
    const { result, rerender } = renderHook(() => useSidebarState());
    act(() => {
      result.current[1](false);
    });
    rerender();
    expect(result.current[0]).toBe(false);
  });

  it("remembers a closed sidebar for the next page", () => {
    setInnerWidth(1024);
    const first = renderHook(() => useSidebarState());
    act(() => {
      first.result.current[1](false);
    });
    expect(localStorage.getItem("sidebarOpen")).toBe("false");

    const second = renderHook(() => useSidebarState());
    expect(second.result.current[0]).toBe(false);
  });

  it("remembers a reopened sidebar on a page that starts closed", () => {
    setInnerWidth(1024);
    const first = renderHook(() => useSidebarState(false));
    expect(first.result.current[0]).toBe(false);
    act(() => {
      first.result.current[1]((prev) => !prev);
    });
    expect(first.result.current[0]).toBe(true);

    const second = renderHook(() => useSidebarState(false));
    expect(second.result.current[0]).toBe(true);
  });

  it("does not save a page's own closed default", () => {
    setInnerWidth(1024);
    renderHook(() => useSidebarState(false));
    expect(localStorage.getItem("sidebarOpen")).toBeNull();
    const other = renderHook(() => useSidebarState());
    expect(other.result.current[0]).toBe(true);
  });

  it("ignores the saved choice on mobile and does not save toggles there", () => {
    localStorage.setItem("sidebarOpen", "true");
    setInnerWidth(375);
    const { result } = renderHook(() => useSidebarState());
    expect(result.current[0]).toBe(false);

    act(() => {
      result.current[1](true);
    });
    expect(result.current[0]).toBe(true);
    expect(localStorage.getItem("sidebarOpen")).toBe("true");
  });

  it("keeps both toggles when two arrive together", () => {
    setInnerWidth(1024);
    const { result } = renderHook(() => useSidebarState());
    act(() => {
      result.current[1]((prev) => !prev);
      result.current[1]((prev) => !prev);
    });
    expect(result.current[0]).toBe(true);
  });

  it("still works when the browser blocks saving", () => {
    setInnerWidth(1024);
    const getItem = jest
      .spyOn(Storage.prototype, "getItem")
      .mockImplementation(() => {
        throw new Error("blocked");
      });
    const setItem = jest
      .spyOn(Storage.prototype, "setItem")
      .mockImplementation(() => {
        throw new Error("blocked");
      });

    try {
      const { result } = renderHook(() => useSidebarState());
      expect(result.current[0]).toBe(true);
      act(() => {
        result.current[1](false);
      });
      expect(result.current[0]).toBe(false);
    } finally {
      getItem.mockRestore();
      setItem.mockRestore();
    }
  });
});
