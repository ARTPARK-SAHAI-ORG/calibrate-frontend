import { renderHook, act } from "@testing-library/react";
import { useSavedColumnWidth } from "@/hooks/useSavedColumnWidth";

const KEY = "test:column-width";

/** A row from x = 0 to x = 1000, so a mouse at x sits (1000 - x) / 10 percent
 *  from the right edge. */
function pressHandle(startDrag: (e: React.MouseEvent) => void, button = 0) {
  const row = document.createElement("div");
  row.getBoundingClientRect = () =>
    ({ right: 1000, width: 1000 }) as DOMRect;
  const handle = document.createElement("div");
  row.appendChild(handle);
  act(() => {
    startDrag({
      button,
      preventDefault: () => {},
      currentTarget: handle,
    } as unknown as React.MouseEvent);
  });
}

function moveTo(clientX: number) {
  act(() => {
    document.dispatchEvent(new MouseEvent("mousemove", { clientX }));
  });
}

function release() {
  act(() => {
    document.dispatchEvent(new MouseEvent("mouseup"));
  });
}

const setup = () =>
  renderHook(() => useSavedColumnWidth(KEY, 30, 20, 70));

describe("useSavedColumnWidth", () => {
  beforeEach(() => window.localStorage.clear());
  afterEach(() => jest.restoreAllMocks());

  it("starts at the initial width with nothing saved", () => {
    expect(setup().result.current.percent).toBe(30);
  });

  it("starts at the saved width", () => {
    window.localStorage.setItem(KEY, "55");
    expect(setup().result.current.percent).toBe(55);
  });

  it.each(["abc", "", "5", "95"])("ignores the saved value %p", (value) => {
    window.localStorage.setItem(KEY, value);
    expect(setup().result.current.percent).toBe(30);
  });

  it("follows the mouse, measured from the right edge of the row", () => {
    const { result } = setup();
    pressHandle(result.current.startDrag);
    moveTo(600);
    expect(result.current.percent).toBe(40);
    release();
  });

  it("stops at the limits", () => {
    const { result } = setup();
    pressHandle(result.current.startDrag);
    moveTo(990);
    expect(result.current.percent).toBe(20);
    moveTo(10);
    expect(result.current.percent).toBe(70);
    release();
  });

  it("saves when the mouse is released, not while it moves", () => {
    const { result } = setup();
    pressHandle(result.current.startDrag);
    moveTo(600);
    expect(window.localStorage.getItem(KEY)).toBeNull();
    release();
    expect(window.localStorage.getItem(KEY)).toBe("40");
  });

  it("saves nothing when the handle is clicked without moving", () => {
    const { result } = setup();
    pressHandle(result.current.startDrag);
    release();
    expect(window.localStorage.getItem(KEY)).toBeNull();
  });

  it("stops following the mouse once it is released", () => {
    const { result } = setup();
    pressHandle(result.current.startDrag);
    moveTo(600);
    release();
    moveTo(300);
    expect(result.current.percent).toBe(40);
  });

  it("ignores a right-click on the handle", () => {
    const { result } = setup();
    pressHandle(result.current.startDrag, 2);
    moveTo(600);
    expect(result.current.percent).toBe(30);
  });

  it("drops the earlier drag when the handle is pressed again", () => {
    const { result } = setup();
    pressHandle(result.current.startDrag);
    moveTo(600);
    pressHandle(result.current.startDrag);
    release();
    // Only the second press was released, and it never moved: the first
    // press would have saved 40 here had its listeners survived.
    expect(window.localStorage.getItem(KEY)).toBeNull();
  });

  it("still works when the browser blocks saved data", () => {
    jest.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new Error("blocked");
    });
    jest.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("blocked");
    });
    const { result } = setup();
    expect(result.current.percent).toBe(30);
    pressHandle(result.current.startDrag);
    moveTo(600);
    release();
    expect(result.current.percent).toBe(40);
  });

  it("removes its listeners and saves nothing if it unmounts mid-drag", () => {
    const { result, unmount } = setup();
    pressHandle(result.current.startDrag);
    moveTo(600);
    const removeSpy = jest.spyOn(document, "removeEventListener");
    unmount();
    expect(removeSpy).toHaveBeenCalledWith("mousemove", expect.any(Function));
    expect(removeSpy).toHaveBeenCalledWith("mouseup", expect.any(Function));
    release();
    expect(window.localStorage.getItem(KEY)).toBeNull();
  });
});
