"use client";
import { reportError } from "@/lib/reportError";
import { unwrapList } from "@/lib/api";
import { isDefaultEvaluator } from "@/lib/evaluatorApi";

import React, { useState, useEffect, useMemo, useRef } from "react";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { signOut } from "next-auth/react";
import { useAccessToken, usePageErrorState } from "@/hooks";
import { AppLayout } from "@/components/AppLayout";
import {
  BackHeader,
  StatusBadge,
  NotFoundState,
  RetryIcon,
} from "@/components/ui";
import { ttsProviders } from "@/components/agent-tabs/constants/providers";
import { POLLING_INTERVAL_MS } from "@/constants/polling";
import {
  TTSEvaluationAbout,
  TTSEvaluationLeaderboard,
  TTSEvaluationOutputs,
  ratingRange,
  type TTSEvaluatorColumn,
  type LatencyMetric,
  type TTSLeaderboardSummary,
} from "@/components/eval-details";
import { readEvaluatorCell } from "@/components/eval-details/EvaluatorScoreCell";
import {
  AddRunToLabellingTaskDialog,
  type TtsLabellingRow,
  type SourceEvaluatorRef,
} from "@/components/human-labelling/AddRunToLabellingTaskDialog";
import { useLabellingSelection } from "@/components/human-labelling/useLabellingSelection";
import {
  dedupeSourceEvaluators,
  SubmitForLabellingButton,
} from "@/components/human-labelling/labellingSubmit";
import {
  ttsRowAudioKey,
  countTtsLabellingEligible,
  buildTtsLabellingRows,
} from "@/components/human-labelling/ttsLabellingSource";
import { useSidebarState } from "@/lib/sidebar";
import { ShareButton } from "@/components/ShareButton";
import { ExportZipButton } from "@/components/ExportZipButton";
import type { ExportColumn } from "@/components/ExportResultsButton";
import { retryEvaluation } from "@/lib/retryEvaluation";
import {
  deriveEvaluatorColumns,
  TTS_RESERVED_METRIC_KEYS,
} from "@/lib/evaluatorColumns";

// The TTS evaluate API response now carries per-attached-evaluator data in
// three formats we need to support side-by-side:
//
//   1) New format (post-migration): each provider includes an
//      `evaluator_runs` array — one entry per evaluator with the live
//      `name`, stable `evaluator_uuid`, the `metric_key` written to the
//      run's artefacts (== the per-row column name and the leaderboard
//      column name), and an `aggregate` object containing `type`, `mean`
//      and (for rating evaluators) `scale_min` / `scale_max`. Per-row
//      scores are at `result[metric_key]` and reasonings at
//      `result[`${metric_key}_reasoning`]`. `metrics[name]` is now a nested
//      object (`{ type, mean, scale_min?, scale_max? }`).
//   2) Legacy `_info` format: flat `metrics["{name}_score"]` (numeric mean)
//      with a sibling `metrics["{name}_info"]` (`{ type, mean }`); per-row
//      `result["{name}_score"]` and `result["{name}_reasoning"]`.
//   3) Legacy single-evaluator format: only `metrics.llm_judge_score` and
//      per-row `result.llm_judge_score` / `result.llm_judge_reasoning`. We
//      synthesize a single column attributed to the default TTS evaluator
//      so the page still labels and links the score correctly.
//
// The shapes below keep `llm_judge_score` / `ttfb` / `processing_time`
// typed for the legacy paths while allowing the dynamic per-evaluator keys
// (numeric in the legacy `_info` format, nested object in the new format)
// via an index signature.
type EvaluatorRunAggregate = {
  type?: "binary" | "rating" | string;
  mean?: number;
  scale_min?: number;
  scale_max?: number;
  [k: string]: unknown;
};

type EvaluatorRun = {
  evaluator_uuid: string;
  /** Column name in `metrics.json` / `results.csv` / leaderboard rows for this run. */
  metric_key: string;
  /** Nested aggregate block; `mean` is the headline scalar. */
  aggregate?: EvaluatorRunAggregate | null;
  /** Current human-readable evaluator name from the DB at response time. May lag the artefact `metric_key` after a rename. */
  name?: string;
  description?: string;
  /** Drives cell rendering; prefer over inferring from `aggregate.type`. */
  output_type?: "binary" | "rating";
  /** Pinned at job-submit time. */
  evaluator_version_id?: string;
};

