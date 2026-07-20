import { render, screen, within } from "@/test-utils";
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

// cheap / mid / premium are all on the frontier (each best on some axis).
// "worst" is dominated by premium (pricier, worse pass rate, slower) so it is
// never on the frontier — it stays an unlabeled dominated dot.
const points: ParetoModelPoint[] = [
  { model: "cheap", label: "Cheap", cost: 0.005, passRate: 70, latency: 400 },
  { model: "mid", label: "Mid", cost: 0.01, passRate: 85, latency: 900 },
  { model: "premium", label: "Premium", cost: 0.05, passRate: 95, latency: 1500 },
  { model: "worst", label: "Worst", cost: 0.06, passRate: 60, latency: 2000 },
];

function renderChart(pts: ParetoModelPoint[]) {
  return render(
    <ParetoFrontierChart points={pts} colorMap={getColorMap(pts.map((p) => p.model))} />,
  );
}

describe("ParetoFrontierChart", () => {
  it("renders the default title and subtitle (mentions speed with latency)", () => {
    renderChart(points);
    expect(screen.getByText("Top picks for their cost")).toBeInTheDocument();
    expect(
      screen.getByText(
        /Which models pass the most tests, for the lowest cost, with the fastest replies\./i,
      ),
    ).toBeInTheDocument();
  });

  it("omits the speed wording when latency is not reported", () => {
    renderChart(points.map((p) => ({ ...p, latency: undefined })));
    expect(screen.queryByText(/fastest replies/i)).not.toBeInTheDocument();
    expect(
      screen.getByText(
        /Which models pass the most tests, for the lowest cost\./i,
      ),
    ).toBeInTheDocument();
  });

  it("labels frontier models in-plot but not a dominated model", () => {
    renderChart(points);
    // Frontier names appear (side list and/or in-plot label).
    expect(screen.getAllByText("Cheap").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Mid").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Premium").length).toBeGreaterThan(0);
    // The dominated model is neither labeled nor listed.
    expect(screen.queryByText("Worst")).not.toBeInTheDocument();
  });

  it("renders the side list with one row per frontier model and its pass rate", () => {
    renderChart(points);
    const list = screen.getByText("Top performers for their cost").parentElement!;
    expect(within(list).getByText("Cheap")).toBeInTheDocument();
    expect(within(list).getByText("Mid")).toBeInTheDocument();
    expect(within(list).getByText("Premium")).toBeInTheDocument();
    expect(within(list).queryByText("Worst")).not.toBeInTheDocument();
    expect(within(list).getByText("70%")).toBeInTheDocument();
    expect(within(list).getByText("85%")).toBeInTheDocument();
    expect(within(list).getByText("95%")).toBeInTheDocument();
  });

  it("shows the empty state when no model has cost + pass rate", () => {
    renderChart([{ model: "x", label: "X", cost: NaN, passRate: NaN }]);
    expect(
      screen.getByText(/missing cost or pass-rate values/i),
    ).toBeInTheDocument();
  });
});
