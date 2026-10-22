import React from "react";
import { render, screen } from "@/test-utils";
import { AgreementTrendChart } from "../AgreementTrendChart";

// jsdom cannot lay out the chart, so the axes and lines are never drawn.
// Standing in for them shows which axis each line is put on.
jest.mock("recharts", () => {
  const pass = ({ children }: { children?: React.ReactNode }) => (
    <div>{children}</div>
  );
  const nothing = () => null;
  return {
    CartesianGrid: nothing,
    Legend: nothing,
    Tooltip: nothing,
    XAxis: nothing,
    ResponsiveContainer: pass,
    LineChart: pass,
    YAxis: (props: { yAxisId: string; domain: number[]; unit?: string; orientation?: string }) => (
      <div
        data-testid={`axis-${props.yAxisId}`}
        data-domain={JSON.stringify(props.domain)}
        data-unit={props.unit ?? ""}
        data-orientation={props.orientation ?? "left"}
      />
    ),
    Line: (props: { name: string; yAxisId: string; strokeDasharray?: string; legendType: string }) => (
      <div
        data-testid="line"
        data-name={props.name}
        data-axis={props.yAxisId}
        data-dash={props.strokeDasharray ?? ""}
        data-legend={props.legendType}
      />
    ),
  };
});

const series = (kappa: number | null) => [
  {
    key: "hh",
    name: "Annotator agreement",
    kappaName: "Annotator agreement",
    color: "#10b981",
    points: [{ key: "1", label: "Jan", agreement: 0.8, kappa, kappa_type: kappa == null ? null : ("fleiss" as const) }],
  },
];

it("puts kappa on its own right-hand axis and agreement on the percent axis", () => {
  render(<AgreementTrendChart series={series(-0.2)} />);
  const left = screen.getByTestId("axis-agreement");
  expect(left.dataset.domain).toBe("[0,100]");
  expect(left.dataset.unit).toBe("%");
  const right = screen.getByTestId("axis-kappa");
  expect(right.dataset.orientation).toBe("right");
  expect(right.dataset.unit).toBe("");
  expect(right.dataset.domain).toBe("[-1,1]");
  const lines = screen.getAllByTestId("line").map((l) => ({ ...l.dataset }));
  expect(lines).toEqual([
    { testid: "line", name: "Annotator agreement", axis: "agreement", dash: "", legend: "plainline" },
    {
      testid: "line",
      name: "Annotator agreement (Fleiss' kappa)",
      axis: "kappa",
      dash: "5 4",
      legend: "plainline",
    },
  ]);
});

it("keeps the kappa axis at 0 to 1 when no kappa is below 0", () => {
  render(<AgreementTrendChart series={series(0.3)} />);
  expect(screen.getByTestId("axis-kappa").dataset.domain).toBe("[0,1]");
});

it("leaves out the kappa axis when there is no kappa line", () => {
  render(<AgreementTrendChart series={series(null)} />);
  expect(screen.queryByTestId("axis-kappa")).not.toBeInTheDocument();
  expect(screen.getAllByTestId("line")).toHaveLength(1);
});
