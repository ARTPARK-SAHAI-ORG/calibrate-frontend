/**
 * The Overview tab of one annotator's page: agreement with the other
 * annotators and a kappa for each kind of answer, as cards. The page chrome
 * is stubbed so only the cards run.
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

const detail = (
  current_agreement: number | null,
  kappa_by_kind: unknown[],
) => ({
  annotator: { uuid: "ann-1", name: "Asha" },
  stats: { current_agreement, pair_count: 5, jobs_count: 2, kappa_by_kind },
  jobs: [],
});

// The one card on the Overview tab.
const card = () =>
  screen.getByText("Agreement with others").closest(".rounded-lg") as HTMLElement;

it("shows agreement with others, then each kind's agreement, kappa and bar, in one card", async () => {
  render(<AnnotatorDetailPage />);
  expect(requested).toBe("/annotators/ann-1");
  resolveDetail(
    detail(0.62, [
      {
        answer_kind: "binary",
        agreement: 0.75,
        pair_count: 8,
        kappa: 0.31,
        kappa_type: "cohen",
        chance_agreement: 0.6,
      },
      {
        answer_kind: "rating",
        agreement: 0.4,
        pair_count: 5,
        kappa: null,
        kappa_type: "linear_weighted_cohen",
        kappa_blank_reason: "everyone_agreed",
        chance_agreement: 0.55,
      },
    ]),
  );
  expect(await screen.findByText("62%")).toBeInTheDocument();
  // The large number on top, then the binary line, then the rating line.
  expect(card()).toHaveTextContent(
    /^Agreement with others62%Binary labels75%Kappa0\.31Rating labels40%KappaEveryone agreed$/,
  );
  expect(card().className).toContain("w-full");
  expect(screen.getByText("62%").className).toContain("text-foreground");
  const fills = within(card()).getAllByTestId("agreement-fill");
  expect(fills.map((f) => f.style.width)).toEqual(["75%", "40%"]);
  expect(fills[0].className).toContain("bg-green-500");
  expect(fills[1].className).toContain("bg-red-500");
  expect(
    within(card()).getAllByTestId("chance-tick").map((t) => t.style.left),
  ).toEqual(["60%", "55%"]);
  // Both labels share one width, so the values line up.
  expect(screen.getByText("Binary labels").className).toContain("w-28");
  expect(screen.getByText("Rating labels").className).toContain("w-28");
  // The labels are readable text; only the dashes are muted.
  expect(screen.getByText("Binary labels").className).toContain(
    "text-foreground",
  );
  expect(screen.getByText("Binary labels").className).toContain("font-medium");
  expect(screen.getByText("Binary labels").className).not.toContain(
    "text-muted-foreground",
  );
  // The legend explains the bars, as on the Overview tab.
  expect(screen.getByText("Agreement expected by chance alone")).toBeInTheDocument();
  expect(screen.getByText("Jobs (2)")).toBeInTheDocument();
});

it("shows a muted dash and no bar for a kind with nothing compared", async () => {
  render(<AnnotatorDetailPage />);
  resolveDetail(
    detail(0.7, [
      {
        answer_kind: "binary",
        agreement: 0.7,
        pair_count: 4,
        kappa: 0.2,
        kappa_type: "cohen",
        chance_agreement: 0.5,
      },
    ]),
  );
  expect(await screen.findByText("Jobs (2)")).toBeInTheDocument();
  const rating = screen.getByText("Rating labels").parentElement as HTMLElement;
  expect(within(rating).getByText("—").className).toContain(
    "text-muted-foreground",
  );
  expect(within(rating).queryByTestId("agreement-fill")).not.toBeInTheDocument();
  expect(within(card()).getAllByTestId("agreement-fill")).toHaveLength(1);
});

it("shows muted dashes and no legend when nothing has been compared", async () => {
  render(<AnnotatorDetailPage />);
  resolveDetail(detail(null, []));
  expect(await screen.findByText("Jobs (2)")).toBeInTheDocument();
  const dashes = within(card()).getAllByText("—");
  expect(dashes).toHaveLength(3);
  for (const dash of dashes)
    expect(dash.className).toContain("text-muted-foreground");
  expect(screen.queryByText("Better than chance")).not.toBeInTheDocument();
});
