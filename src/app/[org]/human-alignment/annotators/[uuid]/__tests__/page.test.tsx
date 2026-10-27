/**
 * The Overview tab of one annotator's page: agreement with the other
 * annotators and a kappa for each kind of answer, as cards. The page chrome
 * is stubbed so only the cards run.
 */
import React from "react";
import { act, render, screen, within } from "@/test-utils";

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
let rejectDetail: (reason: unknown) => void = () => {};
let requested = "";
jest.mock("../../../../../../lib/api", () => ({
  ...jest.requireActual("../../../../../../lib/api"),
  apiClient: (endpoint: string) =>
    new Promise((resolve, reject) => {
      requested = endpoint;
      resolveDetail = resolve;
      rejectDetail = reject;
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

// The three columns of the card on the Overview tab, by their titles.
const column = (title: string) =>
  screen.getByText(title).parentElement as HTMLElement;

it("shows overall, binary and rating agreement side by side in one card", async () => {
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
  expect(screen.getByText("Agreement with other annotators").tagName).toBe("H3");
  expect(
    screen.getByText(
      "How often this annotator's labels match other annotators' labels on the same items",
    ),
  ).toBeInTheDocument();
  expect(screen.queryByText("Agreement with others")).toBeNull();

  const card = column("Overall").parentElement as HTMLElement;
  expect(card.className).toContain("md:grid-cols-3");
  expect(card.className).toContain("md:divide-x");
  expect([...card.children].map((c) => c.firstChild!.textContent)).toEqual([
    "Overall",
    "Binary labels",
    "Rating labels",
  ]);
  for (const title of ["Overall", "Binary labels", "Rating labels"]) {
    const heading = screen.getByText(title);
    expect(heading.className).toContain("text-foreground");
    expect(heading.className).toContain("font-medium");
    expect(heading.closest("span.rounded-md")).toBeNull();
  }

  expect(column("Overall")).toHaveTextContent(/^Overall62%$/);
  expect(screen.getByText("62%").className).toContain("text-2xl");
  expect(screen.getByText("62%").className).toContain("text-foreground");
  expect(screen.getByText("62%").className).not.toMatch(
    /text-(green|red|yellow)/,
  );
  expect(column("Binary labels")).toHaveTextContent(
    /^Binary labels75%Chance 60%Kappa0\.31$/,
  );
  expect(screen.getByText("75%").className).toContain("text-2xl");
  expect(column("Rating labels")).toHaveTextContent(
    /^Rating labels40%Chance 55%KappaEveryone agreed$/,
  );
  const fills = within(card).getAllByTestId("agreement-fill");
  expect(fills.map((f) => f.style.width)).toEqual(["75%", "40%"]);
  expect(fills[0].className).toContain("bg-green-500");
  expect(fills[1].className).toContain("bg-red-500");
  expect(
    within(card).getAllByTestId("chance-tick").map((t) => t.style.left),
  ).toEqual(["60%", "55%"]);
  expect(screen.getByText("Agreement expected by chance alone")).toBeInTheDocument();
  expect(screen.getByText("Jobs (2)")).toBeInTheDocument();
});

it("shows a large muted dash and no bar for a kind with nothing compared", async () => {
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
  const rating = column("Rating labels");
  const dash = within(rating).getByText("—");
  expect(dash.className).toContain("text-muted-foreground");
  expect(dash.className).toContain("text-2xl");
  expect(within(rating).queryByTestId("agreement-fill")).not.toBeInTheDocument();
  expect(within(column("Binary labels")).getByTestId("agreement-fill")).toBeInTheDocument();
});

it("shows an empty state instead of the card when nothing has been compared", async () => {
  render(<AnnotatorDetailPage />);
  resolveDetail(
    detail(null, [
      {
        answer_kind: "binary",
        agreement: null,
        pair_count: 0,
        kappa: null,
        kappa_blank_reason: "too_few_items",
      },
    ]),
  );
  expect(await screen.findByText("No agreement yet")).toBeInTheDocument();
  expect(
    screen.getByText(
      "Agreement appears once another annotator labels the same items as this annotator",
    ),
  ).toBeInTheDocument();
  expect(screen.queryByText("Overall")).not.toBeInTheDocument();
  expect(
    screen.queryByText("Agreement with other annotators"),
  ).not.toBeInTheDocument();
});

it("keeps the card when only one kind of answer has a number", async () => {
  render(<AnnotatorDetailPage />);
  resolveDetail(
    detail(null, [
      { answer_kind: "rating", agreement: null, pair_count: 3, kappa: 0.1 },
    ]),
  );
  expect(await screen.findByText("Overall")).toBeInTheDocument();
  expect(within(column("Overall")).getByText("—").className).toContain(
    "text-muted-foreground",
  );
  expect(screen.queryByText("No agreement yet")).not.toBeInTheDocument();
});

// The page title is a dash until the name arrives; only the agreement
// numbers below it matter here.
const agreementDashes = () =>
  screen.queryAllByText("—").filter((el) => el.tagName !== "H1");

it("says it is loading, not dashes, until the agreement arrives", async () => {
  render(<AnnotatorDetailPage />);
  expect(await screen.findByText("Loading agreement")).toBeInTheDocument();
  expect(agreementDashes()).toEqual([]);
  expect(screen.queryByText("Overall")).not.toBeInTheDocument();
  resolveDetail(detail(0.62, []));
  expect(await screen.findByText("Overall")).toBeInTheDocument();
  expect(screen.queryByText("Loading agreement")).not.toBeInTheDocument();
});

it("shows the error, not dashes, when the agreement fails to load", async () => {
  render(<AnnotatorDetailPage />);
  await act(async () => rejectDetail(new Error("Server is down")));
  expect(await screen.findByText("Server is down")).toBeInTheDocument();
  expect(agreementDashes()).toEqual([]);
  expect(screen.queryByText("Overall")).not.toBeInTheDocument();
  expect(screen.queryByText("Loading agreement")).not.toBeInTheDocument();
});
