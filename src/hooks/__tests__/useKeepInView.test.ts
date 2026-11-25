import { renderHook } from "@testing-library/react";
import { useKeepInView } from "../useKeepInView";

function panelAt(left: number, width: number) {
  const el = document.createElement("div");
  el.getBoundingClientRect = () =>
    ({ left, right: left + width, top: 0, bottom: 0, width, height: 0 }) as DOMRect;
  return { current: el };
}

beforeEach(() => {
  Object.defineProperty(window, "innerWidth", { configurable: true, value: 800 });
});

describe("useKeepInView", () => {
  it("leaves a panel that fits where it is", () => {
    const { result } = renderHook(() => useKeepInView(panelAt(100, 400), true));
    expect(result.current).toBe(0);
  });

  it("moves a panel running past the right edge back inside", () => {
    // 450 + 480 = 930, so it must move left by 930 - (800 - 16) = 146.
    const { result } = renderHook(() => useKeepInView(panelAt(450, 480), true));
    expect(result.current).toBe(-146);
  });

  it("moves a panel running past the left edge back inside", () => {
    const { result } = renderHook(() => useKeepInView(panelAt(-50, 300), true));
    expect(result.current).toBe(66);
  });

  it("keeps the left edge on screen when the panel is wider than the window", () => {
    const { result } = renderHook(() => useKeepInView(panelAt(100, 900), true));
    expect(result.current).toBe(-84);
  });

  it("does not move a closed panel", () => {
    const { result } = renderHook(() => useKeepInView(panelAt(450, 480), false));
    expect(result.current).toBe(0);
  });
});
