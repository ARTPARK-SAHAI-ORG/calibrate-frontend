/**
 * The shared link to a test run.
 *
 * It reads the run without each case's conversation, answer or judge
 * reasoning, and reads one case in full when someone opens it. The summary
 * cards and the results panel are stubbed so only the page's own fetching and
 * merging run.
 */
import React from "react";
import { render, screen, waitFor, setupUser, act } from "@/test-utils";

jest.mock("next/navigation", () => ({
  __esModule: true,
  useRouter: () => ({
    push: jest.fn(),
    replace: jest.fn(),
    back: jest.fn(),
    prefetch: jest.fn(),
  }),
  usePathname: () => "/public/test-run/tok-1",
  useSearchParams: () => new URLSearchParams(),
  useParams: () => ({ token: "tok-1" }),
  redirect: jest.fn(),
  notFound: jest.fn(),
}));

const summaryProps = jest.fn();
const panelProps = jest.fn();

jest.mock("../../../../../components/eval-details", () => ({
  __esModule: true,
  TestRunSummary: (props: Record<string, unknown>) => {
    summaryProps(props);
    return <div data-testid="summary-cards" />;
  },
  TestRunOutputsPanel: (props: Record<string, unknown>) => {
    panelProps(props);
    return <div data-testid="outputs-panel" />;
  },
  LLMEvaluationAbout: () => <div data-testid="about" />,
  evaluatorSummaryToAbout: (entries: unknown) => entries,
}));

import PublicTestRunPage from "../page";

const RUN_SUMMARY = {
  task_id: "run-1",
  status: "done",
  name: "Nightly",
  total_tests: 3,
  passed: 2,
  failed: 1,
  unanswered_tests: 0,
  results: [
    {
      test_case_id: "case-1",
      name: "Refund window",
      passed: true,
      test_type: "response",
    },
    {
      test_case_id: "case-2",
      name: "Book a slot",
      passed: false,
      test_type: "tool_call",
    },
    {
      test_case_id: "case-3",
      name: "Opening hours",
      passed: true,
      test_type: "response",
    },
  ],
  evaluators: [{ uuid: "ev-1", name: "Correctness", output_type: "binary" }],
  evaluator_summary: [
    {
      metric_key: "ev-1",
      evaluator_uuid: "ev-1",
      name: "Correctness",
      type: "binary",
      passed: 1,
      total: 2,
      pass_rate: 50,
    },
  ],
};

const CASE_ONE = {
  test_case_id: "case-1",
  name: "Refund window",
  passed: true,
  test_type: "response",
  output: { response: "We refund within seven days." },
  test_case: { name: "Refund window", evaluation: { type: "response" } },
  judge_results: [
    { evaluator_uuid: "ev-1", match: true, reasoning: "Says seven days." },
  ],
};

const CASE_TWO = {
  test_case_id: "case-2",
  name: "Book a slot",
  passed: false,
  test_type: "tool_call",
  output: { tool_calls: [] },
  test_case: { name: "Book a slot", evaluation: { type: "tool_call" } },
  judge_results: [{ evaluator_uuid: "ev-tool", match: false }],
};

function jsonResponse(body: unknown) {
  return Promise.resolve({
    ok: true,
    status: 200,
    json: async () => body,
  } as Response);
}

/** Every fetch the page makes, so a test can name the ones it cares about. */
let calls: string[] = [];
/** Case ids whose fetch should fail, to prove the page survives it. */
let failingCases: Set<string>;

beforeEach(() => {
  // The public page chrome asks the browser whether it is in dark mode.
  window.matchMedia = jest.fn().mockReturnValue({
    matches: false,
    media: "(prefers-color-scheme: dark)",
    addEventListener: jest.fn(),
    removeEventListener: jest.fn(),
    addListener: jest.fn(),
    removeListener: jest.fn(),
    dispatchEvent: jest.fn(),
  });
  process.env.NEXT_PUBLIC_BACKEND_URL = "http://backend";
  calls = [];
  failingCases = new Set();
  summaryProps.mockClear();
  panelProps.mockClear();
  global.fetch = jest.fn((input: RequestInfo | URL) => {
    const url = String(input);
    calls.push(url);
    const caseMatch = url.match(/\/results\/([^?]+)$/);
    if (caseMatch) {
      const id = caseMatch[1];
      if (failingCases.has(id)) {
        return Promise.resolve({
          ok: false,
          status: 500,
          json: async () => ({}),
        } as Response);
      }
      return jsonResponse(id === "case-1" ? CASE_ONE : CASE_TWO);
    }
    return jsonResponse(RUN_SUMMARY);
  }) as unknown as typeof fetch;
});

