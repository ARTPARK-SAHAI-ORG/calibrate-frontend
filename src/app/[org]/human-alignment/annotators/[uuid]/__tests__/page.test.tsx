/**
 * The stat cards at the top of one annotator's page: the latest agreement,
 * the latest kappa for each kind of answer, and the number of jobs. The page
 * chrome is stubbed so only the cards run.
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

jest.mock("../../../../../../hooks", () => ({
  ...jest.requireActual("../../../../../../hooks"),
  useAccessToken: () => "test-token",
}));

let resolveDetail: (value: unknown) => void = () => {};
jest.mock("../../../../../../lib/api", () => ({
  ...jest.requireActual("../../../../../../lib/api"),
  apiClient: () =>
    new Promise((resolve) => {
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
  jobs: [],
});

const kappaCard = () =>
  screen.getByText("Latest kappa").parentElement as HTMLElement;

it("shows the Latest kappa card with a dash while the annotator loads", () => {
  render(<AnnotatorDetailPage />);
  expect(within(kappaCard()).getByText("—")).toBeInTheDocument();
});

it("shows one kappa per kind of answer once loaded", async () => {
  render(<AnnotatorDetailPage />);
  resolveDetail(
    detail([
      { answer_kind: "binary", kappa: 0.31, kappa_type: "cohen" },
      {
        answer_kind: "rating",
        kappa: 0.62,
        kappa_type: "linear_weighted_cohen",
      },
    ]),
  );
  expect(await within(kappaCard()).findByText("0.31")).toBeInTheDocument();
  expect(kappaCard()).toHaveTextContent("Binary0.31");
  expect(kappaCard()).toHaveTextContent("Rating0.62");
});

it("shows a dash when no kind of answer was compared", async () => {
  render(<AnnotatorDetailPage />);
  resolveDetail(detail([]));
  expect(await screen.findByText("80%")).toBeInTheDocument();
  expect(within(kappaCard()).getByText("—")).toBeInTheDocument();
});
