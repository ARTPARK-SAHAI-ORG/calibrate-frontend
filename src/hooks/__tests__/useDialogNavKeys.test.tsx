import { fireEvent, renderHook } from "@/test-utils";
import { useDialogNavKeys } from "../useDialogNavKeys";

type Args = Parameters<typeof useDialogNavKeys>[0];

function setup(args: Partial<Args> = {}) {
  const onClose = jest.fn();
  const onPrev = jest.fn();
  const onNext = jest.fn();
  const view = renderHook(() =>
    useDialogNavKeys({
      isOpen: true,
      onClose,
      hasPrev: true,
      onPrev,
      hasNext: true,
      onNext,
      ...args,
    }),
  );
  return { ...view, onClose, onPrev, onNext };
}

/** A focusable element of the given kind, attached to the page. */
function fieldOfType(tag: "input" | "textarea" | "select") {
  const el = document.createElement(tag);
  document.body.appendChild(el);
  return el;
}

afterEach(() => {
  document.body.innerHTML = "";
});

describe("useDialogNavKeys", () => {
  it("steps to the previous and next item with the arrow keys", () => {
    const { onPrev, onNext } = setup();

    fireEvent.keyDown(window, { key: "ArrowLeft" });
    fireEvent.keyDown(window, { key: "ArrowRight" });

    expect(onPrev).toHaveBeenCalledTimes(1);
    expect(onNext).toHaveBeenCalledTimes(1);
  });

  it("does nothing on the arrow keys when there is no previous or next item", () => {
    const { onPrev, onNext } = setup({ hasPrev: false, hasNext: false });

    fireEvent.keyDown(window, { key: "ArrowLeft" });
    fireEvent.keyDown(window, { key: "ArrowRight" });

    expect(onPrev).not.toHaveBeenCalled();
    expect(onNext).not.toHaveBeenCalled();
  });

  it.each(["input", "textarea", "select"] as const)(
    "ignores the arrow keys while the reader is typing in a %s",
    (tag) => {
      const { onPrev, onNext } = setup();
      const field = fieldOfType(tag);

      fireEvent.keyDown(field, { key: "ArrowLeft" });
      fireEvent.keyDown(field, { key: "ArrowRight" });

      expect(onPrev).not.toHaveBeenCalled();
      expect(onNext).not.toHaveBeenCalled();
    },
  );

  it("ignores the arrow keys inside an editable box", () => {
    const { onPrev, onNext } = setup();
    const box = document.createElement("div");
    // jsdom does not work `isContentEditable` out from the attribute.
    Object.defineProperty(box, "isContentEditable", { value: true });
    document.body.appendChild(box);

    fireEvent.keyDown(box, { key: "ArrowLeft" });
    fireEvent.keyDown(box, { key: "ArrowRight" });

    expect(onPrev).not.toHaveBeenCalled();
    expect(onNext).not.toHaveBeenCalled();
  });

  it("closes on Escape when a close was given", () => {
    const { onClose } = setup();

    fireEvent.keyDown(window, { key: "Escape" });

    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("closes on Escape from inside a text field too", () => {
    const { onClose } = setup();

    fireEvent.keyDown(fieldOfType("input"), { key: "Escape" });

    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("does nothing on Escape when no close was given, and still steps", () => {
    const { onPrev, onNext } = setup({ onClose: undefined });

    expect(() => fireEvent.keyDown(window, { key: "Escape" })).not.toThrow();

    fireEvent.keyDown(window, { key: "ArrowLeft" });
    fireEvent.keyDown(window, { key: "ArrowRight" });
    expect(onPrev).toHaveBeenCalledTimes(1);
    expect(onNext).toHaveBeenCalledTimes(1);
  });

  it("ignores every key while the dialog is closed", () => {
    const { onClose, onPrev, onNext } = setup({ isOpen: false });

    fireEvent.keyDown(window, { key: "Escape" });
    fireEvent.keyDown(window, { key: "ArrowLeft" });
    fireEvent.keyDown(window, { key: "ArrowRight" });

    expect(onClose).not.toHaveBeenCalled();
    expect(onPrev).not.toHaveBeenCalled();
    expect(onNext).not.toHaveBeenCalled();
  });

  it("stops listening once the dialog is gone", () => {
    const { unmount, onClose, onPrev, onNext } = setup();

    unmount();
    fireEvent.keyDown(window, { key: "Escape" });
    fireEvent.keyDown(window, { key: "ArrowLeft" });
    fireEvent.keyDown(window, { key: "ArrowRight" });

    expect(onClose).not.toHaveBeenCalled();
    expect(onPrev).not.toHaveBeenCalled();
    expect(onNext).not.toHaveBeenCalled();
  });
});
