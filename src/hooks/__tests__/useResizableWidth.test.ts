import { renderHook, act } from "@testing-library/react";
import { useResizableWidth } from "@/hooks/useResizableWidth";

function press(
  startDrag: (e: React.MouseEvent) => void,
  clientX: number,
  button = 0,
) {
  act(() => {
    startDrag({
      button,
      preventDefault: () => {},
      clientX,
    } as unknown as React.MouseEvent);
  });
}

function moveTo(clientX: number) {
  act(() => {
    document.dispatchEvent(
      new MouseEvent("mousemove", { clientX } as MouseEventInit),
    );
  });
}

/** Simulates dragging the handle from `startX` to `endX` in one move. */
function drag(
  startDrag: (e: React.MouseEvent) => void,
  startX: number,
  endX: number,
) {
  press(startDrag, startX);
  moveTo(endX);
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

  it("measures each move from where the drag started", () => {
    const { result } = renderHook(() =>
      useResizableWidth(320, 240, 560, "grow-right"),
    );
    drag(result.current.startDrag, 100, 150);
    moveTo(160);
    expect(result.current.width).toBe(380);
    release();
  });

  it("stops updating width once mouseup fires", () => {
    const { result } = renderHook(() =>
      useResizableWidth(320, 240, 560, "grow-right"),
    );
    drag(result.current.startDrag, 100, 150);
    expect(result.current.width).toBe(370);
    release();
    moveTo(400);
    expect(result.current.width).toBe(370);
  });

  it("ignores a right-click on the handle", () => {
    const { result } = renderHook(() => useResizableWidth(320, 240, 560));
    press(result.current.startDrag, 100, 2);
    moveTo(150);
    expect(result.current.width).toBe(320);
  });

  it("drops the earlier drag when the handle is pressed again", () => {
    const { result } = renderHook(() => useResizableWidth(320, 240, 560));
    drag(result.current.startDrag, 100, 150);
    const removeSpy = jest.spyOn(document, "removeEventListener");
    press(result.current.startDrag, 150);
    expect(removeSpy).toHaveBeenCalledWith("mousemove", expect.any(Function));
    removeSpy.mockRestore();
    moveTo(160);
    expect(result.current.width).toBe(380);
    release();
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
