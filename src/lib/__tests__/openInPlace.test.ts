import type { MouseEvent } from "react";
import { openInPlace } from "../openInPlace";

function click(overrides: Partial<MouseEvent> = {}) {
  return {
    button: 0,
    metaKey: false,
    ctrlKey: false,
    shiftKey: false,
    altKey: false,
    preventDefault: jest.fn(),
    ...overrides,
  } as unknown as MouseEvent;
}

describe("openInPlace", () => {
  it("opens in place on a plain left click", () => {
    const e = click();
    const open = jest.fn();
    openInPlace(e, open);
    expect(open).toHaveBeenCalled();
    expect(e.preventDefault).toHaveBeenCalled();
  });

  it.each([
    ["middle click", { button: 1 }],
    ["cmd click", { metaKey: true }],
    ["ctrl click", { ctrlKey: true }],
    ["shift click", { shiftKey: true }],
    ["alt click", { altKey: true }],
  ])("leaves a %s to the browser", (_, overrides) => {
    const e = click(overrides);
    const open = jest.fn();
    openInPlace(e, open);
    expect(open).not.toHaveBeenCalled();
    expect(e.preventDefault).not.toHaveBeenCalled();
  });
});
