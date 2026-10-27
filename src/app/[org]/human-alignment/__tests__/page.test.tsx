/**
 * The Overview tab of Human alignment: the two overall numbers, the section
 * title, and the table of evaluators. The page chrome is stubbed.
 */
import React from "react";
import { render, screen, within } from "@/test-utils";

let mockTab = "overview";

jest.mock("next/navigation", () => ({
  __esModule: true,
  useRouter: () => ({ push: jest.fn(), replace: jest.fn(), back: jest.fn() }),
  usePathname: () => "/human-alignment",
  useSearchParams: () => new URLSearchParams(`tab=${mockTab}`),
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

// A stand-in, so the Overview test can tell whether the chart is drawn.
jest.mock("../../../../components/charts/AgreementTrendChart", () => ({
  AgreementTrendChart: () => <div data-testid="trend-chart" />,
  TrendHoverBox: () => null,
}));

let mockAgreement: unknown = null;
let mockTasks: unknown[] = [];

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
    // Nothing compared yet, so All tasks leaves it out.
    { evaluator_id: "ev-2", name: "Ghost", current: null, pair_count: 0 },
  ],
};

const ANNOTATORS = [
  {
    uuid: "a-1",
    name: "Asha",
    jobs_count: 3,
    current_agreement: 0.42,
    kappa_by_kind: [
      { answer_kind: "binary", kappa: 0.31, kappa_type: "cohen" },
    ],
  },
  {
    uuid: "a-2",
    name: "Bilal",
    jobs_count: 1,
    current_agreement: 0.9,
    kappa_by_kind: [
      {
        answer_kind: "rating",
        kappa: null,
        kappa_type: "linear_weighted_cohen",
        kappa_blank_reason: "everyone_agreed",
      },
    ],
  },
  { uuid: "a-3", name: "Chen", jobs_count: 0, current_agreement: null },
  { uuid: "a-4", name: "Dana", jobs_count: 0, current_agreement: null },
];

jest.mock("../../../../lib/api", () => ({
  ...jest.requireActual("../../../../lib/api"),
  apiClient: (endpoint: string) =>
    Promise.resolve(
      endpoint === "/annotation-agreement"
        ? (mockAgreement ?? AGREEMENT)
        : endpoint === "/annotators"
          ? ANNOTATORS
          : endpoint === "/annotation-tasks"
            ? mockTasks
            : [],
    ),
}));

import HumanLabellingPage from "../page";

it("shows the overall numbers as neutral pill cards, the plain-words subtitle, and no chart", async () => {
  render(<HumanLabellingPage />);
  expect(
    await screen.findByText(
      "How often annotators agree with each other, and how often each evaluator agrees with them",
    ),
  ).toBeInTheDocument();
  // The overall numbers are pill cards like the task page's score cards,
  // with the percentage in the neutral text colour.
  const card = (label: string) =>
    screen
      .getAllByText(label)
      .find((el) => el.closest("span.rounded-md"))!
      .closest(".rounded-lg") as HTMLElement;
  expect(card("Inter-annotator agreement")).toHaveTextContent(
    "Inter-annotator agreement72%",
  );
  expect(screen.getByText("72%").className).toContain("text-foreground");
  expect(screen.getByText("72%").className).not.toMatch(
    /text-(green|red|yellow)/,
  );
  expect(card("Evaluator agreement with humans")).toHaveTextContent(
    "Evaluator agreement with humans—",
  );
  expect(screen.queryByRole("switch")).not.toBeInTheDocument();
  expect(screen.queryByTestId("trend-chart")).not.toBeInTheDocument();
  expect(screen.getAllByRole("button", { name: "Tone" }).length).toBeGreaterThan(0);
  expect(screen.queryByRole("button", { name: "Ghost" })).not.toBeInTheDocument();
});

describe("the Annotators tab", () => {
  beforeEach(() => {
    mockTab = "annotators";
  });
  afterEach(() => {
    mockTab = "overview";
  });

  // The table and the cards are both on the page; the screen width picks one.
  const table = () =>
    screen
      .getByText("Agreement with others")
      .closest(".md\\:block") as HTMLElement;
  const row = (name: string) =>
    within(table()).getByText(name).closest(".grid") as HTMLElement;
  const cells = (el: HTMLElement) =>
    [...el.children].map((c) => c as HTMLElement);

  it("has a column for agreement and one kappa column per kind of answer", async () => {
    render(<HumanLabellingPage />);
    await screen.findAllByText("Asha");
    const header = cells(
      screen.getByText("Agreement with others").parentElement as HTMLElement,
    ).map((c) => c.textContent);
    // Each kappa heading says what it measures on hover of its (i).
    expect(
      screen.getByRole("button", {
        name: "Agreement with the other annotators on binary labels, after removing what chance alone would produce. 1 is full agreement, 0 is no better than chance, below 0 is worse than chance",
      }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", {
        name: "Agreement with the other annotators on rating-style labels, after removing what chance alone would produce. Close ratings get partial credit. 1 is full agreement, 0 is no better than chance, below 0 is worse than chance",
      }),
    ).toBeInTheDocument();
    expect(header).toEqual([
      "Name",
      "Jobs",
      "Agreement with others",
      "Kappa (binary)",
      "Kappa (rating)",
      "",
    ]);
  });

  it("shows agreement in a neutral colour and each kappa on one line", async () => {
    render(<HumanLabellingPage />);
    await screen.findAllByText("Asha");
    const asha = cells(row("Asha"));
    // Rows keep one height whether a cell holds a number, a pill or a dash.
    expect(row("Asha").className).toContain("min-h-12");
    expect(asha[2].textContent).toBe("42%");
    expect(asha[2].className).toContain("text-foreground");
    expect(asha[2].className).not.toMatch(/text-(green|red|yellow)/);
    expect(asha[3].textContent).toBe("0.31");
    expect(asha[3].className).toContain("whitespace-nowrap");
    // No rating kappa for Asha, so a muted dash.
    expect(within(asha[4]).getByText("—").className).toContain(
      "text-muted-foreground",
    );
    const bilal = cells(row("Bilal"));
    expect(within(bilal[3]).getByText("—")).toBeInTheDocument();
    expect(bilal[4].textContent).toBe("Everyone agreed");
    expect(bilal[4].className).toContain("whitespace-nowrap");
  });

  it("shows every annotator as a normal row, including ones with nothing compared", async () => {
    render(<HumanLabellingPage />);
    await screen.findAllByText("Asha");
    const chen = cells(row("Chen"));
    expect(chen[2].textContent).toBe("—");
    expect(chen[3].textContent).toBe("—");
    expect(chen[4].textContent).toBe("—");
    expect(within(table()).getByText("Dana")).toBeInTheDocument();
    expect(
      screen.queryByText(/have not labelled anything yet/),
    ).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Show" })).not.toBeInTheDocument();
  });

  it("names the kappa columns on the cards the same way", async () => {
    render(<HumanLabellingPage />);
    await screen.findAllByText("Asha");
    const card = screen
      .getAllByText("Asha")
      .find((el) => !table().contains(el))!
      .closest(".rounded-xl") as HTMLElement;
    expect(card).toHaveTextContent("Kappa (binary) 0.31");
    expect(card).toHaveTextContent("Kappa (rating) —");
    expect(card).toHaveTextContent("42% agreement with others");
  });
});

