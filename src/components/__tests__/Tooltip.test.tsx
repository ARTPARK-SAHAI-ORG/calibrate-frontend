import { render, screen, setupUser, waitFor } from "@/test-utils";
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
