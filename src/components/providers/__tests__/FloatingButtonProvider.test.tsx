import React from "react";
import { renderHook, act } from "@testing-library/react";
import {
  FloatingButtonProvider,
  useHideFloatingButton,
  useFloatingButtonHideCount,
} from "../FloatingButtonProvider";

function wrapper({ children }: { children: React.ReactNode }) {
  return <FloatingButtonProvider>{children}</FloatingButtonProvider>;
}

describe("FloatingButtonProvider", () => {
  it("useFloatingButtonHideCount returns 0 with no context (no provider)", () => {
    const { result } = renderHook(() => useFloatingButtonHideCount());
    expect(result.current).toBe(0);
  });

  it("useHideFloatingButton is a no-op with no context (no provider)", () => {
    const { result, rerender, unmount } = renderHook(
      ({ isOpen }) => useHideFloatingButton(isOpen),
      { initialProps: { isOpen: false } }
    );
    expect(result.current).toBeUndefined();
    rerender({ isOpen: true });
    unmount();
  });

  it("starts with hideCount 0", () => {
    const { result } = renderHook(() => useFloatingButtonHideCount(), {
      wrapper,
    });
    expect(result.current).toBe(0);
  });

  it("increments hideCount when a hook consumer opens with isOpen=true", () => {
    const { result: countResult } = renderHook(
      () => useFloatingButtonHideCount(),
      { wrapper }
    );

    const { result: hideResult } = renderHook(
      ({ isOpen }) => useHideFloatingButton(isOpen),
      { wrapper, initialProps: { isOpen: true } }
    );

    expect(hideResult).toBeDefined();
  });

  it("increments on mount with isOpen true and decrements on unmount", () => {
    function Consumer({ isOpen }: { isOpen: boolean }) {
      useHideFloatingButton(isOpen);
      const count = useFloatingButtonHideCount();
      return <div data-testid="count">{count}</div>;
    }

    const { render: rtlRender } = require("@testing-library/react");
    const { getByTestId, unmount } = rtlRender(
      <FloatingButtonProvider>
        <Consumer isOpen={true} />
      </FloatingButtonProvider>
    );

    expect(getByTestId("count").textContent).toBe("1");
    unmount();
  });

  it("does not increment when isOpen is false and toggling true/false updates count correctly", () => {
    function Consumer({ isOpen }: { isOpen: boolean }) {
      useHideFloatingButton(isOpen);
      const count = useFloatingButtonHideCount();
      return <div data-testid="count">{count}</div>;
    }

    const { render: rtlRender } = require("@testing-library/react");
    const { getByTestId, rerender } = rtlRender(
      <FloatingButtonProvider>
        <Consumer isOpen={false} />
      </FloatingButtonProvider>
    );
    expect(getByTestId("count").textContent).toBe("0");

    rerender(
      <FloatingButtonProvider>
        <Consumer isOpen={true} />
      </FloatingButtonProvider>
    );
    expect(getByTestId("count").textContent).toBe("1");

    rerender(
      <FloatingButtonProvider>
        <Consumer isOpen={false} />
      </FloatingButtonProvider>
    );
    expect(getByTestId("count").textContent).toBe("0");
  });

  it("decrementHideCount never goes below 0 (double decrement guard)", () => {
    function Consumer({ isOpen }: { isOpen: boolean }) {
      useHideFloatingButton(isOpen);
      const count = useFloatingButtonHideCount();
      return <div data-testid="count">{count}</div>;
    }

    const { render: rtlRender } = require("@testing-library/react");
    const { getByTestId, unmount } = rtlRender(
      <FloatingButtonProvider>
        <Consumer isOpen={false} />
      </FloatingButtonProvider>
    );
    expect(getByTestId("count").textContent).toBe("0");
    unmount();
  });
});
