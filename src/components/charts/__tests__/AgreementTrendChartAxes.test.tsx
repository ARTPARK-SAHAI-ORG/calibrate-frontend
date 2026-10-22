import React from "react";
import { render, screen, setupUser } from "@/test-utils";
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
    YAxis: (props: { domain: number[]; unit?: string }) => (
      <div
        data-testid="axis"
        data-domain={JSON.stringify(props.domain)}
        data-unit={props.unit ?? ""}
      />
    ),
    Line: (props: { name: string; strokeDasharray?: string }) => (
      <div
        data-testid="line"
        data-name={props.name}
        data-dash={props.strokeDasharray ?? ""}
      />
    ),
  };
});

const series = (kappa: number | null) => [
  {
    key: "hh",
    name: "Annotator agreement",
    kappaName: "Annotator agreement",
    color: "var(--chart-1)",
    points: [{ key: "1", label: "Jan", agreement: 0.8, kappa, kappa_type: kappa == null ? null : ("fleiss" as const) }],
  },
];

const lineNames = () =>
  screen.getAllByTestId("line").map((l) => l.dataset.name);

it("shows only agreement lines on the percent axis at first", () => {
  render(<AgreementTrendChart series={series(-0.2)} />);
  expect(screen.getAllByTestId("axis")).toHaveLength(1);
  const axis = screen.getByTestId("axis");
  expect(axis.dataset.domain).toBe("[0,100]");
  expect(axis.dataset.unit).toBe("%");
  expect(lineNames()).toEqual(["Annotator agreement"]);
});

it("shows only kappa lines on a kappa axis from -1 to 1 when a kappa is below 0", async () => {
  const user = setupUser();
  render(<AgreementTrendChart series={series(-0.2)} />);
  await user.click(screen.getByRole("button", { name: "Kappa" }));
  const axis = screen.getByTestId("axis");
  expect(axis.dataset.domain).toBe("[-1,1]");
  expect(axis.dataset.unit).toBe("");
  expect(lineNames()).toEqual(["Annotator agreement (Fleiss' kappa)"]);
  expect(screen.getByTestId("line").dataset.dash).toBe("");
});

it("keeps the kappa axis at 0 to 1 when no kappa is below 0", async () => {
  const user = setupUser();
  render(<AgreementTrendChart series={series(0.3)} />);
  await user.click(screen.getByRole("button", { name: "Kappa" }));
  expect(screen.getByTestId("axis").dataset.domain).toBe("[0,1]");
});

it("hides the agreement or kappa control when there is no kappa", () => {
  render(<AgreementTrendChart series={series(null)} />);
  expect(
    screen.queryByRole("button", { name: "Kappa" }),
  ).not.toBeInTheDocument();
  expect(lineNames()).toEqual(["Annotator agreement"]);
});