const runCalls = () => calls.filter((u) => !u.includes("/results/"));
const caseCalls = (id: string) =>
  calls.filter((u) => u.endsWith(`/results/${id}`));

/** Show the results panel, which sits behind the second tab. */
async function openResults() {
  const user = setupUser();
  await user.click(screen.getByRole("button", { name: "Tests" }));
}

const lastPanelRows = () =>
  (
    panelProps.mock.calls.at(-1)![0] as {
      results: { output?: unknown; judgeResults?: unknown }[];
    }
  ).results;

describe("public test run page", () => {
  it("asks for the run without the weight behind each case", async () => {
    render(<PublicTestRunPage />);

    await screen.findByTestId("summary-cards");
    expect(runCalls()).toEqual([
      "http://backend/public/test-run/tok-1?mode=summary",
    ]);
  });

  it("shows a failed run with what it did finish", async () => {
    (global.fetch as jest.Mock).mockImplementation(
      (input: RequestInfo | URL) => {
        const url = String(input);
        calls.push(url);
        if (url.includes("/results/")) return jsonResponse(CASE_ONE);
        return jsonResponse({
          ...RUN_SUMMARY,
          status: "failed",
          error: "boom",
        });
      },
    );
    render(<PublicTestRunPage />);

    await screen.findByTestId("summary-cards");
    expect(
      screen.queryByText("This link is not available"),
    ).not.toBeInTheDocument();
    expect(summaryProps).toHaveBeenCalledWith(
      expect.objectContaining({ failureDetails: "boom" }),
    );
  });

  it("says the run is not there while it is still going", async () => {
    (global.fetch as jest.Mock).mockImplementation(() =>
      jsonResponse({ ...RUN_SUMMARY, status: "in_progress" }),
    );
    render(<PublicTestRunPage />);

    expect(
      await screen.findByText("This link is not available"),
    ).toBeInTheDocument();
  });

  it("shows the run's own per-evaluator totals", async () => {
    render(<PublicTestRunPage />);

    await screen.findByTestId("summary-cards");
    expect(summaryProps.mock.calls.at(-1)![0].evaluatorSummary).toEqual(
      RUN_SUMMARY.evaluator_summary,
    );
  });

  it("reads the open test in full and shows its answer", async () => {
    render(<PublicTestRunPage />);
    await screen.findByTestId("summary-cards");
    await waitFor(() => expect(caseCalls("case-1")).toHaveLength(1));

    await openResults();

    const rows = lastPanelRows();
    expect(rows[0].output).toEqual(CASE_ONE.output);
    expect(rows[0].judgeResults).toEqual(CASE_ONE.judge_results);
    // The test nobody has opened is still just its name and verdict.
    expect(rows[2].output).toBeUndefined();
  });

  it("opens the Tests tab from the note on the Results tab", async () => {
    render(<PublicTestRunPage />);
    await screen.findByTestId("summary-cards");

    // The note about tests that could not be run points at the Tests tab.
    const review = summaryProps.mock.calls.at(-1)![0]
      .onReviewUnanswered as () => void;
    await act(async () => review());

    expect(screen.getByTestId("outputs-panel")).toBeInTheDocument();
  });

  it("shows Previous and Next once a test is open", async () => {
    render(<PublicTestRunPage />);
    await screen.findByTestId("summary-cards");
    await openResults();

    const props = panelProps.mock.calls.at(-1)![0] as {
      onSelect: (id: string) => void;
      onNavChange: (nav: {
        currentIndex: number;
        total: number;
        goPrev: () => void;
        goNext: () => void;
      }) => void;
    };
    await act(async () => {
      props.onNavChange({
        currentIndex: 0,
        total: 3,
        goPrev: jest.fn(),
        goNext: jest.fn(),
      });
      props.onSelect("test-0");
    });

    expect(screen.getByRole("button", { name: "Next" })).toBeInTheDocument();
    expect(screen.getByText("1 of 3")).toBeInTheDocument();
  });

  it("reads a test only once, however often it is reopened", async () => {
    render(<PublicTestRunPage />);
    await screen.findByTestId("summary-cards");
    await openResults();

    const select = panelProps.mock.calls.at(-1)![0].onSelect as (
      id: string,
    ) => void;
    await act(async () => select("test-1"));
    await act(async () => select("test-0"));

    expect(caseCalls("case-1")).toHaveLength(1);
  });

  it("stays up when a test cannot be read", async () => {
    failingCases.add("case-1");
    render(<PublicTestRunPage />);

    await screen.findByTestId("summary-cards");
    await waitFor(() => expect(caseCalls("case-1")).toHaveLength(1));
    await openResults();

    expect(screen.getByTestId("outputs-panel")).toBeInTheDocument();
    expect(lastPanelRows()[0].output).toBeUndefined();
  });

  it("keeps a test with no verdict out of the failures and out of the rate", async () => {
    (global.fetch as jest.Mock).mockImplementation(
      (input: RequestInfo | URL) => {
        const url = String(input);
        calls.push(url);
        if (url.includes("/results/")) return jsonResponse(CASE_ONE);
        return jsonResponse({
          ...RUN_SUMMARY,
          total_tests: 3,
          passed: 1,
          failed: 1,
          results: [
            { test_case_id: "case-1", name: "Refund window", passed: true },
            // The run ended without a verdict for this test, so it never ran.
            { test_case_id: "case-9", name: "Never answered" },
            { test_case_id: "case-4", name: "Wrong answer", passed: false },
          ],
        });
      },
    );
    render(<PublicTestRunPage />);

    await screen.findByTestId("summary-cards");
    const props = summaryProps.mock.calls.at(-1)![0];
    // One pass and one wrong answer. The test with no verdict is in neither.
    expect(props.passed).toBe(1);
    expect(props.total).toBe(2);

    await openResults();
    const rows = lastPanelRows() as { status: string }[];
    expect(rows.map((r) => r.status)).toEqual(["passed", "not_run", "failed"]);
  });

  it("shows how the run itself went beside its name", async () => {
    render(<PublicTestRunPage />);

    await screen.findByTestId("summary-cards");
    expect(
      screen.getByLabelText("The evaluation ran every test"),
    ).toBeInTheDocument();
  });

  it("marks a run that broke", async () => {
    (global.fetch as jest.Mock).mockImplementation(
      (input: RequestInfo | URL) => {
        const url = String(input);
        calls.push(url);
        if (url.includes("/results/")) return jsonResponse(CASE_ONE);
        return jsonResponse({ ...RUN_SUMMARY, status: "failed", error: "boom" });
      },
    );
    render(<PublicTestRunPage />);

    await screen.findByTestId("summary-cards");
    expect(
      screen.getByLabelText("The evaluation broke before it could finish"),
    ).toBeInTheDocument();
  });

  it("marks a run that could not run every test", async () => {
    (global.fetch as jest.Mock).mockImplementation(
      (input: RequestInfo | URL) => {
        const url = String(input);
        calls.push(url);
        if (url.includes("/results/")) return jsonResponse(CASE_ONE);
        return jsonResponse({ ...RUN_SUMMARY, unanswered_tests: 1 });
      },
    );
    render(<PublicTestRunPage />);

    await screen.findByTestId("summary-cards");
    expect(
      screen.getByLabelText("Some of the tests could not be run"),
    ).toBeInTheDocument();
  });

  it("marks a run someone stopped", async () => {
    (global.fetch as jest.Mock).mockImplementation(
      (input: RequestInfo | URL) => {
        const url = String(input);
        calls.push(url);
        if (url.includes("/results/")) return jsonResponse(CASE_ONE);
        return jsonResponse({ ...RUN_SUMMARY, aborted: true });
      },
    );
    render(<PublicTestRunPage />);

    await screen.findByTestId("summary-cards");
    expect(
      screen.getByLabelText(
        "Someone stopped the evaluation before it finished",
      ),
    ).toBeInTheDocument();
  });

  it("names the evaluator that judged the tool-call tests", async () => {
    render(<PublicTestRunPage />);

    await screen.findByTestId("summary-cards");
    await waitFor(() =>
      expect(summaryProps.mock.calls.at(-1)![0].toolCallEvaluatorUuid).toBe(
        "ev-tool",
      ),
    );
    // Only the first tool-call test is read, not every case.
    expect(caseCalls("case-2")).toHaveLength(1);
  });
});
