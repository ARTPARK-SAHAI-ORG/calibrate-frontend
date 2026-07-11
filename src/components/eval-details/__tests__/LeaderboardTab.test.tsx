import React from "react";
import { render, screen } from "@/test-utils";
import { LeaderboardTab, type LeaderboardColumn, type ChartConfig } from "../LeaderboardTab";

const columns: LeaderboardColumn[] = [
  { key: "run", header: "Run" },
  { key: "score", header: "Score", render: (v) => `${v}%` },
];

describe("LeaderboardTab", () => {
  it("renders nothing when data is empty", () => {
    const { container } = render(
      <LeaderboardTab
        columns={columns}
        data={[]}
        charts={[]}
        filename="test"
        getLabel={(k) => k}
      />,
    );
    expect(container).toBeEmptyDOMElement();
  });

  it("renders nothing when data is null-ish", () => {
    const { container } = render(
      <LeaderboardTab
        columns={columns}
        data={null as unknown as Record<string, any>[]}
        charts={[]}
        filename="test"
        getLabel={(k) => k}
      />,
    );
    expect(container).toBeEmptyDOMElement();
  });

  it("renders the table and a chart with valid numeric data", () => {
    const data = [
      { run: "run-a", score: 90 },
      { run: "run-b", score: 80 },
    ];
    const charts: ChartConfig[][] = [
      [{ title: "Score Chart", dataKey: "score" }],
    ];
    render(
      <LeaderboardTab
        columns={columns}
        data={data}
        charts={charts}
        filename="test"
        getLabel={(k) => k.toUpperCase()}
      />,
    );
    // DownloadableTable renders header + row cells
    expect(screen.getByText("Run")).toBeInTheDocument();
    expect(screen.getByText("run-a")).toBeInTheDocument();
    expect(screen.getByText("90%")).toBeInTheDocument();
    expect(screen.getByText("Score Chart")).toBeInTheDocument();
  });

  it("shows the no-chart-data message when all values are missing/non-numeric", () => {
    const data = [
      { run: "run-a", score: "n/a" },
      { run: "run-b" },
    ];
    const charts: ChartConfig[][] = [
      [{ title: "Score Chart", dataKey: "score" }],
    ];
    render(
      <LeaderboardTab
        columns={columns}
        data={data}
        charts={charts}
        filename="test"
        getLabel={(k) => k}
      />,
    );
    expect(screen.getByText("Score Chart")).toBeInTheDocument();
    expect(
      screen.getByText("No chart data (all models missing values for this metric)."),
    ).toBeInTheDocument();
  });

  it("lays out two-chart rows in a grid and single-chart rows without the md:grid-cols-2 class", () => {
    const data = [{ run: "run-a", score: 90 }];
    const charts: ChartConfig[][] = [
      [
        { title: "Chart 1", dataKey: "score" },
        { title: "Chart 2", dataKey: "score" },
      ],
      [{ title: "Chart 3", dataKey: "score" }],
    ];
    const { container } = render(
      <LeaderboardTab
        columns={columns}
        data={data}
        charts={charts}
        filename="test"
        getLabel={(k) => k}
      />,
    );
    const rows = container.querySelectorAll(":scope > div > div.grid");
    expect(rows[0].className).toContain("md:grid-cols-2");
    expect(rows[1].className).not.toContain("md:grid-cols-2");
  });

  it("uses a custom nameKey to derive colors and labels", () => {
    const customColumns: LeaderboardColumn[] = [{ key: "model", header: "Model" }];
    const data = [{ model: "gpt-4", score: 50 }];
    const charts: ChartConfig[][] = [[{ title: "Model Chart", dataKey: "score" }]];
    render(
      <LeaderboardTab
        columns={customColumns}
        data={data}
        charts={charts}
        filename="test"
        getLabel={(k) => `Label:${k}`}
        nameKey="model"
      />,
    );
    expect(screen.getByText("gpt-4")).toBeInTheDocument();
    expect(screen.getByText("Model Chart")).toBeInTheDocument();
  });

  it("applies a custom className", () => {
    const data = [{ run: "run-a", score: 90 }];
    const { container } = render(
      <LeaderboardTab
        columns={columns}
        data={data}
        charts={[]}
        filename="test"
        getLabel={(k) => k}
        className="custom-class"
      />,
    );
    expect(container.firstChild).toHaveClass("custom-class");
  });
});
