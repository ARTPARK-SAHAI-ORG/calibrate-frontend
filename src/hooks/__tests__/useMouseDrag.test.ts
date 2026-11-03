import { renderHook, act } from "@testing-library/react";
import { useMouseDrag } from "@/hooks/useMouseDrag";

function press(
  begin: ReturnType<typeof useMouseDrag>,
  onMove: (ev: MouseEvent) => void,
  onRelease?: () => void,
  init: { button?: number; ctrlKey?: boolean } = {},
) {
  const preventDefault = jest.fn();
  act(() => {
    begin(
      { button: 0, ctrlKey: false, ...init, preventDefault } as unknown as React.MouseEvent,
      onMove,
      onRelease,
    );
  });
  return preventDefault;
}

const move = () => document.dispatchEvent(new MouseEvent("mousemove"));
const up = () => document.dispatchEvent(new MouseEvent("mouseup"));

describe("useMouseDrag", () => {
  it("reports every movement until the button comes up, then the release", () => {
    const { result } = renderHook(() => useMouseDrag());
    const onMove = jest.fn();
    const onRelease = jest.fn();
    const preventDefault = press(result.current, onMove, onRelease);
    expect(preventDefault).toHaveBeenCalled();

    move();
    move();
    expect(onMove).toHaveBeenCalledTimes(2);
    expect(onRelease).not.toHaveBeenCalled();

    up();
    expect(onRelease).toHaveBeenCalledTimes(1);
    move();
    up();
    expect(onMove).toHaveBeenCalledTimes(2);
    expect(onRelease).toHaveBeenCalledTimes(1);
  });

  it("works with no release step", () => {
    const { result } = renderHook(() => useMouseDrag());
    const onMove = jest.fn();
    press(result.current, onMove);
    expect(up).not.toThrow();
    move();
    expect(onMove).not.toHaveBeenCalled();
  });

  it.each([
    ["a right-click", { button: 2 }],
    ["a Control-click", { ctrlKey: true }],
  ])("ignores %s and leaves the browser menu alone", (_name, init) => {
    const { result } = renderHook(() => useMouseDrag());
    const onMove = jest.fn();
    const preventDefault = press(result.current, onMove, undefined, init);
    move();
    expect(onMove).not.toHaveBeenCalled();
    expect(preventDefault).not.toHaveBeenCalled();
  });

  it("ends an earlier drag without its release step when pressed again", () => {
    const { result } = renderHook(() => useMouseDrag());
    const firstMove = jest.fn();
    const firstRelease = jest.fn();
    press(result.current, firstMove, firstRelease);
    const secondMove = jest.fn();
    press(result.current, secondMove);

    move();
    up();
    expect(firstMove).not.toHaveBeenCalled();
    expect(firstRelease).not.toHaveBeenCalled();
    expect(secondMove).toHaveBeenCalledTimes(1);
  });

  it("ends the drag without its release step on unmount", () => {
    const { result, unmount } = renderHook(() => useMouseDrag());
    const onMove = jest.fn();
    const onRelease = jest.fn();
    press(result.current, onMove, onRelease);
    unmount();

    move();
    up();
    expect(onMove).not.toHaveBeenCalled();
    expect(onRelease).not.toHaveBeenCalled();
  });
});
