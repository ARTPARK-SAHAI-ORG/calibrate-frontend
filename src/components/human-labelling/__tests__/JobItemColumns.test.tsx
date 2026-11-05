import { createRef } from "react";
import { fireEvent, render, screen } from "@/test-utils";
import { JobItemColumns } from "../JobItemColumns";

const KEY = "calibrate:labelling-right-column-width";

function draw(taskType: string, canResize: boolean) {
  const rightRef = createRef<HTMLDivElement>();
  render(
    <JobItemColumns
      taskType={taskType}
      canResize={canResize}
      leftHasOwnPadding={false}
      left={<p>the item</p>}
      right={<p>the evaluators</p>}
      rightRef={rightRef}
    />,
  );
  return rightRef;
}

const widthOf = (el: HTMLElement | null) =>
  el?.style.getPropertyValue("--right-column-width");

describe("JobItemColumns", () => {
  beforeEach(() => window.localStorage.clear());

  it.each([
    ["llm", "40%"],
    ["llm-general", "40%"],
    ["conversation", "40%"],
    ["stt", "50%"],
    ["tts", "50%"],
  ])(
    "gives a labeller on a %s task a divider and a %s right column",
    (type, width) => {
      const rightRef = draw(type, true);
      expect(
        screen.getByRole("separator", { name: "Resize the columns" }),
      ).toBeInTheDocument();
      expect(widthOf(rightRef.current)).toBe(width);
    },
  );

  it("opens at the width saved in this browser", () => {
    window.localStorage.setItem(KEY, "45");
    const rightRef = draw("conversation", true);
    expect(widthOf(rightRef.current)).toBe("45%");
  });

  it("resizes the right column when the divider is dragged, and saves it", () => {
    const rightRef = draw("conversation", true);
    const handle = screen.getByRole("separator");
    handle.parentElement!.getBoundingClientRect = () =>
      ({ right: 1000, width: 1000 }) as DOMRect;
    fireEvent.mouseDown(handle);
    fireEvent.mouseMove(document, { clientX: 500 });
    fireEvent.mouseUp(document);
    expect(widthOf(rightRef.current)).toBe("50%");
    expect(window.localStorage.getItem(KEY)).toBe("50");
  });

  it("draws no line on the left column when the divider is there", () => {
    draw("conversation", true);
    expect(
      screen.getByText("the item").closest("[data-tutorial]")!.parentElement,
    ).not.toHaveClass("md:border-r");
  });

  it.each([
    ["conversation", "md:flex-[6]", "md:flex-[4]"],
    ["stt", "md:flex-1", "md:flex-1"],
  ])(
    "gives a reader on a %s task fixed widths and no divider",
    (type, left, right) => {
      window.localStorage.setItem(KEY, "45");
      const rightRef = draw(type, false);
      expect(screen.queryByRole("separator")).not.toBeInTheDocument();
      expect(
        screen.getByText("the item").closest("[data-tutorial]")!.parentElement,
      ).toHaveClass(left, "md:border-r");
      expect(rightRef.current).toHaveClass(right);
      expect(widthOf(rightRef.current)).toBeFalsy();
    },
  );
});
