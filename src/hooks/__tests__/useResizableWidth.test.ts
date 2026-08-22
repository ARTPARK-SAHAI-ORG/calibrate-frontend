import { renderHook, act } from "@testing-library/react";
import { useResizableWidth } from "@/hooks/useResizableWidth";

/** Simulates dragging the handle from `startX` to `endX` in one move. */
function drag(
  startDrag: (e: React.MouseEvent) => void,
  startX: number,
  endX: number,
) {
  act(() => {
    startDrag({
      preventDefault: () => {},
      clientX: startX,
    } as unknown as React.MouseEvent);
  });
  act(() => {
    document.dispatchEvent(
      new MouseEvent("mousemove", { clientX: endX } as MouseEventInit),
    );
  });
}

function release() {
  act(() => {
    document.dispatchEvent(new MouseEvent("mouseup"));
  });
}

describe("useResizableWidth", () => {
  it("starts at the initial width", () => {
    const { result } = renderHook(() => useResizableWidth(320, 240, 560));
    expect(result.current.width).toBe(320);
  });

  it("grows a grow-right panel when dragged right", () => {
    const { result } = renderHook(() =>
      useResizableWidth(320, 240, 560, "grow-right"),
    );
    drag(result.current.startDrag, 100, 150);
    expect(result.current.width).toBe(370);
    release();
  });

  it("shrinks a grow-left panel when dragged right", () => {
    const { result } = renderHook(() =>
      useResizableWidth(512, 320, 720, "grow-left"),
    );
    drag(result.current.startDrag, 100, 150);
    expect(result.current.width).toBe(462);
    release();
  });

  it("clamps to the minimum", () => {
    const { result } = renderHook(() =>
      useResizableWidth(320, 240, 560, "grow-right"),
    );
    drag(result.current.startDrag, 500, 0);
    expect(result.current.width).toBe(240);
    release();
  });

  it("clamps to the maximum", () => {
    const { result } = renderHook(() =>
      useResizableWidth(320, 240, 560, "grow-right"),
    );
    drag(result.current.startDrag, 0, 5000);
    expect(result.current.width).toBe(560);
    release();
  });

  it("stops updating width once mouseup fires", () => {
    const { result } = renderHook(() =>
      useResizableWidth(320, 240, 560, "grow-right"),
    );
    drag(result.current.startDrag, 100, 150);
    expect(result.current.width).toBe(370);
    release();
    act(() => {
      document.dispatchEvent(
        new MouseEvent("mousemove", { clientX: 400 } as MouseEventInit),
      );
    });
    expect(result.current.width).toBe(370);
  });

  it("removes its listeners on unmount", () => {
    const removeSpy = jest.spyOn(document, "removeEventListener");
    const { result, unmount } = renderHook(() =>
      useResizableWidth(320, 240, 560),
    );
    drag(result.current.startDrag, 100, 150);
    unmount();
    expect(removeSpy).toHaveBeenCalledWith("mousemove", expect.any(Function));
    expect(removeSpy).toHaveBeenCalledWith("mouseup", expect.any(Function));
    removeSpy.mockRestore();
  });
});
