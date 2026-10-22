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
    // Hands the custom hover a point, as hovering the first point would.
    Tooltip: (props: {
      content?: (p: {
        active: boolean;
        label: string;
        payload: { payload: { key: string } }[];
      }) => React.ReactNode;
    }) =>
      props.content ? (
        <div data-testid="hover">
          {props.content({
            active: true,
            label: "v1",
            payload: [{ payload: { key: "1" } }],
          })}
        </div>
      ) : null,
    XAxis: nothing,
    ResponsiveContainer: pass,
    LineChart: pass,
    YAxis: (props: {
      domain: number[];
      unit?: string;
      yAxisId?: string;
      orientation?: string;
    }) => (
      <div
        data-testid="axis"
        data-domain={JSON.stringify(props.domain)}
        data-unit={props.unit ?? ""}
        data-id={props.yAxisId}
        data-side={props.orientation ?? "left"}
      />
    ),
    Line: (props: {
      name: string;
      strokeDasharray?: string;
      yAxisId?: string;
      stroke?: string;
    }) => (
      <div
        data-testid="line"
        data-name={props.name}
        data-dash={props.strokeDasharray ?? ""}
        data-axis={props.yAxisId}
        data-colour={props.stroke}
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

describe("agreement and kappa drawn together", () => {
  const versions = (kappas: (number | null)[]) => [
    {
      key: "agreement",
      name: "Agreement",
      kappaName: "Kappa",
      plainKappaLine: true,
      color: "var(--chart-2)",
      kappaColor: "var(--chart-1)",
      points: kappas.map((kappa, i) => ({
        key: String(i + 1),
        label: `v${i + 1}`,
        agreement: 0.5,
        kappa,
        kappa_type: "cohen" as const,
      })),
    },
  ];

  it("draws both lines, kappa on a right axis without a percent sign, and no switch", () => {
    render(<AgreementTrendChart series={versions([0.4, 0.6])} bothAxes />);
    expect(
      screen.queryByRole("button", { name: "Kappa" }),
    ).not.toBeInTheDocument();
    const lines = screen.getAllByTestId("line");
    expect(lines.map((l) => [l.dataset.name, l.dataset.axis, l.dataset.colour])).toEqual([
      ["Agreement", "main", "var(--chart-2)"],
      ["Kappa", "kappa", "var(--chart-1)"],
    ]);
    const [left, right] = screen.getAllByTestId("axis");
    expect([left.dataset.domain, left.dataset.unit]).toEqual(["[0,100]", "%"]);
    expect([right.dataset.side, right.dataset.domain, right.dataset.unit]).toEqual([
      "right",
      "[0,1]",
      "",
    ]);
  });

  it("takes the kappa axis below 0 when a kappa is below 0", () => {
    render(<AgreementTrendChart series={versions([-0.3, 0.6])} bothAxes />);
    expect(screen.getAllByTestId("axis")[1].dataset.domain).toBe("[-1,1]");
  });

  it("still lists the kappa line before any version has a kappa", () => {
    render(<AgreementTrendChart series={versions([null])} bothAxes />);
    expect(lineNames()).toEqual(["Agreement", "Kappa"]);
  });

  it("draws the page's own hover box for the hovered point", () => {
    render(
      <AgreementTrendChart
        series={versions([0.4])}
        bothAxes
        renderHover={(key, label) => (
          <span>
            point {key} {label}
          </span>
        )}
      />,
    );
    expect(screen.getByTestId("hover")).toHaveTextContent("point 1 v1");
  });
});

