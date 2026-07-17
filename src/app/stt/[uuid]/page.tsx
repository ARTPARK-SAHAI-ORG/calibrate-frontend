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
import { sttProviders } from "@/components/agent-tabs/constants/providers";
import { POLLING_INTERVAL_MS } from "@/constants/polling";
import {
  STTEvaluationAbout,
  STTEvaluationLeaderboard,
  STTEvaluationOutputs,
  ratingRange,
  hasSTTEmptyPredictions,
  getFirstSTTEmptyPredictionIndex,
  hasSemanticWerMetric,
  hasTtfsMetric,
  type STTEvaluatorColumn,
} from "@/components/eval-details";
import type { LatencyMetric } from "@/components/eval-details/ttsEvalTypes";
import { readEvaluatorCell } from "@/components/eval-details/EvaluatorScoreCell";
import { SARVAM_METRIC_FIELDS } from "@/components/eval-details/sarvamMetrics";
import {
  AddRunToLabellingTaskDialog,
  type SttLabellingRow,
  type SourceEvaluatorRef,
} from "@/components/human-labelling/AddRunToLabellingTaskDialog";
import { useLabellingSelection } from "@/components/human-labelling/useLabellingSelection";
import {
  dedupeSourceEvaluators,
  SubmitForLabellingButton,
} from "@/components/human-labelling/labellingSubmit";
import { useSidebarState } from "@/lib/sidebar";
import { ShareButton } from "@/components/ShareButton";
import { ExportResultsButton, ExportColumn } from "@/components/ExportResultsButton";
import { retryEvaluation } from "@/lib/retryEvaluation";
import {
  deriveEvaluatorColumns,
  STT_RESERVED_METRIC_KEYS,
} from "@/lib/evaluatorColumns";
import type { AudioCostBreakdown } from "@/lib/audioCost";

// The STT evaluate API response now carries per-attached-evaluator data in
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
//      synthesize a single column attributed to the default STT evaluator
//      so the page still labels and links the score correctly.
//
// The shapes below keep `wer` / `string_similarity` / `llm_judge_score`
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
  wer?: number;
  cer?: number;
  // LLM-judged WER that ignores errors which wouldn't change an agent's
  // understanding. Present only when the run computed it.
  semantic_wer?: number;
  string_similarity?: number;
  llm_judge_score?: number;
  // Present only when the run used Sarvam LLM judges. LLM-WER/CER share the
  // `wer`/`cer` scale; intent/entity are 0-1 (higher is better). Older runs /
  // judges-off runs omit them.
  sarvam_llm_wer?: number;
  sarvam_llm_cer?: number;
  sarvam_intent_score?: number;
  sarvam_entity_score?: number;
  // TTFS (Time To Final Segment) streaming latency. Reported as a latency
  // block (`p50` headline) or a plain number. Present only when measured.
  ttfs?: LatencyMetric | number;
  // Per-provider cost block (per-minute USD pricing × audio duration). Present
  // only when the run computed cost.
  cost?: AudioCostBreakdown;
  [k: string]:
    | number
    | LatencyMetric
    | AudioCostBreakdown
    | { type?: string; mean?: number; scale_min?: number; scale_max?: number }
    | undefined;
};

type ProviderResultRow = {
  id: string;
  audio_url?: string;
  gt: string;
  pred: string;
  wer: string;
  cer?: string;
  semantic_wer?: number | string;
  semantic_wer_reasoning?: string;
  // Per-row latency in seconds (TTFS). `null` for providers that don't report it.
  ttfs?: number | string | null;
  string_similarity?: string;
  llm_judge_score?: string;
  llm_judge_reasoning?: string;
  // Present only when the run used Sarvam LLM judges. `*_reasoning` is a JSON
  // string of the judged segments.
  sarvam_llm_wer?: number | string;
  sarvam_llm_cer?: number | string;
  sarvam_intent_score?: number | string;
  sarvam_entity_score?: number | string;
  sarvam_llm_wer_reasoning?: string;
  sarvam_intent_reasoning?: string;
  sarvam_entity_reasoning?: string;
  [k: string]: unknown;
};

type ProviderResult = {
  provider: string;
  success: boolean;
  message: string;
  metrics: ProviderMetrics;
  results: ProviderResultRow[];
  /** New format only — present once the run produces nested per-evaluator metrics. Older jobs omit this. */
  evaluator_runs?: EvaluatorRun[] | null;
};

