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

  it("has the saved choice on the very first render, so a list asks once", () => {
    window.localStorage.setItem(KEY, "25");
    const sizes: number[] = [];
    renderHook(() => {
      const [pageSize] = usePageSize();
      sizes.push(pageSize);
      return pageSize;
    });
    // 50 then 25 would mean the list requested the default first and then
    // requested again at the saved size.
    expect(sizes.every((size) => size === 25)).toBe(true);
  });

  it("saves a new choice so the next visit keeps it", () => {
    const { result } = renderHook(() => usePageSize());
    act(() => result.current[1](100));
    expect(result.current[0]).toBe(100);
    expect(window.localStorage.getItem(KEY)).toBe("100");
  });

  it("still works when the browser blocks site data", () => {
    // A browser set to block site data throws on both calls. Forgetting the
    // choice is fine; taking the page down with it is not.
    const blocked = () => {
      throw new DOMException("denied", "SecurityError");
    };
    const getItem = jest
      .spyOn(Storage.prototype, "getItem")
      .mockImplementation(blocked);
    const setItem = jest
      .spyOn(Storage.prototype, "setItem")
      .mockImplementation(blocked);

    const { result } = renderHook(() => usePageSize());
    expect(result.current[0]).toBe(50);

    act(() => result.current[1](25));
    expect(result.current[0]).toBe(25);

    getItem.mockRestore();
    setItem.mockRestore();
  });
});