type ProviderMetrics = {
  llm_judge_score?: number;
  ttfb?: LatencyMetric;
  processing_time?: LatencyMetric;
  [k: string]:
    | number
    | LatencyMetric
    | { type?: string; mean?: number; scale_min?: number; scale_max?: number }
    | undefined;
};

type ProviderResultRow = {
  id: string;
  text: string;
  // Playback/download URL for the synthesized clip — used by the on-page
  // audio player. NOT accepted by the evaluator (see `audio_s3_path`).
  audio_path: string;
  // S3 storage key for the same clip (the value returned by
  // `POST /presigned-url`). This is what "Run evaluators" / labelling items
  // require, so it — not `audio_path` — is what we submit for labelling.
  audio_s3_path?: string | null;
  llm_judge_score?: string;
  llm_judge_reasoning?: string;
  [k: string]: unknown;
};

type ProviderResult = {
  provider: string;
  success: boolean | null; // null means in progress
  message: string;
  metrics: ProviderMetrics | null;
  results: ProviderResultRow[] | null;
  /** New format only — present once the run produces nested per-evaluator metrics. Older jobs omit this. */
  evaluator_runs?: EvaluatorRun[] | null;
};

type EvaluationResult = {
  task_id: string;
  status: "queued" | "in_progress" | "done" | "failed";
  language?: string;
  dataset_id?: string | null;
  dataset_name?: string | null;
  evaluator_uuids?: string[] | null;
  provider_results?: ProviderResult[];
  leaderboard_summary?: TTSLeaderboardSummary[];
  error?: string | null;
  is_public?: boolean;
  share_token?: string | null;
};

type EvaluatorSummary = {
  uuid: string;
  name: string;
  description?: string | null;
  isDefault: boolean;
};

// Full-detail shape used to render the About-tab rows. Sourced from
// `GET /evaluators/{uuid}` (one fetch per evaluator linked to the job, or per
// default evaluator when the job has no `evaluator_uuids`).
type EvaluatorAbout = {
  uuid: string;
  name: string;
  description: string;
  outputType: "binary" | "rating";
  /** Numeric values from `live_version.output_config.scale` for `rating` evaluators. Empty for binary. */
  scaleValues: number[];
};

// Helper function to map provider value back to label
const getProviderLabel = (value: string): string => {
  const provider = ttsProviders.find((p) => p.value === value);
  return provider ? provider.label : value;
};

type ActiveTab = "leaderboard" | "outputs" | "about";
const ACTIVE_TABS: readonly ActiveTab[] = ["leaderboard", "outputs", "about"];