it("keeps evaluators of the same type together in the Overview table", async () => {
  const ev = (id: string, name: string, current: number) => ({
    evaluator_id: id,
    name,
    current,
    pair_count: 4,
    kappa: 0.3,
    kappa_type: "cohen",
  });
  // Highest agreement first would interleave the two types; grouping keeps
  // the two conversation evaluators together.
  mockAgreement = {
    human_human: { current: 0.7, pair_count: 6 },
    evaluators_with_humans: { current: 0.8, pair_count: 12 },
    evaluators: [
      ev("ev-a", "Accuracy", 0.9),
      ev("ev-b", "Brevity", 0.8),
      ev("ev-c", "Courtesy", 0.7),
    ],
  };
  mockTasks = [
    {
      uuid: "t-1",
      name: "Calls",
      type: "conversation",
      has_agreement: true,
      evaluators: [
        { uuid: "ev-a", name: "Accuracy", evaluator_type: "conversation" },
        { uuid: "ev-b", name: "Brevity", evaluator_type: "llm" },
        { uuid: "ev-c", name: "Courtesy", evaluator_type: "conversation" },
      ],
    },
  ];
  try {
    render(<HumanLabellingPage />);
    await screen.findAllByRole("button", { name: "Accuracy" });
    const table = screen
      .getByRole("button", { name: /^Evaluator$/ })
      .closest(".md\\:block") as HTMLElement;
    const order = [...table.querySelectorAll(".grid")]
      .slice(1)
      .map(
        (row) =>
          within(row as HTMLElement).getAllByRole("button")[0].textContent,
      );
    expect(order).toEqual(["Accuracy", "Courtesy", "Brevity"]);
  } finally {
    mockAgreement = null;
    mockTasks = [];
  }
});

