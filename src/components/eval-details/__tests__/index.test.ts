import * as evalDetails from "../index";

describe("eval-details barrel", () => {
  it("re-exports all public components and helpers", () => {
    const expected = [
      "ProviderSidebar",
      "ProviderMetricsCard",
      "TTSResultsTable",
      "STTResultsTable",
      "LeaderboardTab",
      "AboutMetricsTable",
      "STTEvaluationAbout",
      "TTSEvaluationAbout",
      "STTEvaluationLeaderboard",
      "TTSEvaluationLeaderboard",
      "STTEvaluationOutputs",
      "TTSEvaluationOutputs",
      "ratingRange",
      "hasSTTEmptyPredictions",
      "getFirstSTTEmptyPredictionIndex",
      "findFirstEvaluatorRuns",
      "evaluatorColumnsFromRuns",
      "evaluatorDescriptionMapFromRuns",
      "BenchmarkOutputsPanel",
      "benchmarkLabellingKey",
      "BenchmarkCombinedLeaderboard",
      "TestRunOutputsPanel",
      "TestRunSummary",
      "SimulationMetricsGrid",
      "LATENCY_KEYS",
      "SimulationResultsTable",
      "SimulationTranscriptDialog",
    ];
    for (const name of expected) {
      expect(evalDetails[name as keyof typeof evalDetails]).toBeDefined();
    }
  });
});
