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
  await user.click(screen.getByRole("button", { name: "Results" }));
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
