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
});
