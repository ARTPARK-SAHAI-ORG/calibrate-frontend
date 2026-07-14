import { render, screen } from "@/test-utils";
import {
  ParetoFrontierChart,
  type ParetoModelPoint,
} from "@/components/charts/ParetoFrontierChart";
import { getColorMap } from "@/components/charts/LeaderboardBarChart";

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
      [{ target, contentRect: { width: 600, height: 400 } } as unknown as ResizeObserverEntry],
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
    value: 400,
  });
  HTMLElement.prototype.getBoundingClientRect = function () {
    return {
      width: 600,
      height: 400,
      top: 0,
      left: 0,
      bottom: 400,
      right: 600,
      x: 0,
      y: 0,
      toJSON() {},
    };
  };
});

const points: ParetoModelPoint[] = [
  { model: "cheap", label: "Cheap", cost: 0.005, passRate: 70, latency: 400 },
  { model: "mid", label: "Mid", cost: 0.01, passRate: 85, latency: 900 },
  { model: "premium", label: "Premium", cost: 0.05, passRate: 95, latency: 1500 },
];

function renderChart(pts: ParetoModelPoint[]) {
  return render(
    <ParetoFrontierChart points={pts} colorMap={getColorMap(pts.map((p) => p.model))} />,
  );
}

describe("ParetoFrontierChart", () => {
  it("renders the title and mentions speed when latency is present", () => {
    renderChart(points);
    expect(
      screen.getByText(/Pass rate vs cost vs latency tradeoff/i),
    ).toBeInTheDocument();
    expect(screen.getByText(/the faster it replies/i)).toBeInTheDocument();
  });

  it("omits the speed wording when latency is not reported", () => {
    renderChart(points.map((p) => ({ ...p, latency: undefined })));
    expect(screen.queryByText(/replies/i)).not.toBeInTheDocument();
    expect(screen.getByText(/the less it costs to run/i)).toBeInTheDocument();
  });

  it("renders model-name labels beside the bubbles", () => {
    renderChart(points);
    expect(screen.getByText("Cheap")).toBeInTheDocument();
    expect(screen.getByText("Mid")).toBeInTheDocument();
    expect(screen.getByText("Premium")).toBeInTheDocument();
  });

  it("drops the dashed-line wording when only one model is on the frontier", () => {
    // "champion" dominates all others (cheapest, best pass rate, fastest), so it
    // is the sole frontier model and no line is drawn.
    renderChart([
      { model: "champion", label: "champion", cost: 0.001, passRate: 96, latency: 300 },
      { model: "weak", label: "weak", cost: 0.02, passRate: 88, latency: 1400 },
    ]);
    expect(screen.queryByText(/dashed line/i)).not.toBeInTheDocument();
    const boldName = screen.getByText("champion", { selector: "strong" });
    expect(boldName).toHaveClass("font-semibold", "text-foreground");
    expect(screen.getByText(/comes out on top: it matches or beats every other model/i)).toBeInTheDocument();
  });

  it("shows the empty state when no model has cost + pass rate", () => {
    renderChart([{ model: "x", label: "X", cost: NaN, passRate: NaN }]);
    expect(
      screen.getByText(/missing cost or pass-rate values/i),
    ).toBeInTheDocument();
  });
});