type LeaderboardSummary = {
  run: string;
  count: number;
  wer?: number;
  cer?: number;
  semantic_wer?: number;
  string_similarity?: number;
  llm_judge_score?: number;
  // Present only when the run used Sarvam LLM judges.
  sarvam_llm_wer?: number;
  sarvam_llm_cer?: number;
  sarvam_intent_score?: number;
  sarvam_entity_score?: number;
  // TTFS streaming latency (seconds), flattened onto the leaderboard row. New
  // runs report the median under `ttfs_p50`; older runs used a flat `ttfs`.
  ttfs_p50?: number;
  ttfs?: number;
  [k: string]: string | number | undefined;
};

type EvaluationResult = {
  task_id: string;
  status: "queued" | "in_progress" | "done" | "failed";
  language?: string;
  dataset_id?: string | null;
  dataset_name?: string | null;
  evaluator_uuids?: string[] | null;
  provider_results?: ProviderResult[];
  leaderboard_summary?: LeaderboardSummary[];
  error?: string | null;
  is_public?: boolean;
  share_token?: string | null;
  /** When the run was created — dates the INR conversion-rate caveat. */
  created_at?: string | null;
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
  const provider = sttProviders.find((p) => p.value === value);
  return provider ? provider.label : value;
};

type ActiveTab = "leaderboard" | "outputs" | "about";
const ACTIVE_TABS: readonly ActiveTab[] = ["leaderboard", "outputs", "about"];

