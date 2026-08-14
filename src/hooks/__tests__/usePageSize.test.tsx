import { renderHook, act } from "@testing-library/react";
import { usePageSize } from "@/hooks/usePageSize";

const KEY = "calibrate:items-page-size";

beforeEach(() => {
  window.localStorage.clear();
});

describe("usePageSize", () => {
  it("starts at 50 when nothing is saved", () => {
    const { result } = renderHook(() => usePageSize());
    expect(result.current[0]).toBe(50);
  });

  it("uses the saved choice", () => {
    window.localStorage.setItem(KEY, "25");
    const { result } = renderHook(() => usePageSize());
    expect(result.current[0]).toBe(25);
  });

  it("ignores a saved value that is not one of the options", () => {
    window.localStorage.setItem(KEY, "banana");
    const { result } = renderHook(() => usePageSize());
    expect(result.current[0]).toBe(50);

    window.localStorage.setItem(KEY, "37");
    const second = renderHook(() => usePageSize());
    expect(second.result.current[0]).toBe(50);
  });

  it("saves a new choice so the next visit keeps it", () => {
    const { result } = renderHook(() => usePageSize());
    act(() => result.current[1](100));
    expect(result.current[0]).toBe(100);
    expect(window.localStorage.getItem(KEY)).toBe("100");
  });
});
