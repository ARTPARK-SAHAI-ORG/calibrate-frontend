import { render, screen } from "@/test-utils";
import {
  ParetoFrontierChart,
  type ParetoModelPoint,
} from "@/components/charts/ParetoFrontierChart";
import { getColorMap } from "@/components/charts/LeaderboardBarChart";

const points: ParetoModelPoint[] = [
  { model: "cheap", label: "Cheap", cost: 0.005, accuracy: 70, latency: 400 },
  { model: "mid", label: "Mid", cost: 0.01, accuracy: 85, latency: 900 },
  { model: "premium", label: "Premium", cost: 0.05, accuracy: 95, latency: 1500 },
];

function renderChart(pts: ParetoModelPoint[]) {
  return render(
    <ParetoFrontierChart points={pts} colorMap={getColorMap(pts.map((p) => p.model))} />,
  );
}

describe("ParetoFrontierChart", () => {
  it("renders the title and latency-as-bubble-size legend", () => {
    renderChart(points);
    expect(
      screen.getByText(/Cost vs accuracy \(Pareto frontier\)/i),
    ).toBeInTheDocument();
    expect(screen.getByText(/larger = slower/i)).toBeInTheDocument();
  });

  it("notes when latency is not reported", () => {
    renderChart(points.map((p) => ({ ...p, latency: undefined })));
    expect(screen.getByText(/latency \(not reported\)/i)).toBeInTheDocument();
  });

  it("shows the empty state when no model has cost + accuracy", () => {
    renderChart([{ model: "x", label: "X", cost: NaN, accuracy: NaN }]);
    expect(
      screen.getByText(/missing cost or accuracy values/i),
    ).toBeInTheDocument();
  });
});
