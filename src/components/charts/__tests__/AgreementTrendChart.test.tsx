import React from "react";
import { render, screen } from "@/test-utils";
import {
  AgreementTrendChart,
  TrendHoverBox,
  VersionAxisTick,
} from "../AgreementTrendChart";

// jsdom has no layout, so recharts' ResponsiveContainer is given a fixed size.
class ResizeObserverMock {
  private cb: ResizeObserverCallback;
  constructor(cb: ResizeObserverCallback) {
    this.cb = cb;
  }
  observe(target: Element) {
    this.cb(
      [
        {
          target,
          contentRect: { width: 600, height: 300 },
        } as unknown as ResizeObserverEntry,
      ],
      this as unknown as ResizeObserver,
    );
  }
  unobserve() {}
  disconnect() {}
}

beforeAll(() => {
  (global as unknown as { ResizeObserver: unknown }).ResizeObserver =
    ResizeObserverMock;
  Object.defineProperty(HTMLElement.prototype, "offsetWidth", {
    configurable: true,
    value: 600,
  });
  Object.defineProperty(HTMLElement.prototype, "offsetHeight", {
    configurable: true,
    value: 300,
  });
  HTMLElement.prototype.getBoundingClientRect = function () {
    return {
      width: 600,
      height: 300,
      top: 0,
      left: 0,
      bottom: 300,
      right: 600,
      x: 0,
      y: 0,
      toJSON() {},
    } as DOMRect;
  };
});

it("names the two lines Agreement and Kappa in the legend", () => {
  const { container } = render(
    <AgreementTrendChart
      points={[
        { key: "1", label: "v1", agreement: 0.8, kappa: -0.5, kappa_type: "cohen" },
        { key: "2", label: "v2", agreement: 0.9, kappa: 0.5, kappa_type: "cohen" },
      ]}
      renderHover={() => null}
    />,
  );
  const legend = [...container.querySelectorAll(".recharts-legend-item-text")].map(
    (el) => el.textContent,
  );
  expect(legend).toEqual(["Agreement", "Kappa"]);
  expect(screen.queryByRole("button", { name: "Kappa" })).not.toBeInTheDocument();
});

it("gives the hover box room: 16px padding, a 260px minimum that shrinks on a narrow chart, space under its heading", () => {
  render(<TrendHoverBox label="v1">content</TrendHoverBox>);
  const heading = screen.getByText("v1");
  expect(heading.className).toContain("mb-2.5");
  const box = heading.parentElement!;
  expect(box.className).toContain("p-4");
  expect(box.className).toContain("min-w-[min(260px,100%)]");
});


it("puts Live on the live version's own line, just to the right of it", () => {
  const { container } = render(
    <svg>
      <VersionAxisTick x={0} y={0} payload={{ value: "v1" }} liveLabels={new Set(["v1"])} />
      <VersionAxisTick x={0} y={0} payload={{ value: "v2" }} liveLabels={new Set(["v1"])} />
    </svg>,
  );
  const [live, other] = [...container.querySelectorAll("svg > g")];
  const [version, mark] = [...live.querySelectorAll("text")];
  expect([version.textContent, mark.textContent]).toEqual(["v1", "Live"]);
  expect(version.getAttribute("text-anchor")).toBe("end");
  expect(Number(mark.getAttribute("y"))).toBe(
    Number(version.getAttribute("y")) + Number(version.getAttribute("dy")),
  );
  expect(Number(mark.getAttribute("x"))).toBeGreaterThan(0);
  expect(other.textContent).toBe("v2");
});
