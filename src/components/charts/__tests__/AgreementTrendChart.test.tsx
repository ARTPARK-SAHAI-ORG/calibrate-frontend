import React from "react";
import { render, screen, setupUser } from "@/test-utils";
import { AgreementTrendChart } from "../AgreementTrendChart";

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

it("shows agreement first and kappa on its own when picked", async () => {
  const user = setupUser();
  const { container } = render(
    <AgreementTrendChart
      series={[
        {
          key: "hh",
          name: "Annotator agreement",
          kappaName: "Annotator agreement",
          color: "var(--chart-1)",
          points: [
            { key: "1", label: "Jan", agreement: 0.8, kappa: -0.5, kappa_type: "fleiss" },
            { key: "2", label: "Feb", agreement: 0.9, kappa: 0.5, kappa_type: "fleiss" },
          ],
        },
      ]}
    />,
  );
  const legend = () =>
    [...container.querySelectorAll(".recharts-legend-item-text")].map(
      (el) => el.textContent,
    );
  expect(screen.getByRole("button", { name: "Agreement" })).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  expect(legend()).toEqual(["Annotator agreement"]);

  await user.click(screen.getByRole("button", { name: "Kappa" }));
  expect(legend()).toEqual(["Annotator agreement (Fleiss' kappa)"]);
  const icons = [...container.querySelectorAll(".recharts-legend-icon")];
  expect(icons.map((icon) => icon.getAttribute("stroke-dasharray"))).toEqual([
    null,
  ]);
});
