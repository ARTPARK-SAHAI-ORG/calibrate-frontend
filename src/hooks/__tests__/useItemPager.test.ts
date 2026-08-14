import { renderHook, act } from "@testing-library/react";
import { useItemPager } from "@/hooks/useItemPager";

/**
 * A list of 12 items held 5 to a page, standing in for a labelling task
 * whose items load a page at a time. `pageStart` is the start of the page
 * the harness HAS; `requested` is the page it has been asked for, which
 * only becomes the page it has once `deliver()` runs. That gap is where
 * the counter and the arrows have to keep counting from the items on
 * screen, so every test drives it explicitly.
 */
const ALL = Array.from({ length: 12 }, (_, i) => ({ uuid: `item-${i + 1}` }));
const PAGE_SIZE = 5;

function setup(startAt = 0, startOpen: string | null = null) {
  const state = {
    pageStart: startAt,
    requested: startAt,
    open: startOpen,
  };
  const view = renderHook(
    (props: { pageStart: number; open: string | null }) =>
      useItemPager({
        items: ALL.slice(props.pageStart, props.pageStart + PAGE_SIZE),
        openUuid: props.open,
        pageStart: props.pageStart,
        pageSize: PAGE_SIZE,
        total: ALL.length,
        onOpen: (uuid) => {
          state.open = uuid;
        },
        onPageStartChange: (start) => {
          state.requested = start;
        },
      }),
    { initialProps: { pageStart: state.pageStart, open: state.open } },
  );
  /** Re-render with what the harness now holds, the way the page would. */
  const sync = () => {
    act(() => {
      view.rerender({ pageStart: state.pageStart, open: state.open });
    });
  };
  /** The page that was asked for finishes loading. */
  const deliver = () => {
    state.pageStart = state.requested;
    sync();
    sync();
  };
  return { view, state, sync, deliver };
}

describe("useItemPager", () => {
  it("counts the open item against the whole list, not the page", () => {
    const { view } = setup(5, "item-6");
    expect(view.result.current.position).toEqual({ index: 5, total: 12 });
  });

  it("steps within the page without moving it", () => {
    const { view, state, sync } = setup(0, "item-2");
    act(() => view.result.current.next());
    expect(state.open).toBe("item-3");
    expect(state.requested).toBe(0);
    sync();
    expect(view.result.current.position).toEqual({ index: 2, total: 12 });
  });

  it("opens the first item of the next page when stepping past the end", () => {
    const { view, state, deliver } = setup(0, "item-5");
    act(() => view.result.current.next());
    // The page has been asked for; the item on screen has not changed yet.
    expect(state.requested).toBe(5);
    expect(state.open).toBe("item-5");
    deliver();
    expect(state.open).toBe("item-6");
    expect(view.result.current.position).toEqual({ index: 5, total: 12 });
  });

  it("opens the last item of the previous page when stepping back past the start", () => {
    const { view, state, deliver } = setup(5, "item-6");
    act(() => view.result.current.prev());
    expect(state.requested).toBe(0);
    deliver();
    expect(state.open).toBe("item-5");
    expect(view.result.current.position).toEqual({ index: 4, total: 12 });
  });

  it("does not skip a page when next is pressed again before the page arrives", () => {
    const { view, state, deliver } = setup(0, "item-5");
    act(() => view.result.current.next());
    act(() => view.result.current.next());
    expect(state.requested).toBe(5);
    deliver();
    expect(state.open).toBe("item-6");
  });

  it("keeps the counter on the item on screen while the next page loads", () => {
    const { view } = setup(0, "item-5");
    act(() => view.result.current.next());
    expect(view.result.current.position).toEqual({ index: 4, total: 12 });
  });

  it("drops a step that has not landed when another item is opened", () => {
    const { view, state, deliver } = setup(0, "item-5");
    act(() => view.result.current.next());
    act(() => view.result.current.open("item-3"));
    deliver();
    expect(state.open).toBe("item-3");
  });

  it("drops a step that has not landed when the item view is closed", () => {
    const { view, state, deliver } = setup(0, "item-5");
    act(() => view.result.current.next());
    act(() => view.result.current.cancel());
    deliver();
    expect(state.open).toBe("item-5");
  });

  it("has no previous on the first item and no next on the last", () => {
    const first = setup(0, "item-1");
    expect(first.view.result.current.hasPrev).toBe(false);
    expect(first.view.result.current.hasNext).toBe(true);

    const last = setup(10, "item-12");
    expect(last.view.result.current.hasPrev).toBe(true);
    expect(last.view.result.current.hasNext).toBe(false);
  });

  it("offers both arrows at the edges of a middle page", () => {
    const { view } = setup(5, "item-6");
    expect(view.result.current.hasPrev).toBe(true);
    expect(view.result.current.hasNext).toBe(true);
  });

  it("does nothing when no item is open", () => {
    const { view, state } = setup(0, null);
    expect(view.result.current.hasPrev).toBe(false);
    expect(view.result.current.hasNext).toBe(false);
    expect(view.result.current.position).toBeUndefined();
    act(() => view.result.current.next());
    act(() => view.result.current.prev());
    expect(state.requested).toBe(0);
    expect(state.open).toBeNull();
  });

  it("does nothing when the open item is no longer in the list", () => {
    const { view, state } = setup(0, "item-99");
    expect(view.result.current.position).toBeUndefined();
    act(() => view.result.current.next());
    expect(state.requested).toBe(0);
  });

  it("waits for the page it asked for, not the next page to arrive", () => {
    const { view, state } = setup(0, "item-5");
    act(() => view.result.current.next());
    // A refresh of the page still on screen must not open anything.
    act(() => view.rerender({ pageStart: 0, open: state.open }));
    expect(state.open).toBe("item-5");
  });
});
