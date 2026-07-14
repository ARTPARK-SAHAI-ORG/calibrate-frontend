import { render, screen } from "@/test-utils";
import {
  ParetoFrontierChart,
  type ParetoModelPoint,
} from "@/components/charts/ParetoFrontierChart";
import { getColorMap } from "@/components/charts/LeaderboardBarChart";

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
  it("renders the title and mentions faster bubbles when latency is present", () => {
    renderChart(points);
    expect(screen.getByText(/Pareto frontier/i)).toBeInTheDocument();
    expect(screen.getByText(/smaller bubbles are faster/i)).toBeInTheDocument();
  });

  it("omits the speed wording when latency is not reported", () => {
    renderChart(points.map((p) => ({ ...p, latency: undefined })));
    expect(screen.queryByText(/faster/i)).not.toBeInTheDocument();
    expect(screen.getByText(/further left means lower cost/i)).toBeInTheDocument();
  });

  it("shows the empty state when no model has cost + pass rate", () => {
    renderChart([{ model: "x", label: "X", cost: NaN, passRate: NaN }]);
    expect(
      screen.getByText(/missing cost or pass-rate values/i),
    ).toBeInTheDocument();
  });
});
