import React from "react";
import { render, screen } from "@/test-utils";
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

it("shows the agreement line and its kappa line in one legend", () => {
  render(
    <AgreementTrendChart
      series={[
        {
          key: "hh",
          name: "Annotator agreement",
          kappaName: "Annotator agreement",
          color: "#10b981",
          points: [
            { x: "Jan", agreement: 0.8, kappa: -0.5, kappa_type: "fleiss" },
            { x: "Feb", agreement: 0.9, kappa: 0.5, kappa_type: "fleiss" },
          ],
        },
      ]}
    />,
  );
  expect(screen.getByText("Annotator agreement")).toBeInTheDocument();
  expect(
    screen.getByText("Annotator agreement (Fleiss' kappa)"),
  ).toBeInTheDocument();
});
