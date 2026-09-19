import React from "react";
import { render, screen, setupUser, waitFor } from "../../../../../test-utils";
import PublicBenchmarkPage from "../page";

// The two charts are rendered for real elsewhere; here we only need the file
// name each one would download under. Everything else stays real, so the
// priority sliders and the list of tests are the ones a reader sees.
const topPicksProps = jest.fn();
const leaderboardProps = jest.fn();
jest.mock("../../../../../components/eval-details", () => {
  const actual = jest.requireActual("../../../../../components/eval-details");
  return {
    ...actual,
    BenchmarkTopPicks: (props: { filename: string }) => {
      topPicksProps(props);
      return <div data-testid="top-picks" />;
    },
    BenchmarkCombinedLeaderboard: (props: { filename: string }) => {
      leaderboardProps(props);
      return <div data-testid="leaderboard" />;
    },
  };
});

jest.mock("next/navigation", () => ({
  useParams: () => ({ token: "tok-1" }),
  useRouter: () => ({ push: jest.fn(), replace: jest.fn() }),
  useSearchParams: () => new URLSearchParams(),
  usePathname: () => "/public/benchmark/tok-1",
}));

const buildBenchmarkCsvMock = jest.fn(() => ({ columns: [], rows: [] }));
jest.mock("../../../../../lib/exportTestResults", () => ({
  __esModule: true,
  buildBenchmarkCsv: (...args: unknown[]) => buildBenchmarkCsvMock(...(args as [])),
}));

jest.mock("../../../../../components/ExportResultsButton", () => ({
  __esModule: true,
  ExportResultsButton: (props: any) => (
    <button data-testid="export-button" onClick={() => props.getRows()}>
      export
    </button>
  ),
}));

/** The light reply the page runs on: no conversation, reply or judge
 * reasoning on any row. */
const LIGHT_RUN = {
  task_id: "run-1",
  status: "done",
  name: "Nightly comparison",
  leaderboard_summary: [
    { model: "google__gemini-2.5-flash", pass_rate: "95", cost: "0.10", latency_p50: "1000" },
    { model: "openai__gpt-4.1", pass_rate: "70", cost: "0.02", latency_p50: "500" },
  ],
  evaluators: [{ uuid: "e1", name: "Correctness" }],
  model_results: [
    {
      model: "google__gemini-2.5-flash",
      success: true,
      message: "",
      total_tests: 1,
      passed: 1,
      failed: 0,
      test_results: [
        { name: "First test", passed: true, test_uuid: "t1", test_type: "response" },
      ],
    },
    {
      model: "openai__gpt-4.1",
      success: true,
      message: "",
      total_tests: 1,
      passed: 0,
      failed: 1,
      test_results: [
        { name: "First test", passed: false, test_uuid: "t1", test_type: "response" },
      ],
    },
  ],
};

/** The same run read in full, which is what the results file needs. */
const FULL_RUN = {
  ...LIGHT_RUN,
  model_results: LIGHT_RUN.model_results.map((m) => ({
    ...m,
    test_results: (m.test_results ?? []).map((r) => ({
      ...r,
      output: { response: "The full reply" },
      test_case: { evaluation: { type: "response" }, history: [] },
      judge_results: [{ evaluator_uuid: "e1", match: true }],
    })),
  })),
};

function jsonResponse(body: unknown, status = 200) {
  return { ok: status < 400, status, json: async () => body };
}

function mockBackend() {
  global.fetch = jest.fn((url: string) => {
    const address = String(url);
    if (address.includes("/results/")) {
      return Promise.resolve(
        jsonResponse({ output: { response: "The full reply" } }),
      );
    }
    if (address.includes("mode=summary")) {
      return Promise.resolve(jsonResponse(LIGHT_RUN));
    }
    return Promise.resolve(jsonResponse(FULL_RUN));
  }) as unknown as typeof fetch;
}

