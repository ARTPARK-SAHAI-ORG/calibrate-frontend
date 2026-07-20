import { render, screen, setupUser } from "@/test-utils";
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
// never on the frontier — it stays a dimmed row and an unlabeled dot.
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
  it("renders the default title and a subtitle that explains the frontier", () => {
    renderChart(points);
    expect(
      screen.getByText("Cost, quality and speed tradeoff"),
    ).toBeInTheDocument();
    expect(screen.getByText(/faster models are bigger/i)).toBeInTheDocument();
    expect(
      screen.getByText(/there is no reason to choose it/i),
    ).toBeInTheDocument();
  });

  it("drops the speed wording from the title and subtitle when latency is absent", () => {
    renderChart(points.map((p) => ({ ...p, latency: undefined })));
    expect(screen.getByText("Cost and quality tradeoff")).toBeInTheDocument();
    expect(screen.queryByText(/faster models are bigger/i)).not.toBeInTheDocument();
    expect(
      screen.getByText(/on both quality and cost at once/i),
    ).toBeInTheDocument();
  });

  it("lists every model in the table with quality, cost and speed columns", () => {
    renderChart(points);
    expect(
      screen.getByRole("columnheader", { name: "Model" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("columnheader", { name: "Quality" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("columnheader", { name: "Cost" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("columnheader", { name: "Speed" }),
    ).toBeInTheDocument();
    // Toggle is off by default, so dominated models show too.
    for (const name of ["Cheap", "Mid", "Premium", "Worst"]) {
      expect(screen.getAllByText(name).length).toBeGreaterThan(0);
    }
  });

  it("highlights the best value in a column in green", () => {
    renderChart(points);
    // Premium has the best pass rate (95%); its quality cell is bold green.
    const bestQuality = screen.getByText("95%");
    expect(bestQuality).toHaveClass("text-green-600");
  });

  it("drops dominated models when 'Show the best models only' is on", async () => {
    const user = setupUser();
    renderChart(points);
    expect(screen.getByText("Worst")).toBeInTheDocument();
    await user.click(
      screen.getByRole("button", { name: "Show the best models only" }),
    );
    expect(screen.queryByText("Worst")).not.toBeInTheDocument();
    // The best models are still listed (in-plot label + table row).
    expect(screen.getAllByText("Premium").length).toBeGreaterThan(0);
  });

  it("shows the empty state when no model has cost + pass rate", () => {
    renderChart([{ model: "x", label: "X", cost: NaN, passRate: NaN }]);
    expect(
      screen.getByText(/missing cost or pass-rate values/i),
    ).toBeInTheDocument();
  });
});
