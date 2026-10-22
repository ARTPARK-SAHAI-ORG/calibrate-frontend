/**
 * The Overview tab of Human alignment: the two overall numbers, the section
 * title, and the table of evaluators. The page chrome is stubbed.
 */
import React from "react";
import { render, screen } from "@/test-utils";

jest.mock("next/navigation", () => ({
  __esModule: true,
  useRouter: () => ({ push: jest.fn(), replace: jest.fn(), back: jest.fn() }),
  usePathname: () => "/human-alignment",
  useSearchParams: () => new URLSearchParams("tab=overview"),
  useParams: () => ({}),
  redirect: jest.fn(),
  notFound: jest.fn(),
}));

jest.mock("../../../../components/AppLayout", () => ({
  AppLayout: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  useHideFloatingButton: () => {},
}));

jest.mock("../../../../hooks", () => ({
  ...jest.requireActual("../../../../hooks"),
  useAccessToken: () => "test-token",
}));

const AGREEMENT = {
  human_human: { current: 0.72, pair_count: 10 },
  evaluators_with_humans: { current: null, pair_count: 0 },
  evaluators: [
    {
      evaluator_id: "ev-1",
      name: "Tone",
      current: 0.9,
      pair_count: 4,
      kappa: 0.5,
      kappa_type: "cohen",
      chance_agreement: 0.6,
    },
  ],
};

jest.mock("../../../../lib/api", () => ({
  ...jest.requireActual("../../../../lib/api"),
  apiClient: (endpoint: string) =>
    Promise.resolve(endpoint.startsWith("/annotation-agreement") ? AGREEMENT : []),
}));

import HumanLabellingPage from "../page";

it("shows the overall numbers like the score cards, and the plain-words subtitle", async () => {
  render(<HumanLabellingPage />);
  expect(
    await screen.findByText(
      "How often annotators agree with each other, and how often each evaluator agrees with them",
    ),
  ).toBeInTheDocument();
  // The overall numbers are drawn like the task page's score cards: a pill
  // label over a large percentage in the agreement colour.
  const card = (label: string) =>
    screen
      .getAllByText(label)
      .find((el) => el.closest("span.rounded-md"))!
      .closest(".rounded-lg") as HTMLElement;
  expect(card("Inter-annotator agreement")).toHaveTextContent(
    "Inter-annotator agreement72%",
  );
  expect(screen.getByText("72%").className).toContain("text-yellow-600");
  expect(card("Evaluator agreement with humans")).toHaveTextContent(
    "Evaluator agreement with humans—",
  );
  expect(screen.queryByRole("switch")).not.toBeInTheDocument();
  expect(screen.getAllByRole("button", { name: "Tone" }).length).toBeGreaterThan(0);
});