describe("PublicBenchmarkPage", () => {
  beforeEach(() => {
    jest.clearAllMocks();
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
    process.env.NEXT_PUBLIC_BACKEND_URL = "http://backend.test";
    mockBackend();
  });

  it("shows the run's name and reads it without every test's detail", async () => {
    render(<PublicBenchmarkPage />);
    expect(await screen.findByText("Nightly comparison")).toBeInTheDocument();
    const address = String((global.fetch as jest.Mock).mock.calls[0][0]);
    expect(address).toBe("http://backend.test/public/benchmark/tok-1?mode=summary");
  });

  it("tells the leaderboard when the run gave up before it started every test", async () => {
    global.fetch = jest.fn(() =>
      Promise.resolve(jsonResponse({ ...LIGHT_RUN, stopped_early: true })),
    ) as unknown as typeof fetch;
    render(<PublicBenchmarkPage />);
    await screen.findByTestId("leaderboard");
    expect(leaderboardProps).toHaveBeenLastCalledWith(
      expect.objectContaining({ stoppedEarly: true }),
    );
  });

  it("names the two charts after what each one shows", async () => {
    const user = setupUser();
    render(<PublicBenchmarkPage />);

    await screen.findByTestId("leaderboard");
    expect(leaderboardProps).toHaveBeenCalledWith(
      expect.objectContaining({ filename: "benchmark-leaderboard-tok-1" }),
    );

    await user.click(screen.getByRole("button", { name: "Model selection" }));
    expect(topPicksProps).toHaveBeenCalledWith(
      expect.objectContaining({ filename: "benchmark-top-picks-tok-1" }),
    );
  });

  it("shows the priority sliders on the Model selection tab", async () => {
    const user = setupUser();
    render(<PublicBenchmarkPage />);

    const tab = await screen.findByRole("button", { name: "Model selection" });
    await user.click(tab);

    expect(screen.getByText("Rank by your priorities")).toBeInTheDocument();
    expect(screen.getByLabelText("Quality weight")).toBeInTheDocument();
    expect(screen.getByLabelText("Cost weight")).toBeInTheDocument();
    expect(screen.getByLabelText("Latency weight")).toBeInTheDocument();
  });

  it("reads the whole run before it builds the results file", async () => {
    const user = setupUser();
    render(<PublicBenchmarkPage />);
    await screen.findByTestId("export-button");

    await user.click(screen.getByTestId("export-button"));

    await waitFor(() => expect(buildBenchmarkCsvMock).toHaveBeenCalled());
    const [rows, evaluators] = buildBenchmarkCsvMock.mock
      .calls[0] as unknown as [
      { output?: { response?: string } }[],
      Record<string, unknown>,
    ];
    // Every row carries the reply the light reply left out.
    expect(rows).toHaveLength(2);
    expect(rows.every((r) => r.output?.response === "The full reply")).toBe(true);
    expect(evaluators).toEqual({ e1: { uuid: "e1", name: "Correctness" } });

    const fullReads = (global.fetch as jest.Mock).mock.calls
      .map(([url]) => String(url))
      .filter((url) => url === "http://backend.test/public/benchmark/tok-1");
    expect(fullReads).toHaveLength(1);
  });

  it("reads one test in full from the shared link's own address", async () => {
    const user = setupUser();
    render(<PublicBenchmarkPage />);
    await user.click(await screen.findByRole("button", { name: "Tests" }));

    await waitFor(() => {
      const caseReads = (global.fetch as jest.Mock).mock.calls
        .map(([url]) => String(url))
        .filter((url) => url.includes("/results/"));
      expect(caseReads).toHaveLength(1);
      expect(caseReads[0]).toBe(
        "http://backend.test/public/benchmark/tok-1/results/t1?model=google__gemini-2.5-flash",
      );
    });
  });

  it("says the run is not there when the link is unknown", async () => {
    global.fetch = jest.fn(() =>
      Promise.resolve(jsonResponse({}, 404)),
    ) as unknown as typeof fetch;
    render(<PublicBenchmarkPage />);
    expect(
      await screen.findByText("This link is not available"),
    ).toBeInTheDocument();
  });

  it("shows a failed run with what it did finish, and tells the leaderboard why it failed", async () => {
    global.fetch = jest.fn(() =>
      Promise.resolve(
        jsonResponse({ ...LIGHT_RUN, status: "failed", error: "judge unreachable" }),
      ),
    ) as unknown as typeof fetch;
    render(<PublicBenchmarkPage />);
    expect(await screen.findByText("Nightly comparison")).toBeInTheDocument();
    expect(
      screen.queryByText("This link is not available"),
    ).not.toBeInTheDocument();
    await screen.findByTestId("leaderboard");
    expect(leaderboardProps).toHaveBeenLastCalledWith(
      expect.objectContaining({ failureReason: "judge unreachable" }),
    );
  });

  it("tells the leaderboard a run failed even when nothing was recorded in text", async () => {
    global.fetch = jest.fn(() =>
      Promise.resolve(jsonResponse({ ...LIGHT_RUN, status: "failed", error: true })),
    ) as unknown as typeof fetch;
    render(<PublicBenchmarkPage />);
    await screen.findByTestId("leaderboard");
    expect(leaderboardProps).toHaveBeenLastCalledWith(
      expect.objectContaining({ failureReason: "" }),
    );
  });

  it("tells the leaderboard nothing about failure on a run that finished", async () => {
    render(<PublicBenchmarkPage />);
    await screen.findByTestId("leaderboard");
    expect(leaderboardProps).toHaveBeenLastCalledWith(
      expect.objectContaining({ failureReason: null }),
    );
  });

  it("treats a run with an error behind it as failed, even when it says done", async () => {
    global.fetch = jest.fn(() =>
      Promise.resolve(jsonResponse({ ...LIGHT_RUN, error: "judge unreachable" })),
    ) as unknown as typeof fetch;
    render(<PublicBenchmarkPage />);
    await screen.findByTestId("leaderboard");
    expect(leaderboardProps).toHaveBeenLastCalledWith(
      expect.objectContaining({ failureReason: "judge unreachable" }),
    );
    expect(
      screen.getByLabelText("The evaluation broke before it could finish"),
    ).toBeInTheDocument();
  });

  it("shows how the run itself went beside its name", async () => {
    render(<PublicBenchmarkPage />);
    await screen.findByTestId("leaderboard");
    expect(
      screen.getByLabelText("The evaluation ran every test"),
    ).toBeInTheDocument();
  });

  it("marks a run that could not run every test", async () => {
    global.fetch = jest.fn(() =>
      Promise.resolve(jsonResponse({ ...LIGHT_RUN, stopped_early: true })),
    ) as unknown as typeof fetch;
    render(<PublicBenchmarkPage />);
    await screen.findByTestId("leaderboard");
    expect(
      screen.getByLabelText("Some of the tests could not be run"),
    ).toBeInTheDocument();
  });

  it("marks a run where only some tests produced no answer", async () => {
    global.fetch = jest.fn(() =>
      Promise.resolve(
        jsonResponse({
          ...LIGHT_RUN,
          model_results: LIGHT_RUN.model_results.map((m) => ({
            ...m,
            test_results: [
              { name: "First test", passed: false, unanswered: true },
              { name: "Second test", passed: true },
            ],
          })),
        }),
      ),
    ) as unknown as typeof fetch;
    render(<PublicBenchmarkPage />);
    await screen.findByTestId("leaderboard");
    expect(
      screen.getByLabelText("Some of the tests could not be run"),
    ).toBeInTheDocument();
  });

  it("marks a run where no test produced an answer", async () => {
    global.fetch = jest.fn(() =>
      Promise.resolve(
        jsonResponse({
          ...LIGHT_RUN,
          model_results: LIGHT_RUN.model_results.map((m) => ({
            ...m,
            test_results: [
              { name: "First test", passed: false, unanswered: true },
            ],
          })),
        }),
      ),
    ) as unknown as typeof fetch;
    render(<PublicBenchmarkPage />);
    await screen.findByTestId("leaderboard");
    expect(
      screen.getByLabelText("None of the tests could be run"),
    ).toBeInTheDocument();
  });

  it("marks a comparison with a model that could not be run", async () => {
    global.fetch = jest.fn(() =>
      Promise.resolve(
        jsonResponse({
          ...LIGHT_RUN,
          model_results: [
            LIGHT_RUN.model_results[0],
            {
              model: "openai__gpt-4.1",
              success: false,
              message: "model not available",
              total_tests: 1,
              passed: null,
              failed: null,
              test_results: null,
            },
          ],
        }),
      ),
    ) as unknown as typeof fetch;
    render(<PublicBenchmarkPage />);
    await screen.findByTestId("leaderboard");
    // The app says the same thing about this run, so the shared link cannot
    // call it finished.
    expect(
      screen.getByLabelText("Some of the tests could not be run"),
    ).toBeInTheDocument();
    expect(
      screen.queryByLabelText("The evaluation ran every test"),
    ).not.toBeInTheDocument();
  });

  it("marks a comparison that ended without a verdict for a test", async () => {
    global.fetch = jest.fn(() =>
      Promise.resolve(
        jsonResponse({
          ...LIGHT_RUN,
          model_results: LIGHT_RUN.model_results.map((m) => ({
            ...m,
            test_results: [
              { name: "First test", passed: true },
              { name: "Second test", passed: null },
            ],
          })),
        }),
      ),
    ) as unknown as typeof fetch;
    render(<PublicBenchmarkPage />);
    await screen.findByTestId("leaderboard");
    expect(
      screen.getByLabelText("Some of the tests could not be run"),
    ).toBeInTheDocument();
  });

  it("marks a run someone stopped", async () => {
    global.fetch = jest.fn(() =>
      Promise.resolve(jsonResponse({ ...LIGHT_RUN, aborted: true })),
    ) as unknown as typeof fetch;
    render(<PublicBenchmarkPage />);
    await screen.findByTestId("leaderboard");
    expect(
      screen.getByLabelText(
        "Someone stopped the evaluation before it finished",
      ),
    ).toBeInTheDocument();
  });

  it("says the run is not there while it is still going", async () => {
    global.fetch = jest.fn(() =>
      Promise.resolve(jsonResponse({ task_id: "r", status: "in_progress" })),
    ) as unknown as typeof fetch;
    render(<PublicBenchmarkPage />);
    expect(
      await screen.findByText("This link is not available"),
    ).toBeInTheDocument();
  });
});
