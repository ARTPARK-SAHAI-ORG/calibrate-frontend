import { fireEvent, render, screen, setupUser, waitFor } from "@/test-utils";
import { Tooltip } from "../Tooltip";

describe("Tooltip", () => {
  it("does not render the tooltip content initially", () => {
    render(
      <Tooltip content="Hello there">
        <button>Trigger</button>
      </Tooltip>,
    );
    expect(screen.queryByText("Hello there")).not.toBeInTheDocument();
  });

  it("shows the tooltip content on mouse enter and hides on mouse leave", async () => {
    const user = setupUser();
    render(
      <Tooltip content="Hello there">
        <button>Trigger</button>
      </Tooltip>,
    );

    await user.hover(screen.getByText("Trigger"));
    expect(await screen.findByText("Hello there")).toBeInTheDocument();

    await user.unhover(screen.getByText("Trigger"));
    await waitFor(() =>
      expect(screen.queryByText("Hello there")).not.toBeInTheDocument(),
    );
  });

  it("keeps the tooltip open while the pointer is inside it", async () => {
    const user = setupUser();
    render(
      <Tooltip content={<a href="/somewhere">Reachable link</a>}>
        <button>Trigger</button>
      </Tooltip>,
    );

    await user.hover(screen.getByText("Trigger"));
    const link = await screen.findByText("Reachable link");

    // The popup must accept the pointer at all: jsdom does not enforce
    // pointer-events, so the class is checked directly.
    expect(link.closest("div.fixed")?.className).not.toContain(
      "pointer-events-none",
    );

    // Leaving the trigger for the popup itself must not close it.
    await user.unhover(screen.getByText("Trigger"));
    await user.hover(link);
    await new Promise((resolve) => setTimeout(resolve, 300));
    expect(screen.getByText("Reachable link")).toBeInTheDocument();

    // Leaving the popup closes it.
    await user.unhover(link);
    await waitFor(() =>
      expect(screen.queryByText("Reachable link")).not.toBeInTheDocument(),
    );
  });

  it("lets a click inside the popup reach what was clicked", async () => {
    // Closing the popup the moment the click starts pulls the button out of
    // the page before its own handler runs, and in a browser nothing happens.
    const user = setupUser();
    const onPick = jest.fn();
    render(
      <Tooltip
        content={
          <button type="button" onClick={onPick}>
            Pick me
          </button>
        }
      >
        <span>Trigger</span>
      </Tooltip>,
    );

    await user.hover(screen.getByText("Trigger"));
    const pick = await screen.findByText("Pick me");

    fireEvent.click(pick);
    expect(onPick).toHaveBeenCalledTimes(1);
    // Still on screen right after the click, not torn down during it.
    expect(screen.queryByText("Pick me")).toBeInTheDocument();

    // It does close, just a moment later.
    await waitFor(() =>
      expect(screen.queryByText("Pick me")).not.toBeInTheDocument(),
    );
  });

  it("hides the tooltip on click (onClickCapture)", async () => {
    const user = setupUser();
    render(
      <Tooltip content="Hello there">
        <button>Trigger</button>
      </Tooltip>,
    );

    await user.hover(screen.getByText("Trigger"));
    expect(await screen.findByText("Hello there")).toBeInTheDocument();

    await user.click(screen.getByText("Trigger"));
    await waitFor(() =>
      expect(screen.queryByText("Hello there")).not.toBeInTheDocument(),
    );
  });

  it.each(["top", "bottom", "left", "right"] as const)(
    "renders with position=%s and recalculates on scroll/resize",
    async (position) => {
      const user = setupUser();
      render(
        <Tooltip content="Positioned tip" position={position}>
          <button>Trigger</button>
        </Tooltip>,
      );

      await user.hover(screen.getByText("Trigger"));
      expect(await screen.findByText("Positioned tip")).toBeInTheDocument();

      // Exercise the scroll/resize listeners registered while visible.
      window.dispatchEvent(new Event("scroll"));
      window.dispatchEvent(new Event("resize"));

      expect(screen.getByText("Positioned tip")).toBeInTheDocument();
    },
  );

  it("applies a custom className to the trigger wrapper", () => {
    render(
      <Tooltip content="Hello there" className="my-extra-class">
        <button>Trigger</button>
      </Tooltip>,
    );
    expect(screen.getByText("Trigger").parentElement?.className).toContain(
      "my-extra-class",
    );
  });

  it("clamps position near viewport edges", async () => {
    const user = setupUser();
    render(
      <div style={{ position: "absolute", top: 0, left: 0 }}>
        <Tooltip content="Edge tip" position="top">
          <button>EdgeTrigger</button>
        </Tooltip>
      </div>,
    );

    await user.hover(screen.getByText("EdgeTrigger"));
    expect(await screen.findByText("Edge tip")).toBeInTheDocument();
  });

  it("drops below the trigger when there is no room above it", async () => {
    const user = setupUser();
    // A trigger 10px from the top of the window, as in the app's top bar.
    const rectSpy = jest
      .spyOn(HTMLDivElement.prototype, "getBoundingClientRect")
      .mockReturnValue({
        top: 10,
        bottom: 30,
        left: 200,
        right: 300,
        width: 100,
        height: 20,
        x: 200,
        y: 10,
        toJSON: () => {},
      } as DOMRect);

    render(
      <Tooltip content="Flipped tip" position="top">
        <button>TopBarTrigger</button>
      </Tooltip>,
    );

    await user.hover(screen.getByText("TopBarTrigger"));
    const popup = await screen.findByText("Flipped tip");

    // The arrow sits on the popup's top edge, pointing up at the trigger,
    // and the popup itself starts below the trigger.
    const arrow = popup.querySelector("div.absolute");
    expect(arrow?.className).toContain("bottom-full");
    expect(arrow?.className).not.toContain("top-full");
    const box = popup.closest("div.fixed") as HTMLElement;
    expect(parseFloat(box.style.top)).toBeGreaterThanOrEqual(30);

    rectSpy.mockRestore();
  });

  it("stays above the trigger when there is room above it", async () => {
    const user = setupUser();
    const rectSpy = jest
      .spyOn(HTMLDivElement.prototype, "getBoundingClientRect")
      .mockReturnValue({
        top: 400,
        bottom: 420,
        left: 200,
        right: 300,
        width: 100,
        height: 20,
        x: 200,
        y: 400,
        toJSON: () => {},
      } as DOMRect);

    render(
      <Tooltip content="Upward tip" position="top">
        <button>MidPageTrigger</button>
      </Tooltip>,
    );

    await user.hover(screen.getByText("MidPageTrigger"));
    const popup = await screen.findByText("Upward tip");
    expect(popup.querySelector("div.absolute")?.className).toContain(
      "top-full",
    );

    rectSpy.mockRestore();
  });

  it("clamps horizontal position for a right-positioned tooltip overflowing the viewport", async () => {
    const user = setupUser();
    const rectSpy = jest
      .spyOn(HTMLDivElement.prototype, "getBoundingClientRect")
      .mockReturnValue({
        top: 0,
        bottom: window.innerHeight,
        left: 0,
        right: window.innerWidth,
        width: 0,
        height: 0,
        x: 0,
        y: 0,
        toJSON: () => {},
      } as DOMRect);

    render(
      <Tooltip content="Right edge tip" position="right">
        <button>RightTrigger</button>
      </Tooltip>,
    );

    await user.hover(screen.getByText("RightTrigger"));
    expect(await screen.findByText("Right edge tip")).toBeInTheDocument();

    rectSpy.mockRestore();
  });

  it("clamps vertical position for a bottom-positioned tooltip overflowing the viewport", async () => {
    const user = setupUser();
    const rectSpy = jest
      .spyOn(HTMLDivElement.prototype, "getBoundingClientRect")
      .mockReturnValue({
        top: 0,
        bottom: window.innerHeight,
        left: 0,
        right: window.innerWidth,
        width: 0,
        height: 0,
        x: 0,
        y: 0,
        toJSON: () => {},
      } as DOMRect);

    render(
      <Tooltip content="Bottom edge tip" position="bottom">
        <button>BottomTrigger</button>
      </Tooltip>,
    );

    await user.hover(screen.getByText("BottomTrigger"));
    expect(await screen.findByText("Bottom edge tip")).toBeInTheDocument();

    rectSpy.mockRestore();
  });
});
