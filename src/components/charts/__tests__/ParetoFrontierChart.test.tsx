import { render, screen, setupUser, within } from "@/test-utils";
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
      screen.getByText("Cost, quality and latency tradeoff"),
    ).toBeInTheDocument();
    expect(screen.getByText(/how fast it replies/i)).toBeInTheDocument();
    expect(
      screen.getByText(/there is no reason to choose it/i),
    ).toBeInTheDocument();
  });

  it("shows a bubble-size legend with the fastest and slowest reply times", () => {
    renderChart(points);
    // points span 400 ms (fastest) to 2000 ms = 2 s (slowest).
    const legend = screen.getByTestId("pareto-size-legend");
    expect(within(legend).getByText("Latency")).toBeInTheDocument();
    expect(within(legend).getByText("400 ms")).toBeInTheDocument();
    expect(within(legend).getByText("2 s")).toBeInTheDocument();
  });

  it("drops the speed wording and the size legend when latency is absent", () => {
    renderChart(points.map((p) => ({ ...p, latency: undefined })));
    expect(screen.getByText("Cost and quality tradeoff")).toBeInTheDocument();
    expect(screen.queryByText(/how fast it replies/i)).not.toBeInTheDocument();
    expect(screen.queryByTestId("pareto-size-legend")).not.toBeInTheDocument();
    expect(
      screen.getByText(/on both quality and cost at once/i),
    ).toBeInTheDocument();
  });

  it("shows the columns and, by default, only the best models", () => {
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
      screen.getByRole("columnheader", { name: "Latency" }),
    ).toBeInTheDocument();
    // Best-only is on by default: frontier models show, dominated ones don't.
    expect(screen.getAllByText("Premium").length).toBeGreaterThan(0);
    expect(screen.queryByText("Worst")).not.toBeInTheDocument();
  });

  it("sorts by Quality (highest first) by default, shown on the header", () => {
    renderChart(points);
    expect(
      screen.getByRole("columnheader", { name: "Quality" }),
    ).toHaveAttribute("aria-sort", "descending");
    expect(screen.getByRole("columnheader", { name: "Cost" })).toHaveAttribute(
      "aria-sort",
      "none",
    );
  });

  it("highlights the best value in a column in green", () => {
    renderChart(points);
    // Premium has the best pass rate (95%); its quality cell is bold green.
    const bestQuality = screen.getByText("95%");
    expect(bestQuality).toHaveClass("text-green-600");
  });

  it("reveals every model when the toggle is turned off, in strict quality order", async () => {
    const user = setupUser();
    renderChart(points);
    // Hidden by default.
    expect(screen.queryByText("Worst")).not.toBeInTheDocument();

    await user.click(
      screen.getByRole("button", { name: "Show the best models only" }),
    );

    // Dominated model now appears. Default sort is quality, highest first, and
    // it is followed strictly (no best-models-first grouping): the highest
    // pass rate (Premium, 95%) is the top row, the lowest (Worst, 60%) the last.
    expect(screen.getByText("Worst")).toBeInTheDocument();
    const rows = screen.getAllByRole("row");
    expect(rows[1]).toHaveTextContent("Premium");
    expect(rows[rows.length - 1]).toHaveTextContent("Worst");
  });

  it("follows the sort strictly, without grouping the best models first", async () => {
    const user = setupUser();
    // A is a best model only because it is the cheapest and fastest, yet its
    // quality (60%) is below the dominated model C (88%).
    const pts: ParetoModelPoint[] = [
      { model: "a", label: "A", cost: 0.001, passRate: 60, latency: 300 },
      { model: "b", label: "B", cost: 0.05, passRate: 99, latency: 2000 },
      { model: "c", label: "C", cost: 0.06, passRate: 88, latency: 2500 },
    ];
    render(
      <ParetoFrontierChart
        points={pts}
        colorMap={getColorMap(pts.map((p) => p.model))}
      />,
    );
    await user.click(
      screen.getByRole("button", { name: "Show the best models only" }),
    );

    // Quality, highest first, strictly: B (99), then the dominated C (88), then
    // the best-but-lower-quality A (60). C outranks A because the sort is not
    // grouped by best-first.
    const rows = screen.getAllByRole("row");
    expect(rows[1]).toHaveTextContent("B");
    expect(rows[2]).toHaveTextContent("C");
    expect(rows[3]).toHaveTextContent("A");
  });

  it("sorts the table by a column when its header is clicked", async () => {
    const user = setupUser();
    renderChart(points);
    // Show every model so the ordering is visible.
    await user.click(
      screen.getByRole("button", { name: "Show the best models only" }),
    );

    // Sort by Cost: cheapest first (Cheap = $0.005).
    await user.click(screen.getByRole("button", { name: "Cost" }));
    let rows = screen.getAllByRole("row");
    expect(rows[1]).toHaveTextContent("Cheap");

    // Click again to flip: most expensive first (Worst = $0.06).
    await user.click(screen.getByRole("button", { name: "Cost" }));
    rows = screen.getAllByRole("row");
    expect(rows[1]).toHaveTextContent("Worst");
  });

  it("shows raw quality values (not percentages) when formatQuality is set", () => {
    // passRate is accuracy (position/rank); qualityDisplay is the raw error rate.
    const errPoints: ParetoModelPoint[] = [
      { model: "a", label: "Best", cost: 0.005, passRate: 98, latency: 400, qualityDisplay: 0.02 },
      { model: "b", label: "Worse", cost: 0.002, passRate: 80, latency: 900, qualityDisplay: 0.2 },
    ];
    render(
      <ParetoFrontierChart
        points={errPoints}
        colorMap={getColorMap(errPoints.map((p) => p.model))}
        passRateLabel="Semantic WER"
        formatQuality={(v) => String(v)}
      />,
    );
    // Best model shows its raw rate 0.02, not "98%".
    expect(screen.getByText("0.02")).toBeInTheDocument();
    expect(screen.queryByText("98%")).not.toBeInTheDocument();
  });

  it("shows the empty state when no model has cost + pass rate", () => {
    renderChart([{ model: "x", label: "X", cost: NaN, passRate: NaN }]);
    expect(
      screen.getByText(/missing cost or pass-rate values/i),
    ).toBeInTheDocument();
  });

  it("takes STT/TTS wording overrides for the subtitle, header and cost axis", () => {
    render(
      <ParetoFrontierChart
        points={points}
        colorMap={getColorMap(points.map((p) => p.model))}
        entityNoun="provider"
        qualityNoun="accuracy"
        qualityComparative="how accurate it is"
        costAxisLabel="Total cost (USD)"
      />,
    );
    // Subtitle reads in provider/accuracy wording, not model/pass-rate.
    expect(
      screen.getByText(/each provider is placed by how accurate it is/i),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/nothing else beats on accuracy, cost and latency/i),
    ).toBeInTheDocument();
    // Table header is capitalised from the entity noun.
    expect(
      screen.getByRole("columnheader", { name: "Provider" }),
    ).toBeInTheDocument();
    // Cost-axis title override is rendered.
    expect(screen.getByText("Total cost (USD)")).toBeInTheDocument();
  });
});
