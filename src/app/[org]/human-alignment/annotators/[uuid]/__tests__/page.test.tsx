/**
 * The stat cards at the top of one annotator's page: the latest agreement,
 * the latest kappa for each kind of answer, and the number of jobs. The page
 * chrome and the trend chart are stubbed so only the cards run.
 */
import React from "react";
import { render, screen, within } from "@/test-utils";

jest.mock("next/navigation", () => ({
  __esModule: true,
  useRouter: () => ({ push: jest.fn(), replace: jest.fn(), back: jest.fn() }),
  usePathname: () => "/human-alignment/annotators/ann-1",
  useSearchParams: () => new URLSearchParams(),
  useParams: () => ({ uuid: "ann-1" }),
  redirect: jest.fn(),
  notFound: jest.fn(),
}));

jest.mock("../../../../../../components/AppLayout", () => ({
  AppLayout: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  useHideFloatingButton: () => {},
}));

// The trend chart cannot be laid out in jsdom; a stand-in shows which lines
// the page asks it to draw.
jest.mock("../../../../../../components/charts/AgreementTrendChart", () => ({
  AgreementTrendChart: ({
    series,
    renderHover,
  }: {
    series: {
      name: string;
      kappaName?: string;
      points: { key: string; label: string }[];
    }[];
    renderHover?: (key: string, label: string) => React.ReactNode;
  }) => (
    <div data-testid="trend-chart">
      <span data-testid="line-names">
        {series.map((s) => [s.name, s.kappaName].filter(Boolean).join(", ")).join("; ")}
      </span>
      {series[0].points.map((p) => (
        <div key={p.key} data-testid={`hover-${p.key}`}>
          {renderHover?.(p.key, p.label)}
        </div>
      ))}
    </div>
  ),
  TrendHoverBox: ({
    label,
    children,
  }: {
    label: React.ReactNode;
    children: React.ReactNode;
  }) => (
    <div>
      <div data-testid="hover-label">{label}</div>
      {children}
    </div>
  ),
}));

jest.mock("../../../../../../hooks", () => ({
  ...jest.requireActual("../../../../../../hooks"),
  useAccessToken: () => "test-token",
}));

let resolveDetail: (value: unknown) => void = () => {};
let requested = "";
jest.mock("../../../../../../lib/api", () => ({
  ...jest.requireActual("../../../../../../lib/api"),
  apiClient: (endpoint: string) =>
    new Promise((resolve) => {
      requested = endpoint;
      resolveDetail = resolve;
    }),
}));

import AnnotatorDetailPage from "../page";

const detail = (kappa_by_kind: unknown[]) => ({
  annotator: { uuid: "ann-1", name: "Asha" },
  stats: {
    current_agreement: 0.8,
    pair_count: 5,
    jobs_count: 2,
    kappa_by_kind,
  },
  trend: { bucket: "month", days: 365, series: [] },
  jobs: [],
});

const point = (
  bucket_end: string,
  agreement: number | null,
  kappa_by_kind: unknown[],
) => ({
  bucket_start: "2026-01-01",
  bucket_end,
  agreement,
  pair_count: 3,
  kappa_by_kind,
});

it("shows only the trend chart on the Overview tab, with no stat cards", async () => {
  render(<AnnotatorDetailPage />);
  resolveDetail({
    ...detail([]),
    trend: {
      bucket: "month",
      days: 365,
      series: [point("2026-01-31", 0.8, [])],
    },
  });
  expect(await screen.findByTestId("trend-chart")).toBeInTheDocument();
  expect(screen.queryByText("Latest agreement")).not.toBeInTheDocument();
  expect(screen.queryByText("Latest kappa")).not.toBeInTheDocument();
  // The job count stays on the Jobs tab.
  expect(screen.getByText("Jobs (2)")).toBeInTheDocument();
});

it("draws the agreement trend, with one kappa line per kind of answer", async () => {
  render(<AnnotatorDetailPage />);
  expect(requested).toBe("/annotators/ann-1?bucket=month&days=365");
  resolveDetail({
    ...detail([]),
    trend: {
      bucket: "month",
      days: 365,
      series: [
        point("2026-01-31", 0.8, [
          { answer_kind: "binary", kappa: 0.3, kappa_type: "cohen" },
          { answer_kind: "rating", kappa: 0.6, kappa_type: "linear_weighted_cohen" },
        ]),
      ],
    },
  });
  expect(await screen.findByTestId("line-names")).toHaveTextContent(
    "Agreement with other annotators; Binary answers; Rating answers",
  );
});

it("shows a point's agreement, both kappas and its bar on hover", async () => {
  render(<AnnotatorDetailPage />);
  resolveDetail({
    ...detail([]),
    trend: {
      bucket: "month",
      days: 365,
      series: [
        point("2026-01-31", 0.8, [
          { answer_kind: "binary", kappa: 0.3, kappa_type: "cohen" },
          {
            answer_kind: "rating",
            kappa: null,
            kappa_type: "linear_weighted_cohen",
            kappa_blank_reason: "everyone_agreed",
          },
        ]),
        point("2026-02-28", 0.6, []),
      ],
    },
  });
  const jan = await screen.findByTestId("hover-2026-01-31");
  expect(within(jan).getByText("80%")).toBeInTheDocument();
  expect(jan).toHaveTextContent("Kappa (binary)0.30");
  expect(jan).toHaveTextContent("Kappa (rating)Everyone agreed");
  expect(within(jan).getByTestId("agreement-fill").style.width).toBe("80%");
  const feb = screen.getByTestId("hover-2026-02-28");
  expect(feb).toHaveTextContent("60%");
  expect(feb).toHaveTextContent("Kappa (binary)—");
  expect(feb).toHaveTextContent("Kappa (rating)—");
});
