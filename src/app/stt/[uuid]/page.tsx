"use client";

import React, { useState, useEffect, useMemo, useRef } from "react";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { signOut } from "next-auth/react";
import { useAccessToken } from "@/hooks";
import { AppLayout } from "@/components/AppLayout";
import { BackHeader, StatusBadge, NotFoundState } from "@/components/ui";
import { sttProviders } from "@/components/agent-tabs/constants/providers";
import { POLLING_INTERVAL_MS } from "@/constants/polling";
import {
  ProviderSidebar,
  ProviderMetricsCard,
  STTResultsTable,
  LeaderboardTab,
  AboutMetricsTable,
  type STTEvaluatorColumn,
  type ChartConfig,
} from "@/components/eval-details";
import { useSidebarState } from "@/lib/sidebar";
import { getDataset } from "@/lib/datasets";
import { ShareButton } from "@/components/ShareButton";

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
};

type ProviderMetrics = {
  wer?: number;
  string_similarity?: number;
  llm_judge_score?: number;
  [k: string]:
    | number
    | { type?: string; mean?: number; scale_min?: number; scale_max?: number }
    | undefined;
};

type ProviderResultRow = {
  id: string;
  audio_url?: string;
  gt: string;
  pred: string;
  wer: string;
  string_similarity?: string;
  llm_judge_score?: string;
  llm_judge_reasoning?: string;
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
  string_similarity?: number;
  llm_judge_score?: number;
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
};

type EvaluatorSummary = {
  uuid: string;
  name: string;
  isDefault: boolean;
};

// Full-detail shape used to render the About-tab rows. Sourced from
// `GET /evaluators/{uuid}` (one fetch per evaluator linked to the job, or per
// default evaluator when the job has no `evaluator_uuids`).
type EvaluatorAbout = {
  uuid: string;
  name: string;
  outputType: "binary" | "rating";
  /** Numeric values from `live_version.output_config.scale` for `rating` evaluators. Empty for binary. */
  scaleValues: number[];
};

// Helper function to map provider value back to label
const getProviderLabel = (value: string): string => {
  const provider = sttProviders.find((p) => p.value === value);
  return provider ? provider.label : value;
};

// Compute the "min - max" range string for a rating evaluator's scale.
// Falls back to "-" when the scale is empty or has no numeric entries (e.g.
// a string-valued scale we don't know how to summarise).
const ratingRange = (scaleValues: number[]): string => {
  if (scaleValues.length === 0) return "-";
  const min = Math.min(...scaleValues);
  const max = Math.max(...scaleValues);
  return min === max ? String(min) : `${min} - ${max}`;
};

// Helper function to check if a provider has any empty predictions
const hasEmptyPredictions = (providerResult: ProviderResult): boolean => {
  return (
    providerResult.results?.some((r) => !r.pred || r.pred.trim() === "") ??
    false
  );
};

