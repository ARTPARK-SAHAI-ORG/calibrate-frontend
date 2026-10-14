import { renderHook, act } from "@testing-library/react";
import { render, screen, setupUser } from "@/test-utils";
import {
  useUnsavedCloseGuard,
  DiscardChangesDialog,
} from "../unsavedCloseGuard";

describe("useUnsavedCloseGuard", () => {
  function setup(overrides: Partial<Parameters<typeof useUnsavedCloseGuard>[0]> = {}) {
    const onClose = jest.fn();
    const onBeforeClose = jest.fn();
    const props = {
      isOpen: true,
      isDirty: false,
      isEdit: true,
      submitting: false,
      onClose,
      onBeforeClose,
      ...overrides,
    };
    const util = renderHook((p) => useUnsavedCloseGuard(p), { initialProps: props });
    return { util, onClose, onBeforeClose, props };
  }

  it("attemptClose closes immediately when clean", () => {
    const { util, onClose, onBeforeClose } = setup({ isDirty: false });
    act(() => util.result.current.attemptClose());
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(onBeforeClose).toHaveBeenCalledTimes(1);
    expect(util.result.current.discardConfirmOpen).toBe(false);
  });

  it("attemptClose opens discard confirm when dirty", () => {
    const { util, onClose } = setup({ isDirty: true });
    act(() => util.result.current.attemptClose());
    expect(onClose).not.toHaveBeenCalled();
    expect(util.result.current.discardConfirmOpen).toBe(true);
  });

  it("attemptClose does nothing while submitting", () => {
    const { util, onClose } = setup({ isDirty: true, submitting: true });
    act(() => util.result.current.attemptClose());
    expect(onClose).not.toHaveBeenCalled();
    expect(util.result.current.discardConfirmOpen).toBe(false);
  });

  it("closeDiscardConfirm resets the confirm flag", () => {
    const { util } = setup({ isDirty: true });
    act(() => util.result.current.attemptClose());
    expect(util.result.current.discardConfirmOpen).toBe(true);
    act(() => util.result.current.closeDiscardConfirm());
    expect(util.result.current.discardConfirmOpen).toBe(false);
  });

  it("doClose runs onBeforeClose, resets confirm, and calls onClose", () => {
    const { util, onClose, onBeforeClose } = setup({ isDirty: true });
    act(() => util.result.current.attemptClose());
    act(() => util.result.current.doClose());
    expect(onBeforeClose).toHaveBeenCalledTimes(1);
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(util.result.current.discardConfirmOpen).toBe(false);
  });

  it("doClose works without onBeforeClose provided", () => {
    const onClose = jest.fn();
    const util = renderHook((p) => useUnsavedCloseGuard(p), {
      initialProps: {
        isOpen: true,
        isDirty: false,
        isEdit: true,
        submitting: false,
        onClose,
      },
    });
    act(() => util.result.current.doClose());
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("handleBackdropClick routes through attemptClose in edit mode", () => {
    const { util, onClose } = setup({ isEdit: true, isDirty: false });
    act(() => util.result.current.handleBackdropClick());
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("handleBackdropClick is a no-op in add mode", () => {
    const { util, onClose } = setup({ isEdit: false, isDirty: false });
    act(() => util.result.current.handleBackdropClick());
    expect(onClose).not.toHaveBeenCalled();
  });

  it("resets discardConfirmOpen when isOpen toggles", () => {
    const onClose = jest.fn();
    const util = renderHook((p) => useUnsavedCloseGuard(p), {
      initialProps: {
        isOpen: true,
        isDirty: true,
        isEdit: true,
        submitting: false,
        onClose,
      },
    });
    act(() => util.result.current.attemptClose());
    expect(util.result.current.discardConfirmOpen).toBe(true);

    util.rerender({
      isOpen: false,
      isDirty: true,
      isEdit: true,
      submitting: false,
      onClose,
    });
    expect(util.result.current.discardConfirmOpen).toBe(false);

    // Re-render with the same isOpen value again — should not reset/change
    // (covers the branch where isOpen === wasOpen, i.e. no state adjustment).
    util.rerender({
      isOpen: false,
      isDirty: true,
      isEdit: true,
      submitting: false,
      onClose,
    });
    expect(util.result.current.discardConfirmOpen).toBe(false);
  });

  describe("stepping to another item", () => {
    it("steps at once when the form is clean", () => {
      const onNext = jest.fn();
      const { util, onClose } = setup({ onNext, hasNext: true });
      act(() => util.result.current.navNext!());
      expect(onNext).toHaveBeenCalledTimes(1);
      expect(onClose).not.toHaveBeenCalled();
      expect(util.result.current.discardConfirmOpen).toBe(false);
    });

    it("asks first when there are edits, and Discard takes the step instead of closing", () => {
      const onPrev = jest.fn();
      const { util, onClose, onBeforeClose } = setup({
        isDirty: true,
        onPrev,
        hasPrev: true,
      });
      act(() => util.result.current.navPrev!());
      expect(onPrev).not.toHaveBeenCalled();
      expect(util.result.current.discardConfirmOpen).toBe(true);
      act(() => util.result.current.doClose());
      expect(onPrev).toHaveBeenCalledTimes(1);
      expect(onClose).not.toHaveBeenCalled();
      expect(onBeforeClose).not.toHaveBeenCalled();
      expect(util.result.current.discardConfirmOpen).toBe(false);
    });

    it("Keep editing forgets the step, so a later Discard closes", () => {
      const onNext = jest.fn();
      const { util, onClose } = setup({ isDirty: true, onNext, hasNext: true });
      act(() => util.result.current.navNext!());
      act(() => util.result.current.closeDiscardConfirm());
      act(() => util.result.current.attemptClose());
      act(() => util.result.current.doClose());
      expect(onNext).not.toHaveBeenCalled();
      expect(onClose).toHaveBeenCalledTimes(1);
    });

    it("ignores a step while the question is already on screen", () => {
      const onNext = jest.fn();
      const { util, onClose } = setup({ isDirty: true, onNext, hasNext: true });
      act(() => util.result.current.attemptClose());
      act(() => util.result.current.navNext!());
      act(() => util.result.current.doClose());
      expect(onNext).not.toHaveBeenCalled();
      expect(onClose).toHaveBeenCalledTimes(1);
    });

    it("does nothing while saving", () => {
      const onNext = jest.fn();
      const { util } = setup({ submitting: true, onNext, hasNext: true });
      act(() => util.result.current.navNext!());
      expect(onNext).not.toHaveBeenCalled();
    });

    it("gives no step handlers when none are passed", () => {
      const { util } = setup();
      expect(util.result.current.navPrev).toBeUndefined();
      expect(util.result.current.navNext).toBeUndefined();
    });

    it("the left and right arrow keys step too", () => {
      const onPrev = jest.fn();
      const onNext = jest.fn();
      setup({ onPrev, onNext, hasPrev: true, hasNext: true });
      act(() => {
        window.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowRight" }));
      });
      act(() => {
        window.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowLeft" }));
      });
      expect(onNext).toHaveBeenCalledTimes(1);
      expect(onPrev).toHaveBeenCalledTimes(1);
    });
  });
});

describe("DiscardChangesDialog", () => {
  it("renders nothing when closed", () => {
    render(
      <DiscardChangesDialog open={false} onKeepEditing={jest.fn()} onDiscard={jest.fn()} />,
    );
    expect(screen.queryByText("Discard changes?")).not.toBeInTheDocument();
  });

  it("renders the confirmation copy when open", () => {
    render(
      <DiscardChangesDialog open onKeepEditing={jest.fn()} onDiscard={jest.fn()} />,
    );
    expect(screen.getByText("Discard changes?")).toBeInTheDocument();
    expect(
      screen.getByText(/You have unsaved changes/i),
    ).toBeInTheDocument();
  });

  it("calls onKeepEditing when clicking the backdrop", async () => {
    const user = setupUser();
    const onKeepEditing = jest.fn();
    const { container } = render(
      <DiscardChangesDialog open onKeepEditing={onKeepEditing} onDiscard={jest.fn()} />,
    );
    await user.click(container.firstChild as Element);
    expect(onKeepEditing).toHaveBeenCalledTimes(1);
  });

  it("calls onKeepEditing when clicking Keep editing button, without bubbling to backdrop twice", async () => {
    const user = setupUser();
    const onKeepEditing = jest.fn();
    render(
      <DiscardChangesDialog open onKeepEditing={onKeepEditing} onDiscard={jest.fn()} />,
    );
    await user.click(screen.getByRole("button", { name: "Keep editing" }));
    expect(onKeepEditing).toHaveBeenCalledTimes(1);
  });

  it("calls onDiscard when clicking Discard button", async () => {
    const user = setupUser();
    const onDiscard = jest.fn();
    render(
      <DiscardChangesDialog open onKeepEditing={jest.fn()} onDiscard={onDiscard} />,
    );
    await user.click(screen.getByRole("button", { name: "Discard" }));
    expect(onDiscard).toHaveBeenCalledTimes(1);
  });
});
