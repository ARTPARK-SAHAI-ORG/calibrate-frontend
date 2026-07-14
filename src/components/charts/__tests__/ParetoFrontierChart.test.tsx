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

  it("shows the empty state when no model has cost + pass rate", () => {
    renderChart([{ model: "x", label: "X", cost: NaN, passRate: NaN }]);
    expect(
      screen.getByText(/missing cost or pass-rate values/i),
    ).toBeInTheDocument();
  });
});
