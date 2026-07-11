import React from "react";
import { render, screen, fireEvent } from "@/test-utils";
import {
  LeaderboardBarChart,
  pastelColors,
  getColorMap,
} from "../LeaderboardBarChart";

// jsdom has no ResizeObserver, and recharts' ResponsiveContainer needs a
// non-zero measured size to actually render the inner chart SVG. Immediately
// invoke the observer callback with a fixed size so recharts renders synchronously.
class ResizeObserverMock {
  private cb: ResizeObserverCallback;
  constructor(cb: ResizeObserverCallback) {
    this.cb = cb;
  }
  observe(target: Element) {
    this.cb(
      [{ target, contentRect: { width: 600, height: 300 } } as unknown as ResizeObserverEntry],
      this as unknown as ResizeObserver
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

const sampleData = [
  { label: "Alpha", value: 10 },
  { label: "Beta", value: 20, colorKey: "beta-key" },
  { label: "Gamma", value: 30 },
];

describe("getColorMap", () => {
  it("maps each item to a pastel color, cycling through the palette", () => {
    const items = ["a", "b", "c"];
    const map = getColorMap(items);
    expect(map.get("a")).toBe(pastelColors[0]);
    expect(map.get("b")).toBe(pastelColors[1]);
    expect(map.get("c")).toBe(pastelColors[2]);
  });

  it("cycles back to the start of the palette when items exceed palette length", () => {
    const items = Array.from({ length: pastelColors.length + 1 }, (_, i) => `item-${i}`);
    const map = getColorMap(items);
    expect(map.get(`item-${pastelColors.length}`)).toBe(pastelColors[0]);
  });
});

describe("LeaderboardBarChart", () => {
  it("renders the title and a PNG download button", () => {
    render(<LeaderboardBarChart title="My Chart" data={sampleData} />);
    expect(screen.getByText("My Chart")).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /PNG/ })
    ).toBeInTheDocument();
  });

  it("renders with a provided colorMap and custom yDomain/formatters", () => {
    const colorMap = getColorMap(sampleData.map((d) => d.colorKey || d.label));
    render(
      <LeaderboardBarChart
        title="Custom Chart"
        data={sampleData}
        height={250}
        yDomain={[0, 100]}
        formatTooltip={(v) => `${v}%`}
        yTickFormatter={(v) => `${v}u`}
        colorMap={colorMap}
        filename="custom-file"
      />
    );
    expect(screen.getByText("Custom Chart")).toBeInTheDocument();
  });

  it("renders with empty data without crashing", () => {
    render(<LeaderboardBarChart title="Empty Chart" data={[]} />);
    expect(screen.getByText("Empty Chart")).toBeInTheDocument();
  });

  // Recharts only invokes the Tooltip `formatter` (which routes through
  // formatTooltip / defaultTooltipFormatter) once the chart becomes active.
  // Recharts 3's accessibility layer makes the chart surface focusable
  // (role="application") and activates a data point on arrow-key navigation, so
  // drive that to exercise the tooltip formatter without needing real layout.
  function activateTooltip(container: HTMLElement) {
    const surface = container.querySelector(".recharts-surface");
    if (!surface) return;
    fireEvent.focus(surface);
    fireEvent.keyDown(surface, { key: "ArrowRight", code: "ArrowRight" });
  }

  it("formats tooltip values with the default formatter when active", () => {
    const { container } = render(
      <LeaderboardBarChart
        title="Active Chart"
        data={[{ label: "Alpha", value: 10.123456 }]}
      />
    );
    activateTooltip(container);
    // defaultTooltipFormatter: parseFloat((10.123456).toFixed(5)).toString()
    expect(screen.getByText("10.12346")).toBeInTheDocument();
  });

  it("formats tooltip values with a custom formatTooltip when active", () => {
    const { container } = render(
      <LeaderboardBarChart
        title="Active Custom"
        data={[{ label: "Alpha", value: 42 }]}
        formatTooltip={(v) => `${v} pts`}
      />
    );
    activateTooltip(container);
    expect(screen.getByText("42 pts")).toBeInTheDocument();
  });

  it("passes non-numeric tooltip values through unformatted", () => {
    const { container } = render(
      <LeaderboardBarChart
        title="Non Numeric"
        // A non-number value exercises the `typeof value === "number"` false
        // branch, where the formatter returns the raw value untouched.
        data={[{ label: "Alpha", value: "N/A" as unknown as number }]}
      />
    );
    activateTooltip(container);
    expect(screen.getByText("N/A")).toBeInTheDocument();
  });

  it("falls back to the default bar color when the color map lacks an entry", () => {
    // An empty color map forces `colors.get(...)` to return undefined so the
    // `|| "#A8D5E2"` default-color fallback branch executes for every Cell.
    render(
      <LeaderboardBarChart
        title="No Colors"
        data={sampleData}
        colorMap={new Map<string, string>()}
      />
    );
    expect(screen.getByText("No Colors")).toBeInTheDocument();
  });

  describe("downloadChart", () => {
    let createObjectURLSpy: jest.SpyInstance;
    let revokeObjectURLSpy: jest.SpyInstance;
    let originalImage: typeof Image;
    let getContextSpy: jest.SpyInstance;
    let toDataURLSpy: jest.SpyInstance;

    beforeEach(() => {
      // jsdom does not implement URL.createObjectURL/revokeObjectURL at all,
      // so stub them directly rather than spying on a nonexistent method.
      URL.createObjectURL = jest.fn().mockReturnValue("blob:mock-url");
      URL.revokeObjectURL = jest.fn();
      createObjectURLSpy = URL.createObjectURL as unknown as jest.SpyInstance;
      revokeObjectURLSpy = URL.revokeObjectURL as unknown as jest.SpyInstance;

      // jsdom also doesn't implement canvas 2D rendering without the optional
      // `canvas` package — stub just enough of the API surface that
      // downloadChart's export path runs without throwing.
      getContextSpy = jest
        .spyOn(HTMLCanvasElement.prototype, "getContext")
        .mockReturnValue({
          scale: jest.fn(),
          drawImage: jest.fn(),
        } as unknown as CanvasRenderingContext2D);
      toDataURLSpy = jest
        .spyOn(HTMLCanvasElement.prototype, "toDataURL")
        .mockReturnValue("data:image/png;base64,mock");

      originalImage = global.Image;
      // jsdom's Image never actually loads a blob URL, so fake one that
      // synchronously fires onload as soon as `src` is assigned — this lets
      // the test exercise the canvas/export branch of downloadChart.
      class FakeImage {
        onload: (() => void) | null = null;
        set src(_value: string) {
          this.onload?.();
        }
      }
      // @ts-expect-error - simplified stand-in for the DOM Image constructor
      global.Image = FakeImage;
    });

    afterEach(() => {
      createObjectURLSpy.mockClear();
      revokeObjectURLSpy.mockClear();
      getContextSpy.mockRestore();
      toDataURLSpy.mockRestore();
      global.Image = originalImage;
    });

    it("builds and triggers a PNG download when the chart svg is present", () => {
      const clickSpy = jest
        .spyOn(HTMLAnchorElement.prototype, "click")
        .mockImplementation(() => {});

      render(
        <LeaderboardBarChart
          title="My Chart"
          data={sampleData}
          filename="custom-name"
        />
      );
      const button = screen.getByRole("button", { name: /PNG/ });
      fireEvent.click(button);

      expect(createObjectURLSpy).toHaveBeenCalled();
      expect(revokeObjectURLSpy).toHaveBeenCalledWith("blob:mock-url");
      expect(clickSpy).toHaveBeenCalled();

      clickSpy.mockRestore();
    });

    it("no-ops when the chart svg is missing", () => {
      const clickSpy = jest
        .spyOn(HTMLAnchorElement.prototype, "click")
        .mockImplementation(() => {});

      const { container } = render(
        <LeaderboardBarChart title="No SVG" data={sampleData} />
      );
      // Remove the rendered chart svg so downloadChart's `!svgElement` guard
      // short-circuits before building/exporting anything.
      container.querySelector(".recharts-surface")?.remove();
      const button = screen.getByRole("button", { name: /PNG/ });
      fireEvent.click(button);

      expect(createObjectURLSpy).not.toHaveBeenCalled();
      expect(clickSpy).not.toHaveBeenCalled();
      clickSpy.mockRestore();
    });

    it("falls back to a slugified title when no filename prop is given", () => {
      const clickSpy = jest
        .spyOn(HTMLAnchorElement.prototype, "click")
        .mockImplementation(() => {});

      render(<LeaderboardBarChart title="My Great Chart" data={sampleData} />);
      const button = screen.getByRole("button", { name: /PNG/ });
      fireEvent.click(button);

      expect(clickSpy).toHaveBeenCalled();
      clickSpy.mockRestore();
    });
  });
});