// Helper function to get the index of the first empty prediction
const getFirstEmptyPredictionIndex = (
  providerResult: ProviderResult,
): number => {
  return (
    providerResult.results?.findIndex((r) => !r.pred || r.pred.trim() === "") ??
    -1
  );
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
  const [errorCode, setErrorCode] = useState<401 | 403 | 404 | null>(null);
  // Persist the active tab across reloads via the `?tab=` query param.
  // Default to "outputs" when the param is missing or invalid; the
  // `Leaderboard` tab is only shown when the job is `done`, but keeping it
  // in the URL while the run is still in progress is harmless — the tab bar
  // simply won't render the Leaderboard button until then, and the
  // `activeTab === "leaderboard"` check below already requires
  // `leaderboard_summary` to be present before rendering content.
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
              "ngrok-skip-browser-warning": "true",
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
        const items: EvaluatorSummary[] = Array.isArray(data)
          ? data
              .filter(
                (m: { evaluator_type?: string }) =>
                  m.evaluator_type === "stt",
              )
              .map(
                (m: {
                  uuid: string;
                  name: string;
                  owner_user_id?: string | null;
                }) => ({
                  uuid: m.uuid,
                  name: m.name,
                  isDefault: !m.owner_user_id,
                }),
              )
          : [];
        setSttEvaluators(items);
      } catch (err) {
        console.error("Error fetching evaluators:", err);
      }
    };

    fetchEvaluators();
  }, [backendAccessToken]);

  // Resolve the evaluators rendered in the About tab. Three sources, in
  // priority order:
  //   1) `evaluator_runs` from any provider in the response (new format) —
  //      this carries the live `name`, stable `evaluator_uuid`, and an
  //      `aggregate` block with `type` plus `scale_min` / `scale_max` for
  //      rating evaluators. We can build the About rows directly from this
  //      without hitting `/evaluators/{uuid}`.
  //   2) Legacy `_info`-format payloads or `evaluator_uuids` lists. We take
  //      the union of `evaluator_uuids` and any UUIDs resolved by name from
  //      `${prefix}_info` keys in the first provider's `metrics`, then issue
  //      one `GET /evaluators/{uuid}` per target so we can render the
  //      "min - max" range for rating evaluators. The list endpoint isn't
  //      guaranteed to ship the scale.
  //   3) Truly legacy jobs (no runs, no `evaluator_uuids`, no `*_info`
  //      keys): fall back to the default STT evaluators so the tab still
  //      shows at least one row.
  useEffect(() => {
    const fetchAboutEvaluators = async () => {
      if (!evaluationResult) return;

      // (1) New format — derive directly from `evaluator_runs`.
      const firstRuns = (evaluationResult.provider_results ?? [])
        .map((pr) => pr.evaluator_runs)
        .find((er): er is EvaluatorRun[] => Array.isArray(er) && er.length > 0);

      if (firstRuns) {
        const byUuid = new Map<string, EvaluatorAbout>();
        for (const run of firstRuns) {
          if (byUuid.has(run.evaluator_uuid)) continue;
          const a = run.aggregate ?? {};
          const scaleValues: number[] = [];
          if (typeof a.scale_min === "number") scaleValues.push(a.scale_min);
          if (
            typeof a.scale_max === "number" &&
            a.scale_max !== a.scale_min
          ) {
            scaleValues.push(a.scale_max);
          }
          byUuid.set(run.evaluator_uuid, {
            uuid: run.evaluator_uuid,
            name: run.name ?? run.metric_key,
            outputType: a.type === "rating" ? "rating" : "binary",
            scaleValues,
          });
        }
        setAboutEvaluators(Array.from(byUuid.values()));
        return;
      }

      // (2) + (3) Legacy paths. Need the auth list first to validate UUIDs.
      if (!backendAccessToken || sttEvaluators.length === 0) return;

      const knownByUuid = new Set(sttEvaluators.map((e) => e.uuid));
      const knownByName = new Map(sttEvaluators.map((e) => [e.name, e.uuid]));

      const uuidSet = new Set<string>();
      for (const u of evaluationResult.evaluator_uuids ?? []) {
        if (knownByUuid.has(u)) uuidSet.add(u);
      }

      const firstMetrics = (evaluationResult.provider_results ?? [])
        .map((pr) => pr.metrics)
        .find((m): m is ProviderMetrics => !!m);
      if (firstMetrics) {
        for (const k of Object.keys(firstMetrics)) {
          if (k === "wer" || k === "string_similarity" || k === "llm_judge_score") {
            continue;
          }
          if (k.endsWith("_info")) {
            const prefix = k.slice(0, -"_info".length);
            const uuid = knownByName.get(prefix);
            if (uuid) uuidSet.add(uuid);
          }
        }
      }

      let targetUuids: string[] = Array.from(uuidSet);
      if (targetUuids.length === 0) {
        targetUuids = sttEvaluators.filter((e) => e.isDefault).map((e) => e.uuid);
      }

      if (targetUuids.length === 0) {
        setAboutEvaluators([]);
        return;
      }

      try {
        const backendUrl = process.env.NEXT_PUBLIC_BACKEND_URL;
        if (!backendUrl) return;

        const results = await Promise.all(
          targetUuids.map(async (uuid) => {
            const response = await fetch(`${backendUrl}/evaluators/${uuid}`, {
              method: "GET",
              headers: {
                accept: "application/json",
                "ngrok-skip-browser-warning": "true",
                Authorization: `Bearer ${backendAccessToken}`,
              },
            });
            if (!response.ok) return null;
            const data: {
              uuid: string;
              name: string;
              output_type: "binary" | "rating";
              live_version?: {
                output_config?: {
                  scale?: { value: number | boolean | string }[];
                } | null;
              } | null;
            } = await response.json();

            const scaleValues = (data.live_version?.output_config?.scale ?? [])
              .map((s) => Number(s.value))
              .filter((v) => !Number.isNaN(v));

            return {
              uuid: data.uuid,
              name: data.name,
              outputType: data.output_type,
              scaleValues,
            } satisfies EvaluatorAbout;
          }),
        );

        setAboutEvaluators(results.filter((e): e is EvaluatorAbout => e !== null));
      } catch (err) {
        console.error("Error fetching evaluator details:", err);
      }
    };

    fetchAboutEvaluators();
  }, [backendAccessToken, evaluationResult, sttEvaluators]);

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
            "ngrok-skip-browser-warning": "true",
            Authorization: `Bearer ${backendAccessToken}`,
          },
        });

        if (response.status === 401) {
          await signOut({ callbackUrl: "/login" });
          return;
        }

        if (response.status === 404) {
          setErrorCode(404);
          return;
        }

        if (response.status === 403) {
          setErrorCode(403);
          return;
        }

        if (!response.ok) {
          throw new Error("Failed to fetch evaluation result");
        }

        const result: EvaluationResult = await response.json();

        if (result.dataset_id) {
          try {
            await getDataset(backendAccessToken, result.dataset_id);
          } catch {
            result.dataset_id = null;
            result.dataset_name = null;
          }
        }

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
          const explicitTab = new URLSearchParams(
            window.location.search,
          ).get("tab");
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
        console.error("Error fetching evaluation result:", err);
        setError(
          err instanceof Error ? err.message : "Failed to load evaluation",
        );
      } finally {
        setIsLoading(false);
      }
    };

    fetchResult();
  }, [taskId, backendAccessToken]);

  const pollTaskStatus = async (taskId: string, backendUrl: string) => {
    try {
      const response = await fetch(`${backendUrl}/stt/evaluate/${taskId}`, {
        method: "GET",
        headers: {
          accept: "application/json",
          "ngrok-skip-browser-warning": "true",
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
          const explicitTab = new URLSearchParams(
            window.location.search,
          ).get("tab");
          if (!explicitTab) handleTabChange("leaderboard");
        }
        if (pollingIntervalRef.current) {
          clearInterval(pollingIntervalRef.current);
          pollingIntervalRef.current = null;
        }
      }
    } catch (error) {
      console.error("Error polling task status:", error);
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

  // The default STT evaluator drives the column / metric label that replaces
  // the previous generic "LLM Judge Score" everywhere on the page, and powers
  // the clickable pill embedded in the About-tab description column.
  const defaultEvaluator: EvaluatorSummary | null =
    sttEvaluators.find((e) => e.isDefault) ?? null;
  const judgeLabel = defaultEvaluator?.name ?? "LLM Judge Score";

  // Derive the per-evaluator columns rendered in the Outputs results table,
  // the per-provider metrics card and the Leaderboard chart/columns. Three
  // sources, in priority order:
  //
  //   1) New format — `evaluator_runs` on the response. Each entry gives us
  //      the live `name`, stable `evaluator_uuid`, the artefact column key
  //      (`metric_key` — the per-row CSV column with NO `_score` suffix),
  //      and the `aggregate.type` we use to pick the cell renderer.
  //   2) Legacy `_info` format — `${prefix}_info` keys in the first
  //      provider's `metrics`. The per-row column is `${prefix}_score` and
  //      the leaderboard summary key matches.
  //   3) Truly legacy single-evaluator jobs — synthesize one column reading
  //      `result.llm_judge_score` / `result.llm_judge_reasoning`, attributed
  //      to the default STT evaluator so the column header still shows a
  //      meaningful name and links cleanly in the About tab.
  //
  // The column carries explicit `scoreField` / `reasoningField` so the
  // results table doesn't need to know which format produced the row.
  const evaluatorColumns: STTEvaluatorColumn[] = useMemo(() => {
    const providerResults = evaluationResult?.provider_results ?? [];

    // (1) New format.
    const firstRuns = providerResults
      .map((pr) => pr.evaluator_runs)
      .find((er): er is EvaluatorRun[] => Array.isArray(er) && er.length > 0);

    if (firstRuns) {
      return firstRuns.map((run) => ({
        key: run.metric_key,
        label: run.name ?? run.metric_key,
        outputType: run.aggregate?.type === "rating" ? "rating" : "binary",
        scoreField: run.metric_key,
        reasoningField: `${run.metric_key}_reasoning`,
      }));
    }

    // (2) Legacy `_info` format.
    const firstMetrics = providerResults
      .map((pr) => pr.metrics)
      .find((m): m is ProviderMetrics => !!m);

    const dataDriven: { key: string; outputType: "binary" | "rating" }[] = [];
    if (firstMetrics) {
      for (const k of Object.keys(firstMetrics)) {
        if (k === "wer" || k === "string_similarity" || k === "llm_judge_score") {
          continue;
        }
        if (k.endsWith("_info")) {
          const prefix = k.slice(0, -"_info".length);
          const info = firstMetrics[k] as { type?: string } | undefined;
          dataDriven.push({
            key: prefix,
            outputType: info?.type === "rating" ? "rating" : "binary",
          });
        }
      }
    }

    if (dataDriven.length > 0) {
      return dataDriven.map((c) => {
        const a = aboutEvaluators.find((e) => e.name === c.key);
        return {
          key: c.key,
          // The label is the evaluator's stored name. Falls back to the raw
          // data prefix when the about-fetch hasn't resolved (e.g. mid-poll);
          // the label updates once the detail-fetch lands.
          label: a ? a.name : c.key,
          outputType: c.outputType,
          scoreField: `${c.key}_score`,
          reasoningField: `${c.key}_reasoning`,
        };
      });
    }

    // (3) Legacy single-evaluator fallback.
    const defaultAbout = defaultEvaluator
      ? aboutEvaluators.find((e) => e.uuid === defaultEvaluator.uuid)
      : undefined;
    return [
      {
        key: "llm_judge",
        label: defaultAbout?.name ?? judgeLabel,
        outputType: defaultAbout?.outputType ?? "binary",
        scoreField: "llm_judge_score",
        reasoningField: "llm_judge_reasoning",
      },
    ];
  }, [aboutEvaluators, evaluationResult, defaultEvaluator, judgeLabel]);

  // Resolve the aggregate `mean` for an evaluator column on a specific
  // provider. Tries the most authoritative source first:
  //   1) New format: `provider_results[i].evaluator_runs[*].aggregate.mean`
  //      where `metric_key === col.key`.
  //   2) Legacy formats: `metrics[col.scoreField]` is a flat number
  //      (`*_score` / `llm_judge_score`).
  //   3) New-format mid-state where `metrics[name]` arrived as a nested
  //      object before `evaluator_runs` populated.
  const readProviderMean = (
    col: STTEvaluatorColumn,
    pr: ProviderResult,
  ): number | undefined => {
    const run = pr.evaluator_runs?.find((r) => r.metric_key === col.key);
    if (run && typeof run.aggregate?.mean === "number") return run.aggregate.mean;

    const scoreField = col.scoreField ?? `${col.key}_score`;
    const m = pr.metrics?.[scoreField];
    if (typeof m === "number") return m;

    const nested = pr.metrics?.[col.key];
    if (
      nested &&
      typeof nested === "object" &&
      "mean" in nested &&
      typeof (nested as { mean: unknown }).mean === "number"
    ) {
      return (nested as { mean: number }).mean;
    }
    return undefined;
  };

  // Format a metric value the same way WER is formatted (rounded to 4 dp);
  // returns "-" for missing or non-numeric values so the metrics card and
  // leaderboard cells render a sensible placeholder while polling.
  const formatMetricValue = (v: unknown): string | number => {
    if (typeof v === "number" && Number.isFinite(v)) {
      return parseFloat(v.toFixed(4));
    }
    return "-";
  };

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
            {/* Language Pill, Dataset link, Status Badge, and Share */}
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
              {(evaluationResult.status === "done" || evaluationResult.status === "failed") && backendAccessToken && (
                <ShareButton
                  entityType="stt"
                  entityId={taskId}
                  accessToken={backendAccessToken}
                  initialIsPublic={evaluationResult.is_public ?? false}
                  initialShareToken={evaluationResult.share_token ?? null}
                />
              )}
            </div>

            {/* Only show tabs and content when we have at least one provider result */}
            {evaluationResult.provider_results &&
              evaluationResult.provider_results.length > 0 && (
                <>
                  {/* Tab Navigation */}
                  <div className="flex gap-2 border-b border-border">
                    {/* Only show Leaderboard tab when done */}
                    {evaluationResult.status === "done" && (
                      <button
                        onClick={() => handleTabChange("leaderboard")}
                        className={`px-4 py-2 text-[13px] font-medium border-b-2 transition-colors cursor-pointer ${
                          activeTab === "leaderboard"
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
                        activeTab === "outputs"
                          ? "border-foreground text-foreground"
                          : "border-transparent text-muted-foreground hover:text-foreground"
                      }`}
                    >
                      Outputs
                    </button>
                    <button
                      onClick={() => handleTabChange("about")}
                      className={`px-4 py-2 text-[13px] font-medium border-b-2 transition-colors cursor-pointer ${
                        activeTab === "about"
                          ? "border-foreground text-foreground"
                          : "border-transparent text-muted-foreground hover:text-foreground"
                      }`}
                    >
                      About
                    </button>
                  </div>

                  {/* About Tab */}
                  {activeTab === "about" && (
                    <AboutMetricsTable
                      metrics={[
                        { metric: "WER (Word Error Rate)", description: "Word error rate measures the percentage of words that differ between the reference transcription and the predicted transcription.", preference: "Lower is better", range: "0 - \u221E" },
                        ...aboutEvaluators.map((e) => ({
                          metric: e.name,
                          description: (
                            <Link
                              href={`/evaluators/${e.uuid}`}
                              className="inline-flex items-center gap-1.5 px-3 py-1 text-[12px] font-medium bg-muted rounded-full text-foreground hover:bg-muted/70 transition-colors"
                              title={`Open evaluator: ${e.name}`}
                            >
                              <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                              </svg>
                              {e.name}
                            </Link>
                          ),
                          preference: e.outputType === "binary" ? "Pass is better" : "Higher is better",
                          range: e.outputType === "binary" ? "Pass / Fail" : ratingRange(e.scaleValues),
                        })),
                      ]}
                    />
                  )}

                  {/* Leaderboard Tab */}
                  {activeTab === "leaderboard" && evaluationResult.leaderboard_summary && (() => {
                    // Build the leaderboard columns and chart rows from the
                    // dynamic evaluator list. WER stays first; every
                    // evaluator gets its own column reading
                    // `summary[col.scoreField]` (which equals the artefact
                    // column name — `metric_key` in the new format,
                    // `${prefix}_score` in legacy `_info`, `llm_judge_score`
                    // in legacy single-evaluator) and a matching bar chart
                    // (clamped to [0, 1] for binary evaluators, auto-fit
                    // for rating evaluators where the scale can vary).
                    const allCharts: ChartConfig[] = [
                      { title: "WER", dataKey: "wer" },
                      ...evaluatorColumns.map((col) => ({
                        title: col.label,
                        dataKey: col.scoreField ?? `${col.key}_score`,
                        yDomain:
                          col.outputType === "binary"
                            ? ([0, 1] as [number, number])
                            : undefined,
                      })),
                    ];
                    const chartRows: ChartConfig[][] = [];
                    for (let i = 0; i < allCharts.length; i += 2) {
                      chartRows.push(allCharts.slice(i, i + 2));
                    }
                    return (
                      <LeaderboardTab
                        className="-mx-4 md:-mx-8 px-4 md:px-8 w-[calc(100vw-32px)] md:w-[calc(100vw-56px)] ml-[calc((32px-100vw)/2+50%)] md:ml-[calc((56px-100vw)/2+50%)] relative"
                        columns={[
                          { key: "run", header: "Run", render: (v) => getProviderLabel(v) },
                          { key: "wer", header: "WER" },
                          ...evaluatorColumns.map((col) => ({
                            key: col.scoreField ?? `${col.key}_score`,
                            header: col.label,
                          })),
                        ]}
                        data={evaluationResult.leaderboard_summary!}
                        charts={chartRows}
                        filename="stt-evaluation-leaderboard"
                        getLabel={getProviderLabel}
                      />
                    );
                  })()}

                  {/* Outputs Tab */}
                  {activeTab === "outputs" && (
                    <div className="flex flex-col md:flex-row border border-border rounded-xl overflow-hidden md:h-[calc(100vh-220px)]">
                      <ProviderSidebar
                        items={evaluationResult.provider_results!.map((pr) => ({
                          key: pr.provider,
                          label: getProviderLabel(pr.provider),
                          success: pr.success === true && !hasEmptyPredictions(pr) ? true : pr.success === null ? null : false,
                        }))}
                        activeKey={activeProviderTab || evaluationResult.provider_results![0]?.provider}
                        onSelect={(key) => {
                          setActiveProviderTab(key);
                          const pr = evaluationResult.provider_results!.find((p) => p.provider === key);
                          if (pr && hasEmptyPredictions(pr)) {
                            setTimeout(() => {
                              const firstEmptyIndex = getFirstEmptyPredictionIndex(pr);
                              if (firstEmptyIndex >= 0 && tableContainerRef.current) {
                                const row = tableContainerRef.current.querySelector(`[data-row-index="${firstEmptyIndex}"]`);
                                row?.scrollIntoView({ behavior: "smooth", block: "center" });
                              }
                            }, 100);
                          }
                        }}
                      />

                      <div className="flex-1 overflow-y-auto p-4 md:p-6">
                        {(() => {
                          const selectedProvider =
                            activeProviderTab || evaluationResult.provider_results![0]?.provider;
                          const providerResult =
                            evaluationResult.provider_results!.find((pr) => pr.provider === selectedProvider);

                          if (!providerResult) {
                            return (
                              <div className="flex items-center justify-center h-full">
                                <p className="text-muted-foreground">Select a provider to view details</p>
                              </div>
                            );
                          }

                          if (providerResult.success === null && (!providerResult.results || providerResult.results.length === 0)) {
                            return (
                              <div className="flex items-center justify-center h-full min-h-[200px]">
                                <svg className="w-5 h-5 animate-spin text-muted-foreground" fill="none" viewBox="0 0 24 24">
                                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                                </svg>
                              </div>
                            );
                          }

                          if (providerResult.success === false) {
                            return (
                              <div className="flex items-center justify-center h-full min-h-[200px]">
                                <div className="border border-red-500/50 bg-red-500/10 rounded-lg p-4 max-w-md text-center">
                                  <div className="text-red-500 text-[14px] font-medium mb-1">
                                    There was an error running this provider. Please contact us by posting your issue to help us help you.
                                  </div>
                                </div>
                              </div>
                            );
                          }

                          // A row "has metrics" when WER is populated and
                          // every dynamic evaluator column has produced a
                          // score for it. While polling, partially completed
                          // rows defer the metrics columns until the whole
                          // batch completes (matches the old behaviour, just
                          // generalised over evaluator columns).
                          const showMetrics =
                            evaluationResult.status === "done" ||
                            (providerResult.results?.every((r) => {
                              if (r.wer === undefined || r.wer === "") return false;
                              return evaluatorColumns.every((col) => {
                                const v = r[col.scoreField ?? `${col.key}_score`];
                                return v !== undefined && v !== null && v !== "";
                              });
                            }) ?? false);

                          return (
                            <div className="space-y-4 md:space-y-6">
                              {providerResult.success && providerResult.metrics && (
                                <ProviderMetricsCard
                                  metrics={[
                                    { label: "WER", value: providerResult.metrics.wer != null ? parseFloat(providerResult.metrics.wer.toFixed(4)) : "-" },
                                    ...evaluatorColumns.map((col) => ({
                                      label: col.label,
                                      value: formatMetricValue(readProviderMean(col, providerResult)),
                                    })),
                                  ]}
                                />
                              )}
                              {providerResult.results && providerResult.results.length > 0 && (
                                <STTResultsTable
                                  results={providerResult.results}
                                  showMetrics={showMetrics}
                                  showSimilarity={false}
                                  evaluatorColumns={evaluatorColumns}
                                  tableRef={tableContainerRef}
                                />
                              )}
                            </div>
                          );
                        })()}
                      </div>
                    </div>
                  )}
                </>
              )}
          </div>
        )}
      </div>
    </AppLayout>
  );
}