export default function STTEvaluationDetailPage() {
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
  const [sttEvaluators, setSttEvaluators] = useState<EvaluatorSummary[]>([]);
  const [aboutEvaluators, setAboutEvaluators] = useState<EvaluatorAbout[]>([]);
  const pollingIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const tableContainerRef = useRef<HTMLDivElement | null>(null);

  // Set page title and collapse main sidebar for more space
  useEffect(() => {
    document.title = "STT Evaluation | Calibrate";
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

  // Fetch STT evaluators (defaults + user-owned). The page-wide score label
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
          .filter((m) => m.evaluator_type === "stt")
          .map((m) => ({
            uuid: m.uuid,
            name: m.name,
            description: m.description ?? null,
            isDefault: isDefaultEvaluator(m),
          }));
        setSttEvaluators(items);
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

        const response = await fetch(`${backendUrl}/stt/evaluate/${taskId}`, {
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

        // Set first provider as active tab if results exist
        if (result.provider_results && result.provider_results.length > 0) {
          setActiveProviderTab(result.provider_results[0].provider);
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
      const response = await fetch(`${backendUrl}/stt/evaluate/${taskId}`, {
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

      // Set first provider as active tab when results first become available
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
      const response = await fetch(`${backendUrl}/stt/evaluate/${taskId}`, {
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
        setActiveProviderTab(result.provider_results[0].provider);
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
    const result = await retryEvaluation("stt", taskId, backendAccessToken);
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

  // The default STT evaluator drives the column / metric label for legacy
  // single-evaluator jobs when the job payload doesn't carry evaluator_runs.
  const defaultEvaluator: EvaluatorSummary | null =
    sttEvaluators.find((e) => e.isDefault) ?? null;
  const judgeLabel = defaultEvaluator?.name ?? "Evaluator";

  // Derive the per-evaluator columns rendered in the Outputs results table,
  // the per-provider metrics card and the Leaderboard chart/columns. See
  // `deriveEvaluatorColumns` for the priority order across the four shapes
  // the backend has emitted.
  const evaluatorColumns: STTEvaluatorColumn[] = useMemo(
    () =>
      deriveEvaluatorColumns({
        providerResults: evaluationResult?.provider_results ?? [],
        aboutEvaluators,
        reservedMetricKeys: STT_RESERVED_METRIC_KEYS,
        singleJudgeFallback: {
          defaultEvaluatorUuid: defaultEvaluator?.uuid,
          defaultLabel: judgeLabel,
          defaultOutputType: "binary",
        },
      }),
    [aboutEvaluators, evaluationResult, defaultEvaluator, judgeLabel],
  );

  // Whether this run computed Sarvam's LLM judges — drives the extra About-tab
  // metric rows. Detected from the presence of the aggregate metric keys on
  // any provider (absent on judges-off and pre-feature runs).
  const hasSarvamMetrics = useMemo(
    () =>
      (evaluationResult?.provider_results ?? []).some(
        (pr) =>
          pr.metrics?.sarvam_llm_wer != null ||
          pr.metrics?.sarvam_llm_cer != null,
      ),
    [evaluationResult],
  );

  // Whether this run computed Semantic WER — drives the extra About-tab row and
  // the CSV column. Detected from the aggregate metric on any provider.
  const hasSemanticWer = useMemo(
    () => hasSemanticWerMetric(evaluationResult?.provider_results),
    [evaluationResult],
  );

  // Whether this run measured TTFS — drives the extra About-tab row. Detected
  // from the aggregate latency metric on any provider.
  const hasTtfs = useMemo(
    () => hasTtfsMetric(evaluationResult?.provider_results),
    [evaluationResult],
  );

  // "Submit for labelling": pick individual result rows (per provider) and
  // send them to an STT annotation task. Rows are keyed `${provider}:${index}`
  // — the same keys `STTResultsTable` toggles — so selection is stable across
  // provider switches. Only the SELECTED rows become items (reference vs.
  // predicted transcript); names include provider + index + a run-id suffix so
  // they stay unique within a task. Evaluators come from `evaluatorColumns`.
  const [addToTaskOpen, setAddToTaskOpen] = useState(false);
  const {
    selected: sttLabellingSelected,
    toggle: toggleSttLabelling,
    bulkToggle: bulkToggleSttLabelling,
  } = useLabellingSelection();
  // Total rows eligible to be labelled (non-empty ground truth), used to
  // decide whether to show the "Submit for labelling" button at all.
  const sttLabellingEligibleCount = useMemo(() => {
    let count = 0;
    for (const pr of evaluationResult?.provider_results ?? []) {
      for (const r of pr.results ?? []) {
        if (r.gt && r.gt.trim() !== "") count += 1;
      }
    }
    return count;
  }, [evaluationResult]);
  const sttLabellingRows: SttLabellingRow[] = useMemo(() => {
    const rows: SttLabellingRow[] = [];
    const suffix = taskId.slice(0, 8);
    for (const pr of evaluationResult?.provider_results ?? []) {
      const providerLabel = getProviderLabel(pr.provider);
      (pr.results ?? []).forEach((r, i) => {
        if (!r.gt || r.gt.trim() === "") return;
        if (!sttLabellingSelected.has(`${pr.provider}:${i}`)) return;
        rows.push({
          name: `${providerLabel} #${i + 1} — ${suffix}`,
          reference_transcript: r.gt,
          predicted_transcript: r.pred ?? "",
        });
      });
    }
    return rows;
  }, [evaluationResult, taskId, sttLabellingSelected]);
  const sttLabellingEvaluators: SourceEvaluatorRef[] = useMemo(
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
    <BackHeader label="Back" onBack={() => router.push("/stt")} title="Back" />
  );

  return (
    <AppLayout
      activeItem="stt"
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
              {/* Export per-row results to CSV. Placed before Share so the
                  Export ↔ Share button order matches TestRunnerDialog /
                  BenchmarkResultsDialog. One row per (provider, row);
                  columns: reference / predicted text, WER, and one column
                  per attached evaluator (binary → "true"/"false", rating →
                  raw numeric score). Built at click time so it reflects
                  the latest state if the user re-runs the page. */}
              {evaluationResult.status === "done" &&
                (evaluationResult.provider_results ?? []).some(
                  (pr) => (pr.results?.length ?? 0) > 0,
                ) && (
                  <ExportResultsButton
                    filename={`stt-results-${evaluationResult.dataset_name ?? taskId}`}
                    getRows={() => {
                      const columns: ExportColumn[] = [
                        { key: "provider", header: "Provider" },
                        { key: "reference_text", header: "Reference text" },
                        { key: "predicted_text", header: "Predicted text" },
                        { key: "wer", header: "WER" },
                        { key: "cer", header: "CER" },
                        // Semantic WER, only when the run computed it.
                        ...(hasSemanticWer
                          ? [{ key: "semantic_wer", header: "Semantic WER" }]
                          : []),
                        // Sarvam LLM metrics, only when the run computed them.
                        ...(hasSarvamMetrics
                          ? SARVAM_METRIC_FIELDS.map((f) => ({
                              key: f.csvKey,
                              header: f.label,
                            }))
                          : []),
                        ...evaluatorColumns.map((c) => ({
                          key: c.key,
                          header: c.label,
                        })),
                      ];
                      const rows: Record<string, unknown>[] = [];
                      for (const pr of evaluationResult.provider_results ??
                        []) {
                        for (const r of pr.results ?? []) {
                          const row: Record<string, unknown> = {
                            provider: getProviderLabel(pr.provider),
                            reference_text: r.gt,
                            predicted_text: r.pred,
                            wer: r.wer,
                            cer: r.cer,
                            ...(hasSemanticWer
                              ? { semantic_wer: r.semantic_wer ?? "" }
                              : {}),
                            ...(hasSarvamMetrics
                              ? Object.fromEntries(
                                  SARVAM_METRIC_FIELDS.map((f) => [
                                    f.csvKey,
                                    r[f.key] ?? "",
                                  ]),
                                )
                              : {}),
                          };
                          // Read via `readEvaluatorCell` so the refreshed
                          // `evaluator_outputs[<uuid>]` shape is preferred
                          // over the legacy flat scoreField. Matches what
                          // STTResultsTable renders on screen.
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
                        }
                      }
                      return { columns, rows };
                    }}
                  />
                )}
              {/* Sharing only makes sense once the run is complete — earlier
                  state changes too quickly and a shared link would render
                  partial results. */}
              {evaluationResult.status === "done" && backendAccessToken && (
                <ShareButton
                  entityType="stt"
                  entityId={taskId}
                  accessToken={backendAccessToken}
                  initialIsPublic={evaluationResult.is_public ?? false}
                  initialShareToken={evaluationResult.share_token ?? null}
                />
              )}
              {/* Send the selected per-row transcripts to a human-alignment
                  (STT) task for labelling. Tick rows in the Outputs table
                  first. Desktop-only, matching TestRunnerDialog. */}
              {evaluationResult.status === "done" &&
                sttLabellingEligibleCount > 0 && (
                  <SubmitForLabellingButton
                    count={sttLabellingRows.length}
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
                    <STTEvaluationAbout
                      showSarvamMetrics={hasSarvamMetrics}
                      showSemanticWer={hasSemanticWer}
                      showTtfs={hasTtfs}
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
                      <STTEvaluationLeaderboard
                        className="-mx-4 md:-mx-8 px-4 md:px-8 relative"
                        leaderboardSummary={
                          evaluationResult.leaderboard_summary
                        }
                        evaluatorColumns={evaluatorColumns}
                        getProviderLabel={getProviderLabel}
                        providerResults={evaluationResult.provider_results}
                      />
                    )}

                  {/* Outputs Tab */}
                  {displayedActiveTab === "outputs" && (
                    <STTEvaluationOutputs
                      providerResults={evaluationResult.provider_results!}
                      activeProviderKey={activeProviderTab}
                      onProviderSelect={(key) => {
                        setActiveProviderTab(key);
                        const pr = evaluationResult.provider_results!.find(
                          (p) => p.provider === key,
                        );
                        if (pr && hasSTTEmptyPredictions(pr)) {
                          setTimeout(() => {
                            const firstEmptyIndex =
                              getFirstSTTEmptyPredictionIndex(pr);
                            if (
                              firstEmptyIndex >= 0 &&
                              tableContainerRef.current
                            ) {
                              const row =
                                tableContainerRef.current.querySelector(
                                  `[data-row-index="${firstEmptyIndex}"]`,
                                );
                              row?.scrollIntoView({
                                behavior: "smooth",
                                block: "center",
                              });
                            }
                          }, 100);
                        }
                      }}
                      status={evaluationResult.status}
                      evaluatorColumns={evaluatorColumns}
                      getProviderLabel={getProviderLabel}
                      runDate={evaluationResult.created_at}
                      tableRef={tableContainerRef}
                      labellingSelection={
                        evaluationResult.status === "done"
                          ? sttLabellingSelected
                          : undefined
                      }
                      onToggleLabellingSelection={
                        evaluationResult.status === "done"
                          ? toggleSttLabelling
                          : undefined
                      }
                      onLabellingBulkToggle={
                        evaluationResult.status === "done"
                          ? bulkToggleSttLabelling
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
          type: "stt_run",
          runUuid: taskId,
          runName: evaluationResult?.dataset_name ?? undefined,
          rows: sttLabellingRows,
          evaluators: sttLabellingEvaluators,
        }}
      />
    </AppLayout>
  );
}
