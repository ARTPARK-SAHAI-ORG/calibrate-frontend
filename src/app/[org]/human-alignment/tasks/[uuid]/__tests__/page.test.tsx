/**
 * The Score reliability section on a labelling task's Overview tab. The page
 * chrome is stubbed so only the tab runs.
 */
import React from "react";
import { render, screen, within } from "@/test-utils";

jest.mock("next/navigation", () => ({
  __esModule: true,
  useRouter: () => ({ push: jest.fn(), replace: jest.fn(), back: jest.fn(), prefetch: jest.fn() }),
  usePathname: () => "/human-alignment/tasks/t-1",
  useSearchParams: () => new URLSearchParams("tab=overview"),
  useParams: () => ({ uuid: "t-1" }),
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

// The bulk upload dialogs build sample PDFs; nothing here downloads one.
jest.mock("jspdf", () => ({ jsPDF: class {} }));

const TASK = {
  uuid: "t-1",
  name: "Calls",
  type: "llm",
  evaluators: [
    { uuid: "ev-1", name: "Tone", evaluator_type: "llm", output_type: "binary" },
    { uuid: "ev-2", name: "Brevity", evaluator_type: "llm", output_type: "binary" },
  ],
};

const AGREEMENT = {
  human_human: { current: 0.7, pair_count: 6 },
  evaluators_with_humans: { current: 0.85, pair_count: 8 },
  evaluators: [
    {
      evaluator_id: "ev-1",
      name: "Tone",
      current: 0.9,
      pair_count: 4,
      kappa: 0.5,
      kappa_type: "cohen",
      inter_annotator: { current: 0.75, pair_count: 3 },
      result: { count: 4, true_count: 3 },
    },
    {
      evaluator_id: "ev-2",
      name: "Brevity",
      current: 0.8,
      pair_count: 4,
      kappa: 0.2,
      kappa_type: "cohen",
      inter_annotator: { current: 0.6, pair_count: 3 },
      result: { count: 4, true_count: 2 },
    },
  ],
};

jest.mock("../../../../../../lib/api", () => ({
  ...jest.requireActual("../../../../../../lib/api"),
  apiClient: (endpoint: string) =>
    Promise.resolve(
      endpoint === "/annotation-tasks/t-1"
        ? TASK
        : endpoint === "/annotation-tasks/t-1/agreement"
          ? AGREEMENT
          : endpoint.startsWith("/annotation-tasks/t-1/summary")
            ? { items: [], rows: [], evaluators: [], annotators: [], pagination: { total: 0, limit: 50, offset: 0 } }
            : endpoint === "/annotation-tasks/t-1/evaluator-runs"
              ? { runs: [], evaluators: [] }
              : [],
    ),
}));

import LabellingTaskPage from "../page";

it("shows Score reliability as the Overview's cards and table, one row per linked evaluator", async () => {
  render(<LabellingTaskPage />);
  const section = (await screen.findByText("Score reliability")).closest(
    "section",
  ) as HTMLElement;
  const card = (label: string) =>
    within(section)
      .getAllByText(label)
      .find((el) => el.closest("span.rounded-md"))!
      .closest(".rounded-lg") as HTMLElement;
  expect(card("Inter-annotator agreement")).toHaveTextContent(
    "Inter-annotator agreement70%",
  );
  expect(card("Evaluator agreement with humans")).toHaveTextContent(
    "Evaluator agreement with humans85%",
  );
  const table = within(section)
    .getByRole("button", { name: /^Evaluator$/ })
    .closest(".md\\:block") as HTMLElement;
  const rows = [...table.querySelectorAll(".grid")].slice(1) as HTMLElement[];
  // Highest agreement with humans first, the sort the Overview starts on.
  expect(rows.map((r) => within(r).getAllByRole("button")[0].textContent)).toEqual([
    "Tone",
    "Brevity",
  ]);
  expect(rows[0]).toHaveTextContent("75%");
  expect(rows[0]).toHaveTextContent("90%");
});
