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

it("shows agreement with others and both kappas in one full-width card", async () => {
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
  // Pill, then the number, then the binary line, then the rating line.
  expect(card()).toHaveTextContent(
    /^Agreement with others62%Kappa \(binary\)0\.31Kappa \(rating\)Everyone agreed$/,
  );
  expect(card().className).toContain("w-full");
  // The same neutral percentage as the overall cards elsewhere.
  expect(screen.getByText("62%").className).toContain("text-foreground");
  // The kappas are lines inside the card, not cards of their own.
  expect(screen.getByText("Kappa (binary)").closest("span.rounded-md")).toBeNull();
  // Both labels share one width, so the values line up.
  expect(screen.getByText("Kappa (binary)").className).toContain("w-28");
  expect(screen.getByText("Kappa (rating)").className).toContain("w-28");
  expect(
    within(card()).getByRole("button", { name: "Cohen's kappa" }),
  ).toBeInTheDocument();
  expect(screen.getByText("Jobs (2)")).toBeInTheDocument();
});

it("shows muted dashes when nothing has been compared", async () => {
  render(<AnnotatorDetailPage />);
  resolveDetail(detail(null, []));
  expect(await screen.findByText("Jobs (2)")).toBeInTheDocument();
  const dashes = within(card()).getAllByText("—");
  expect(dashes).toHaveLength(3);
  for (const dash of dashes)
    expect(dash.className).toContain("text-muted-foreground");
});
