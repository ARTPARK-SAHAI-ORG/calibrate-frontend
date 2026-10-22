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
    Line: (props: {
      name: string;
      strokeDasharray?: string;
      strokeWidth?: number;
      strokeOpacity?: number;
    }) => (
      <div
        data-testid="line"
        data-name={props.name}
        data-dash={props.strokeDasharray ?? ""}
        data-width={props.strokeWidth}
        data-opacity={props.strokeOpacity}
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

describe("overall lines", () => {
  const pts = (agreement: number, kappa?: number) => [
    { key: "1", label: "Jan", agreement, kappa, kappa_type: "cohen" as const },
    { key: "2", label: "Feb", agreement, kappa, kappa_type: "cohen" as const },
  ];
  const series = [
    {
      key: "overall_ia",
      name: "Overall inter-annotator agreement",
      kappaName: "Overall inter-annotator agreement",
      color: "var(--foreground)",
      dashed: true,
      overall: true,
      points: pts(0.6),
    },
    {
      key: "ev__ia",
      name: "Tone inter-annotator agreement",
      kappaName: "Tone inter-annotator agreement",
      color: "var(--chart-1)",
      dashed: true,
      points: pts(0.7, 0.4),
    },
    {
      key: "ev",
      name: "Tone agreement with humans",
      kappaName: "Tone agreement with humans",
      color: "var(--chart-1)",
      points: pts(0.9, 0.5),
    },
  ];
  const curves = () =>
    screen.getAllByTestId("line").map((l) => ({
      name: l.dataset.name,
      width: l.dataset.width,
      opacity: l.dataset.opacity,
      dash: l.dataset.dash,
    }));

  it("draws the overall lines thick and fades the evaluator lines, until hidden", async () => {
    const user = setupUser();
    render(<AgreementTrendChart series={series} />);
    expect(curves()).toEqual([
      {
        name: "Overall inter-annotator agreement",
        width: "3.5",
        opacity: "1",
        dash: "6 4",
      },
      {
        name: "Tone inter-annotator agreement",
        width: "2",
        opacity: "0.35",
        dash: "6 4",
      },
      {
        name: "Tone agreement with humans",
        width: "2",
        opacity: "0.35",
        dash: "",
      },
    ]);

    await user.click(screen.getByRole("switch", { name: "Show overall" }));
    expect(curves()).toEqual([
      {
        name: "Tone inter-annotator agreement",
        width: "2",
        opacity: "1",
        dash: "6 4",
      },
      { name: "Tone agreement with humans", width: "2", opacity: "1", dash: "" },
    ]);
  });

  it("shows no overall lines and no switch in the kappa view", async () => {
    const user = setupUser();
    render(<AgreementTrendChart series={series} />);
    await user.click(screen.getByRole("button", { name: "Kappa" }));
    expect(
      screen.queryByRole("switch", { name: "Show overall" }),
    ).not.toBeInTheDocument();
    expect(curves()).toEqual([
      {
        name: "Tone inter-annotator agreement (Cohen's kappa)",
        width: "2",
        opacity: "1",
        dash: "6 4",
      },
      {
        name: "Tone agreement with humans (Cohen's kappa)",
        width: "2",
        opacity: "1",
        dash: "",
      },
    ]);
  });

  it("has no switch when there is no overall line", () => {
    render(<AgreementTrendChart series={series.slice(1)} />);
    expect(
      screen.queryByRole("switch", { name: "Show overall" }),
    ).not.toBeInTheDocument();
  });
});