export default function TTSEvaluationDetailPage() {
  const router = useRouter();
  const params = useParams();
  const searchParams = useSearchParams();
  const backendAccessToken = useAccessToken();
  const taskId = params.uuid as string;
  const [sidebarOpen, setSidebarOpen] = useSidebarState();
  const [evaluationResult, setEvaluationResult] =
    useState<EvaluationResult | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const { errorCode, captureResponse } = usePageErrorState();
  // Retry flow for failed runs.
  const [retrying, setRetrying] = useState(false);
  const [retryError, setRetryError] = useState<string | null>(null);
  // Persist the active tab across reloads via the `?tab=` query param.
  // Tabs that are not available yet fall back visually to Outputs below.
  const [activeTab, setActiveTab] = useState<ActiveTab>(() => {
    const tabParam = searchParams.get("tab");
    return tabParam && (ACTIVE_TABS as readonly string[]).includes(tabParam)
      ? (tabParam as ActiveTab)
      : "outputs";
  });

  // Mirror tab changes back into the URL so a reload restores the same tab.
  // `window.history.replaceState` keeps the existing history entry (no extra
  // back-button stop) — same pattern as `AgentDetail.tsx` `performTabSwitch`.
  const handleTabChange = (tab: ActiveTab) => {
    setActiveTab(tab);
    const next = new URLSearchParams(searchParams.toString());
    next.set("tab", tab);
    window.history.replaceState(null, "", `?${next.toString()}`);
  };

  const [activeProviderTab, setActiveProviderTab] = useState<string | null>(
    null,
  );
  const [ttsEvaluators, setTtsEvaluators] = useState<EvaluatorSummary[]>([]);
  const [aboutEvaluators, setAboutEvaluators] = useState<EvaluatorAbout[]>([]);
  const pollingIntervalRef = useRef<NodeJS.Timeout | null>(null);

  // Set page title and collapse main sidebar for more space
  useEffect(() => {
    document.title = "TTS Evaluation | Calibrate";
    setSidebarOpen(false);
  }, []);

  // Cleanup polling interval on unmount
  useEffect(() => {
    return () => {
      if (pollingIntervalRef.current) {
        clearInterval(pollingIntervalRef.current);
      }
    };
  }, []);

  // Fetch TTS evaluators (defaults + user-owned). The page-wide score label
  // is derived from this list (the first `isDefault` entry); the About-tab
  // uses it together with `evaluator_uuids` to decide which evaluator
  // detail-fetches to issue (see the next effect).
  useEffect(() => {
    const fetchEvaluators = async () => {
      if (!backendAccessToken) return;
      try {
        const backendUrl = process.env.NEXT_PUBLIC_BACKEND_URL;
        if (!backendUrl) return;

        const response = await fetch(
          `${backendUrl}/evaluators?include_defaults=true`,
          {
            method: "GET",
            headers: {
              accept: "application/json",
              Authorization: `Bearer ${backendAccessToken}`,
            },
          },
        );

        if (response.status === 401) {
          await signOut({ callbackUrl: "/login" });
          return;
        }

        if (!response.ok) return;

        const data = await response.json();
        const items: EvaluatorSummary[] = unwrapList<{
          uuid: string;
          name: string;
          description?: string | null;
          is_default?: boolean;
          evaluator_type?: string;
        }>(data)
          .filter((m) => m.evaluator_type === "tts")
          .map((m) => ({
            uuid: m.uuid,
            name: m.name,
            description: m.description ?? null,
            isDefault: isDefaultEvaluator(m),
          }));
        setTtsEvaluators(items);
      } catch (err) {
        reportError("Error fetching evaluators:", err);
      }
    };

    fetchEvaluators();
  }, [backendAccessToken]);

  // Resolve the evaluators rendered in the About tab from the new-format
  // payload — each provider result carries `evaluator_runs[]` with the
  // live `name`, stable `evaluator_uuid`, and an `aggregate` block
  // containing `type` plus `scale_min` / `scale_max` for rating
  // evaluators. Legacy `*_info`-style payloads are no longer supported.
  useEffect(() => {
    if (!evaluationResult) return;

    const firstRuns = (evaluationResult.provider_results ?? [])
      .map((pr) => pr.evaluator_runs)
      .find((er): er is EvaluatorRun[] => Array.isArray(er) && er.length > 0);

    if (!firstRuns) {
      setAboutEvaluators([]);
      return;
    }

    const byUuid = new Map<string, EvaluatorAbout>();
    for (const run of firstRuns) {
      if (byUuid.has(run.evaluator_uuid)) continue;
      const a = run.aggregate ?? {};
      const scaleValues: number[] = [];
      if (typeof a.scale_min === "number") scaleValues.push(a.scale_min);
      if (typeof a.scale_max === "number" && a.scale_max !== a.scale_min) {
        scaleValues.push(a.scale_max);
      }
      byUuid.set(run.evaluator_uuid, {
        uuid: run.evaluator_uuid,
        name: run.name ?? run.metric_key,
        description: run.description ?? "",
        outputType: a.type === "rating" ? "rating" : "binary",
        scaleValues,
      });
    }
    setAboutEvaluators(Array.from(byUuid.values()));
  }, [evaluationResult]);

  // Fetch evaluation result
  useEffect(() => {
    const fetchResult = async () => {
      if (!backendAccessToken || !taskId) return;

      try {
        setIsLoading(true);
        setError(null);
        const backendUrl = process.env.NEXT_PUBLIC_BACKEND_URL;
        if (!backendUrl) {
          throw new Error("BACKEND_URL environment variable is not set");
        }

        const response = await fetch(`${backendUrl}/tts/evaluate/${taskId}`, {
          method: "GET",
          headers: {
            accept: "application/json",
            Authorization: `Bearer ${backendAccessToken}`,
          },
        });

        if (captureResponse(response)) return;

        if (!response.ok) {
          throw new Error("Failed to fetch evaluation result");
        }

        const result: EvaluationResult = await response.json();

        setEvaluationResult(result);

        // Set first provider as active tab if results exist (use functional setState to avoid stale closures)
        if (result.provider_results && result.provider_results.length > 0) {
          setActiveProviderTab(
            (current) => current || result.provider_results![0].provider,
          );
        }

        // If already done, show leaderboard tab by default — but only when
        // the user hasn't picked a tab themselves (no `?tab=` in the URL).
        // This way deep-linking to `?tab=outputs` or `?tab=about` is respected
        // even on completed jobs.
        if (result.status === "done") {
          const explicitTab = new URLSearchParams(window.location.search).get(
            "tab",
          );
          if (!explicitTab) handleTabChange("leaderboard");
        }

        // Start polling if not done or failed
        if (
          result.status !== "done" &&
          result.status !== "failed" &&
          !pollingIntervalRef.current
        ) {
          pollingIntervalRef.current = setInterval(() => {
            pollTaskStatus(taskId, backendUrl);
          }, POLLING_INTERVAL_MS);
        }
      } catch (err) {
        reportError("Error fetching evaluation result:", err);
        setError(
          err instanceof Error ? err.message : "Failed to load evaluation",
        );
      } finally {
        setIsLoading(false);
      }
    };

    fetchResult();
  }, [taskId, backendAccessToken, captureResponse]);

  const pollTaskStatus = async (taskId: string, backendUrl: string) => {
    try {
      const response = await fetch(`${backendUrl}/tts/evaluate/${taskId}`, {
        method: "GET",
        headers: {
          accept: "application/json",
          Authorization: `Bearer ${backendAccessToken}`,
        },
      });

      if (response.status === 401) {
        await signOut({ callbackUrl: "/login" });
        return;
      }

      if (!response.ok) {
        throw new Error("Failed to poll task status");
      }

      const result: EvaluationResult = await response.json();
      setEvaluationResult(result);

      // Set first provider as active tab if results exist (use functional setState to avoid stale closures)
      if (result.provider_results && result.provider_results.length > 0) {
        setActiveProviderTab(
          (current) => current || result.provider_results![0].provider,
        );
      }

      if (result.status === "done" || result.status === "failed") {
        // Switch to leaderboard tab when evaluation completes successfully —
        // unless the user has already picked a tab in this session (or via a
        // deep-linked `?tab=`). Reading from `window.location.search` rather
        // than the captured `searchParams` so a click that happened mid-poll
        // is reflected.
        if (result.status === "done") {
          const explicitTab = new URLSearchParams(window.location.search).get(
            "tab",
          );
          if (!explicitTab) handleTabChange("leaderboard");
        }
        if (pollingIntervalRef.current) {
          clearInterval(pollingIntervalRef.current);
          pollingIntervalRef.current = null;
        }
      }
    } catch (error) {
      reportError("Error polling task status:", error);
      // Set status to failed so the UI shows the error state
      setEvaluationResult((prev) =>
        prev ? { ...prev, status: "failed" } : prev,
      );
      if (pollingIntervalRef.current) {
        clearInterval(pollingIntervalRef.current);
        pollingIntervalRef.current = null;
      }
    }
  };

  const restartEvaluationAfterRetry = async () => {
    const backendUrl = process.env.NEXT_PUBLIC_BACKEND_URL;
    if (!backendUrl || !backendAccessToken || !taskId) {
      setRetrying(false);
      return;
    }

    if (pollingIntervalRef.current) {
      clearInterval(pollingIntervalRef.current);
      pollingIntervalRef.current = null;
    }

    setIsLoading(true);
    setRetryError(null);
    setError(null);
    setActiveProviderTab(null);
    handleTabChange("outputs");

    try {
      const response = await fetch(`${backendUrl}/tts/evaluate/${taskId}`, {
        method: "GET",
        headers: {
          accept: "application/json",
          Authorization: `Bearer ${backendAccessToken}`,
        },
      });

      if (response.status === 401) {
        await signOut({ callbackUrl: "/login" });
        return;
      }

      if (!response.ok) {
        throw new Error("Failed to fetch evaluation result");
      }

      const result: EvaluationResult = await response.json();

      setEvaluationResult(result);

      if (result.provider_results && result.provider_results.length > 0) {
        setActiveProviderTab(
          (current) => current || result.provider_results![0].provider,
        );
      }

      if (
        result.status !== "done" &&
        result.status !== "failed" &&
        !pollingIntervalRef.current
      ) {
        pollingIntervalRef.current = setInterval(() => {
          pollTaskStatus(taskId, backendUrl);
        }, POLLING_INTERVAL_MS);
      }
    } catch (err) {
      reportError("Error refreshing evaluation after retry:", err);
      setError(
        err instanceof Error ? err.message : "Failed to load evaluation",
      );
    } finally {
      setIsLoading(false);
      setRetrying(false);
    }
  };

  const handleRetry = async () => {
    if (!backendAccessToken || !taskId || retrying) return;
    setRetrying(true);
    setRetryError(null);
    const result = await retryEvaluation("tts", taskId, backendAccessToken);
    if (result.ok) {
      await restartEvaluationAfterRetry();
      return;
    }
    if (result.status === 401) {
      await signOut({ callbackUrl: "/login" });
      return;
    }
    setRetryError(result.error);
    setRetrying(false);
  };

  // The default TTS evaluator drives the column / metric label for legacy
  // single-evaluator jobs when the job payload doesn't carry evaluator_runs.
  const defaultEvaluator: EvaluatorSummary | null =
    ttsEvaluators.find((e) => e.isDefault) ?? null;
  const judgeLabel = defaultEvaluator?.name ?? "Evaluator";

  // Derive the per-evaluator columns rendered in the Outputs results table,
  // the per-provider metrics card and the Leaderboard chart/columns. See
  // `deriveEvaluatorColumns` for the priority order across the four shapes
  // the backend has emitted.
  const evaluatorColumns: TTSEvaluatorColumn[] = useMemo(
    () =>
      deriveEvaluatorColumns({
        providerResults: evaluationResult?.provider_results ?? [],
        aboutEvaluators,
        reservedMetricKeys: TTS_RESERVED_METRIC_KEYS,
        singleJudgeFallback: {
          defaultEvaluatorUuid: defaultEvaluator?.uuid,
          defaultLabel: judgeLabel,
          defaultOutputType: "binary",
        },
      }),
    [aboutEvaluators, evaluationResult, defaultEvaluator, judgeLabel],
  );

  // "Submit for labelling": pick individual result rows (per provider) and
  // send them to a TTS annotation task. Rows are keyed `${provider}:${index}`
  // — the same keys `TTSResultsTable` toggles — so selection is stable across
  // provider switches. Only the SELECTED rows become items (source text +
  // audio STORAGE KEY); names include provider + index + a run-id suffix so
  // they stay unique within a task. Evaluators come from `evaluatorColumns`.
  const [addToTaskOpen, setAddToTaskOpen] = useState(false);
  const {
    selected: ttsLabellingSelected,
    toggle: toggleTtsLabelling,
    bulkToggle: bulkToggleTtsLabelling,
  } = useLabellingSelection();
  // Labelling items must carry the audio STORAGE KEY (`audio_s3_path`), not the
  // playback URL — the evaluator rejects playback/download URLs. Eligibility
  // and row-building live in `ttsLabellingSource` (pure + unit tested); a row
  // is only eligible when it has a key, so we never submit an unevaluatable
  // item. Total eligible count decides whether the button shows at all.
  const ttsLabellingEligibleCount = useMemo(
    () => countTtsLabellingEligible(evaluationResult?.provider_results ?? []),
    [evaluationResult],
  );
  const ttsLabellingRows: TtsLabellingRow[] = useMemo(
    () =>
      buildTtsLabellingRows(
        evaluationResult?.provider_results ?? [],
        ttsLabellingSelected,
        taskId.slice(0, 8),
        getProviderLabel,
      ),
    [evaluationResult, taskId, ttsLabellingSelected],
  );
  const ttsLabellingEvaluators: SourceEvaluatorRef[] = useMemo(
    () =>
      dedupeSourceEvaluators(
        evaluatorColumns.map((c) => ({ uuid: c.evaluatorUuid, name: c.label })),
      ),
    [evaluatorColumns],
  );

  const canShowLeaderboard =
    evaluationResult?.status === "done" &&
    !!evaluationResult.leaderboard_summary;
  const displayedActiveTab =
    (activeTab === "leaderboard" || activeTab === "about") &&
    !canShowLeaderboard
      ? "outputs"
      : activeTab;

  const customHeader = (
    <BackHeader
      label="Back to all TTS evaluations"
      onBack={() => router.push("/tts")}
      title="Back to TTS evaluations"
    />
  );

  return (
    <AppLayout
      activeItem="tts"
      onItemChange={(itemId) => router.push(`/${itemId}`)}
      sidebarOpen={sidebarOpen}
      onSidebarToggle={() => setSidebarOpen(!sidebarOpen)}
      customHeader={customHeader}
    >
      <div className="space-y-4 md:space-y-6">
        {/* Loading State */}
        {isLoading && (
          <div className="flex items-center justify-center gap-3 py-8">
            <svg
              className="w-5 h-5 animate-spin"
              fill="none"
              viewBox="0 0 24 24"
            >
              <circle
                className="opacity-25"
                cx="12"
                cy="12"
                r="10"
                stroke="currentColor"
                strokeWidth="4"
              ></circle>
              <path
                className="opacity-75"
                fill="currentColor"
                d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
              ></path>
            </svg>
          </div>
        )}

        {/* Error State */}
        {error && (
          <div className="border border-border rounded-xl p-12 flex flex-col items-center justify-center bg-muted/20">
            <p className="text-base text-red-500 mb-2">{error}</p>
            <button
              onClick={() => window.location.reload()}
              className="text-base text-muted-foreground hover:text-foreground transition-colors cursor-pointer"
            >
              Retry
            </button>
          </div>
        )}

        {/* Not Found State */}
        {errorCode && <NotFoundState errorCode={errorCode} />}

        {/* Evaluation Results */}
        {!isLoading && !error && !errorCode && evaluationResult && (
          <div className="space-y-4">
            {/* Header row: language / dataset / status / Share / Retry,
                all left-aligned. */}
            <div className="flex items-center gap-3 flex-wrap">
              {evaluationResult.language && (
                <span className="px-3 py-1 text-[12px] font-medium bg-muted rounded-full text-foreground capitalize">
                  {evaluationResult.language}
                </span>
              )}
              {evaluationResult.dataset_id && evaluationResult.dataset_name && (
                <Link
                  href={`/datasets/${evaluationResult.dataset_id}`}
                  className="flex items-center gap-1.5 px-3 py-1 text-[12px] font-medium bg-muted rounded-full text-foreground hover:bg-muted/70 transition-colors"
                >
                  <svg
                    className="w-3 h-3"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                    strokeWidth={2}
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      d="M20.25 6.375c0 2.278-3.694 4.125-8.25 4.125S3.75 8.653 3.75 6.375m16.5 0c0-2.278-3.694-4.125-8.25-4.125S3.75 4.097 3.75 6.375m16.5 0v11.25c0 2.278-3.694 4.125-8.25 4.125s-8.25-1.847-8.25-4.125V6.375m16.5 0v3.75m-16.5-3.75v3.75m16.5 0v3.75C20.25 16.153 16.556 18 12 18s-8.25-1.847-8.25-4.125v-3.75m16.5 0c0 2.278-3.694 4.125-8.25 4.125s-8.25-1.847-8.25-4.125"
                    />
                  </svg>
                  {evaluationResult.dataset_name}
                </Link>
              )}
              {evaluationResult.status !== "done" && (
                <StatusBadge status={evaluationResult.status} showSpinner />
              )}
              {/* Export per-row results as a zip containing `results.csv`
                  (row id, audio_name, evaluator scores — same convention
                  as the STT CSV) and an `audios/` folder of every
                  synthesized clip. Each audio is named
                  `<provider>_<row>.<ext>` so the audio_name CSV column
                  points directly at the file inside the zip. Placed
                  before Share so the Export ↔ Share ordering matches
                  TestRunnerDialog / BenchmarkResultsDialog / STT. */}
              {evaluationResult.status === "done" &&
                (evaluationResult.provider_results ?? []).some(
                  (pr) => (pr.results?.length ?? 0) > 0,
                ) && (
                  <ExportZipButton
                    filename={`tts-results-${evaluationResult.dataset_name ?? taskId}`}
                    getContents={() => {
                      const columns: ExportColumn[] = [
                        { key: "provider", header: "Provider" },
                        { key: "audio_name", header: "Audio name" },
                        { key: "text", header: "Text" },
                        ...evaluatorColumns.map((c) => ({
                          key: c.key,
                          header: c.label,
                        })),
                      ];
                      const rows: Record<string, unknown>[] = [];
                      const files: { path: string; url: string }[] = [];
                      for (const pr of evaluationResult.provider_results ??
                        []) {
                        for (const r of pr.results ?? []) {
                          // audio_path is rendered as <audio src=...> on the
                          // page, so it's already a fetchable URL. Use the
                          // path's extension if present; fall back to `.wav`
                          // (the backend's default container) when the URL
                          // has no extension or has querystring noise.
                          const ext = (() => {
                            try {
                              const u = new URL(
                                r.audio_path,
                                window.location.origin,
                              );
                              const m = u.pathname.match(/\.([a-z0-9]+)$/i);
                              return m ? m[1].toLowerCase() : "wav";
                            } catch {
                              const m = r.audio_path.match(/\.([a-z0-9]+)(?:\?|$)/i);
                              return m ? m[1].toLowerCase() : "wav";
                            }
                          })();
                          const audioName = r.audio_path
                            ? `${pr.provider}_${r.id}.${ext}`
                            : "";
                          const row: Record<string, unknown> = {
                            provider: getProviderLabel(pr.provider),
                            audio_name: audioName,
                            text: r.text,
                          };
                          // Read via `readEvaluatorCell` so the refreshed
                          // `evaluator_outputs[<uuid>]` shape is preferred
                          // over the legacy flat scoreField. Matches what
                          // TTSResultsTable renders on screen.
                          for (const c of evaluatorColumns) {
                            const { score, error } = readEvaluatorCell(
                              r as unknown as Record<string, unknown>,
                              c,
                            );
                            if (error || score === undefined) {
                              row[c.key] = "";
                              continue;
                            }
                            if (c.outputType === "binary") {
                              // Mirrors EvaluatorScoreCell: lowercase the
                              // raw string before comparing so judges that
                              // emit "True"/"TRUE" still register as Pass.
                              const norm = score.toLowerCase();
                              row[c.key] =
                                norm === "true" || norm === "1"
                                  ? "true"
                                  : "false";
                            } else {
                              const n = parseFloat(score);
                              row[c.key] = Number.isFinite(n) ? n : score;
                            }
                          }
                          rows.push(row);
                          if (audioName && r.audio_path) {
                            files.push({
                              path: `audios/${audioName}`,
                              url: r.audio_path,
                            });
                          }
                        }
                      }
                      return {
                        csv: { columns, rows },
                        files,
                      };
                    }}
                  />
                )}
              {/* Sharing only makes sense once the run is complete — earlier
                  state changes too quickly and a shared link would render
                  partial results. */}
              {evaluationResult.status === "done" && backendAccessToken && (
                <ShareButton
                  entityType="tts"
                  entityId={taskId}
                  accessToken={backendAccessToken}
                  initialIsPublic={evaluationResult.is_public ?? false}
                  initialShareToken={evaluationResult.share_token ?? null}
                />
              )}
              {/* Send the selected per-row (text, audio) pairs to a
                  human-alignment (TTS) task for labelling. Tick rows in the
                  Outputs table first. Desktop-only, matching STT. */}
              {evaluationResult.status === "done" &&
                ttsLabellingEligibleCount > 0 && (
                  <SubmitForLabellingButton
                    count={ttsLabellingRows.length}
                    emptyMessage="Select one or more rows to submit for labelling"
                    onOpen={() => setAddToTaskOpen(true)}
                  />
                )}
              {evaluationResult.status === "failed" &&
                backendAccessToken &&
                evaluationResult.dataset_id && (
                  <button
                    onClick={handleRetry}
                    disabled={retrying}
                    title="Re-run this evaluation on the same dataset, providers, and evaluators"
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[13px] font-medium border border-border bg-background hover:bg-muted/60 transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    <RetryIcon />
                    {retrying ? "Retrying…" : "Retry"}
                  </button>
                )}
            </div>

            {retryError && (
              <div className="rounded-md border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-600 dark:text-red-400">
                {retryError}
              </div>
            )}

            {/* Only show tabs and content when we have at least one provider result */}
            {evaluationResult.provider_results &&
              evaluationResult.provider_results.length > 0 && (
                <>
                  {/* Tab Navigation */}
                  <div className="flex gap-2 border-b border-border">
                    {/* Only show Leaderboard and About tabs once leaderboard data is available */}
                    {canShowLeaderboard && (
                      <button
                        onClick={() => handleTabChange("leaderboard")}
                        className={`px-4 py-2 text-[13px] font-medium border-b-2 transition-colors cursor-pointer ${
                          displayedActiveTab === "leaderboard"
                            ? "border-foreground text-foreground"
                            : "border-transparent text-muted-foreground hover:text-foreground"
                        }`}
                      >
                        Leaderboard
                      </button>
                    )}
                    <button
                      onClick={() => {
                        handleTabChange("outputs");
                        if (
                          !activeProviderTab &&
                          evaluationResult?.provider_results &&
                          evaluationResult.provider_results.length > 0
                        ) {
                          setActiveProviderTab(
                            evaluationResult.provider_results[0].provider,
                          );
                        }
                      }}
                      className={`px-4 py-2 text-[13px] font-medium border-b-2 transition-colors cursor-pointer ${
                        displayedActiveTab === "outputs"
                          ? "border-foreground text-foreground"
                          : "border-transparent text-muted-foreground hover:text-foreground"
                      }`}
                    >
                      Outputs
                    </button>
                    {canShowLeaderboard && (
                      <button
                        onClick={() => handleTabChange("about")}
                        className={`px-4 py-2 text-[13px] font-medium border-b-2 transition-colors cursor-pointer ${
                          displayedActiveTab === "about"
                            ? "border-foreground text-foreground"
                            : "border-transparent text-muted-foreground hover:text-foreground"
                        }`}
                      >
                        About
                      </button>
                    )}
                  </div>

                  {/* About Tab */}
                  {displayedActiveTab === "about" && canShowLeaderboard && (
                    <TTSEvaluationAbout
                      evaluatorRows={aboutEvaluators.map((e) => ({
                        key: e.uuid,
                        metric: (
                          <Link
                            href={`/evaluators/${e.uuid}`}
                            className="text-foreground underline-offset-2 hover:underline"
                            title={`Open evaluator: ${e.name}`}
                          >
                            {e.name}
                          </Link>
                        ),
                        description:
                          e.description ||
                          (e.uuid === defaultEvaluator?.uuid
                            ? (defaultEvaluator.description ?? "")
                            : ""),
                        outputType: e.outputType,
                        range:
                          e.outputType === "binary"
                            ? "Pass / Fail"
                            : ratingRange(e.scaleValues),
                      }))}
                    />
                  )}

                  {/* Leaderboard Tab */}
                  {displayedActiveTab === "leaderboard" &&
                    evaluationResult.leaderboard_summary && (
                      <TTSEvaluationLeaderboard
                        className="-mx-4 md:-mx-8 px-4 md:px-8 relative"
                        leaderboardSummary={
                          evaluationResult.leaderboard_summary
                        }
                        evaluatorColumns={evaluatorColumns}
                        getProviderLabel={getProviderLabel}
                      />
                    )}

                  {/* Outputs Tab */}
                  {displayedActiveTab === "outputs" && (
                    <TTSEvaluationOutputs
                      providerResults={evaluationResult.provider_results!}
                      activeProviderKey={activeProviderTab}
                      onProviderSelect={setActiveProviderTab}
                      status={evaluationResult.status}
                      evaluatorColumns={evaluatorColumns}
                      getProviderLabel={getProviderLabel}
                      labellingSelection={
                        evaluationResult.status === "done"
                          ? ttsLabellingSelected
                          : undefined
                      }
                      onToggleLabellingSelection={
                        evaluationResult.status === "done"
                          ? toggleTtsLabelling
                          : undefined
                      }
                      onLabellingBulkToggle={
                        evaluationResult.status === "done"
                          ? bulkToggleTtsLabelling
                          : undefined
                      }
                      labellingRowEligible={
                        evaluationResult.status === "done"
                          ? (r) => ttsRowAudioKey(r) !== ""
                          : undefined
                      }
                    />
                  )}
                </>
              )}
          </div>
        )}
      </div>

      <AddRunToLabellingTaskDialog
        isOpen={addToTaskOpen}
        onClose={() => setAddToTaskOpen(false)}
        source={{
          type: "tts_run",
          runUuid: taskId,
          runName: evaluationResult?.dataset_name ?? undefined,
          rows: ttsLabellingRows,
          evaluators: ttsLabellingEvaluators,
        }}
      />
    </AppLayout>
  );
}
