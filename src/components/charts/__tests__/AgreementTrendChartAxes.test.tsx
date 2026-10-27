import React from "react";
import { act, fireEvent, render, screen } from "@/test-utils";
import { AgreementTrendChart } from "../AgreementTrendChart";
import { KappaCell } from "@/components/human-labelling/KappaCell";

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
    // Draws the line's own dots for two points, one on each half of a
    // 600px wide chart, so the hover can be driven from them.
    Line: (props: {
      name: string;
      strokeDasharray?: string;
      yAxisId?: string;
      stroke?: string;
      dataKey: string;
      dot?: (p: {
        cx: number;
        cy: number;
        index: number;
        payload: { key: string; label: string };
      }) => React.ReactNode;
    }) => (
      <div
        data-testid="line"
        data-name={props.name}
        data-dash={props.strokeDasharray ?? ""}
        data-axis={props.yAxisId}
        data-colour={props.stroke}
      >
        {props.dataKey.endsWith("__kappa") ? null : (
          <svg>
            {props.dot?.({ cx: 100, cy: 50, index: 0, payload: { key: "1", label: "v1" } })}
            {props.dot?.({ cx: 500, cy: 60, index: 1, payload: { key: "2", label: "v2" } })}
          </svg>
        )}
      </div>
    ),
  };
});

const lineNames = () =>
  screen.getAllByTestId("line").map((l) => l.dataset.name);

describe("agreement and kappa drawn together", () => {
  const versions = (kappas: (number | null)[]) => [
    {
      key: "agreement",
      name: "Agreement",
      kappaName: "Kappa",
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
    render(<AgreementTrendChart series={versions([0.4, 0.6])} renderHover={() => null} />);
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
    render(<AgreementTrendChart series={versions([-0.3, 0.6])} renderHover={() => null} />);
    expect(screen.getAllByTestId("axis")[1].dataset.domain).toBe("[-1,1]");
  });

  it("still lists the kappa line before any version has a kappa", () => {
    render(<AgreementTrendChart series={versions([null])} renderHover={() => null} />);
    expect(lineNames()).toEqual(["Agreement", "Kappa"]);
  });
});

describe("the hover box", () => {
  const series = [
    {
      key: "agreement",
      name: "Agreement",
      kappaName: "Kappa",
      color: "var(--chart-2)",
      kappaColor: "var(--chart-1)",
      points: [
        { key: "1", label: "v1", agreement: 0.5, kappa: 0.2, kappa_type: "cohen" as const },
        { key: "2", label: "v2", agreement: 0.6, kappa: 0.3, kappa_type: "cohen" as const },
      ],
    },
  ];
  const renderChart = () =>
    render(
      <AgreementTrendChart
        series={series}
        renderHover={(key, label) => (
          <div>
            box {key} {label}
            <button type="button">inside</button>
          </div>
        )}
      />,
    );
  const dots = () => screen.getAllByTestId("trend-dot");
  const box = () => screen.queryByTestId("trend-hover");

  beforeEach(() => {
    jest.useFakeTimers();
    Object.defineProperty(HTMLElement.prototype, "offsetWidth", {
      configurable: true,
      value: 600,
    });
  });
  afterEach(() => {
    jest.useRealTimers();
    // jsdom's own value, so other tests are not affected.
    Object.defineProperty(HTMLElement.prototype, "offsetWidth", {
      configurable: true,
      value: 0,
    });
  });

  it("opens beside the hovered point, not at the mouse", () => {
    renderChart();
    fireEvent.mouseEnter(dots()[0]);
    expect(box()).toHaveTextContent("box 1 v1");
    // Left half of the chart, so the box sits to the right of the point.
    expect(box()!.style.left).toBe("114px");
    expect(box()!.style.top).toBe("50px");
    fireEvent.mouseEnter(dots()[1]);
    expect(box()).toHaveTextContent("box 2 v2");
    // Right half, so the box sits to its left.
    expect(box()!.style.left).toBe("486px");
    expect(box()!.style.transform).toContain("-100%");
  });

  it("stays open while the mouse crosses from the point into the box", () => {
    renderChart();
    fireEvent.mouseEnter(dots()[0]);
    fireEvent.mouseLeave(dots()[0]);
    act(() => jest.advanceTimersByTime(100));
    fireEvent.mouseEnter(box()!);
    act(() => jest.advanceTimersByTime(1000));
    expect(box()).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "inside" })).toBeInTheDocument();
  });

  it("closes about 200ms after the mouse has left both", () => {
    renderChart();
    fireEvent.mouseEnter(dots()[0]);
    fireEvent.mouseLeave(dots()[0]);
    fireEvent.mouseEnter(box()!);
    fireEvent.mouseLeave(box()!);
    act(() => jest.advanceTimersByTime(150));
    expect(box()).toBeInTheDocument();
    act(() => jest.advanceTimersByTime(100));
    expect(box()).not.toBeInTheDocument();
  });

  it("stays open after a click until Escape", () => {
    renderChart();
    fireEvent.click(dots()[0]);
    fireEvent.mouseLeave(dots()[0]);
    act(() => jest.advanceTimersByTime(1000));
    expect(box()).toBeInTheDocument();
    fireEvent.keyDown(document, { key: "Escape" });
    expect(box()).not.toBeInTheDocument();
  });

  it("stays open after a click until a click elsewhere, but not a click inside it", () => {
    renderChart();
    fireEvent.click(dots()[0]);
    fireEvent.mouseDown(screen.getByRole("button", { name: "inside" }));
    expect(box()).toBeInTheDocument();
    fireEvent.mouseDown(document.body);
    expect(box()).not.toBeInTheDocument();
  });

  it("lets the mouse reach the kind of kappa inside the box", () => {
    render(
      <AgreementTrendChart
        series={series}
        renderHover={() => (
          <KappaCell fields={{ kappa: 0.2, kappa_type: "cohen" }} />
        )}
      />,
    );
    fireEvent.mouseEnter(dots()[0]);
    fireEvent.mouseLeave(dots()[0]);
    fireEvent.mouseEnter(box()!);
    const icon = screen.getByRole("button", { name: "Cohen's kappa" });
    fireEvent.mouseEnter(icon.parentElement!);
    act(() => jest.advanceTimersByTime(1000));
    expect(box()).toBeInTheDocument();
    expect(screen.getByText("Cohen's kappa")).toBeInTheDocument();
  });
});

