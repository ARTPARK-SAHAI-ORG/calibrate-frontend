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

// The card whose pill reads `label`.
const card = (label: string) =>
  screen.getByText(label).closest(".rounded-lg") as HTMLElement;

it("shows agreement with others and one kappa card per kind of answer", async () => {
  render(<AnnotatorDetailPage />);
  expect(requested).toBe("/annotators/ann-1");
  resolveDetail(
    detail(0.62, [
      { answer_kind: "binary", kappa: 0.31, kappa_type: "cohen" },
      {
        answer_kind: "rating",
        kappa: null,
        kappa_type: "linear_weighted_cohen",
        kappa_blank_reason: "everyone_agreed",
      },
    ]),
  );
  expect(await screen.findByText("62%")).toBeInTheDocument();
  expect(card("Agreement with others")).toHaveTextContent(
    "Agreement with others62%",
  );
  // The same neutral percentage as the overall cards elsewhere.
  expect(screen.getByText("62%").className).toContain("text-foreground");
  expect(screen.getByText("62%").className).not.toMatch(
    /text-(green|red|yellow)/,
  );
  expect(card("Kappa (binary)")).toHaveTextContent("Kappa (binary)0.31");
  expect(
    within(card("Kappa (binary)")).getByRole("button", {
      name: "Cohen's kappa",
    }),
  ).toBeInTheDocument();
  expect(card("Kappa (rating)")).toHaveTextContent(
    "Kappa (rating)Everyone agreed",
  );
  // The pill label is the same pill the overall cards use.
  expect(
    screen.getByText("Kappa (rating)").closest("span.rounded-md"),
  ).not.toBeNull();
  expect(screen.queryByText(/Agreement with other annotators/)).toBeNull();
  // The job count stays on the Jobs tab.
  expect(screen.getByText("Jobs (2)")).toBeInTheDocument();
});

it("shows muted dashes when nothing has been compared", async () => {
  render(<AnnotatorDetailPage />);
  resolveDetail(detail(null, []));
  expect(await screen.findByText("Jobs (2)")).toBeInTheDocument();
  for (const label of [
    "Agreement with others",
    "Kappa (binary)",
    "Kappa (rating)",
  ]) {
    const dash = within(card(label)).getByText("—");
    expect(dash.className).toContain("text-muted-foreground");
  }
});
