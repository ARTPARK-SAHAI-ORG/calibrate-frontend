"use client";
import { reportError } from "@/lib/reportError";

import React, { useState, useEffect, useRef, useMemo, useCallback } from "react";
import { useParams, useRouter } from "@/lib/nav";
import { signOut } from "next-auth/react";
import { useAccessToken, usePageErrorState } from "@/hooks";
import { AppLayout, useHideFloatingButton } from "@/components/AppLayout";
import {
  Breadcrumbs,
  NotFoundState,
  StopRunButton,
  type Crumb,
} from "@/components/ui";
import { formatStatus, getStatusBadgeClass } from "@/lib/status";
import { POLLING_INTERVAL_MS } from "@/constants/polling";
import { useSidebarState } from "@/lib/sidebar";
import { ShareButton } from "@/components/ShareButton";
import {
  SimulationMetricsGrid,
  SimulationResultsTable,
  SimulationTranscriptDialog,
  isSimulationLabellable,
  LATENCY_KEYS,
  type MetricData,
  type SimulationResult,
} from "@/components/eval-details";
import {
  AddRunToLabellingTaskDialog,
  type ConversationLabellingResult,
  type SourceEvaluatorRef,
} from "@/components/human-labelling/AddRunToLabellingTaskDialog";
import { useLabellingSelection } from "@/components/human-labelling/useLabellingSelection";
import {
  dedupeSourceEvaluators,
  SubmitForLabellingButton,
} from "@/components/human-labelling/labellingSubmit";

type RunEvaluator = {
  evaluator_uuid: string;
  name: string;
  description?: string | null;
};

type RunData = {
  task_id: string;
  name: string;
  status: string;
  type: "text" | "voice";
  updated_at: string;
  total_simulations: number;
  // Backend now keys metrics by evaluator name (e.g. "Empathy & Tone")
  // rather than fixed metric ids. Index signature keeps backward compat
  // with old shape.
  metrics: Record<string, MetricData | undefined> | null;
  simulation_results: SimulationResult[];
  results_s3_prefix: string;
  // Top-level evaluators list — present on newer runs; null for runs
  // started before the migration. `name` is the *current* DB name
  // (rename-safe for display labels); `evaluator_uuid` is the stable id
  // for routing.
  evaluators?: RunEvaluator[] | null;
  error: string | null;
  is_public?: boolean;
  share_token?: string | null;
};

export default function SimulationRunPage() {
  const router = useRouter();
  const params = useParams();
  const backendAccessToken = useAccessToken();
  const uuid = params.uuid as string;
  const runId = params.runId as string;
  const [sidebarOpen, setSidebarOpen] = useSidebarState();
  const [runData, setRunData] = useState<RunData | null>(null);
  const [simulationName, setSimulationName] = useState<string | null>(null);
  // Map of evaluator name → uuid pulled from the parent simulation's
  // config (`GET /simulations/{uuid}` → `data.evaluators[]`). Used as a
  // fallback for the metric card's preview affordance when the run
  // response itself doesn't include the new top-level `evaluators`
  // field or per-row `evaluator_uuid`s (older runs / partial backends).
  const [simulationEvaluatorUuidByName, setSimulationEvaluatorUuidByName] =
    useState<Record<string, string>>({});
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const { errorCode, captureResponse } = usePageErrorState();
  const [transcriptDialogOpen, setTranscriptDialogOpen] = useState(false);
  const [addToTaskOpen, setAddToTaskOpen] = useState(false);

  // Hide the floating "Talk to Us" button when the transcript dialog is open
  useHideFloatingButton(transcriptDialogOpen);
  const [selectedSimulationKey, setSelectedSimulationKey] = useState<
    string | null
  >(null);
  // Store a frozen copy of the simulation once it's complete to prevent re-renders
  const frozenSimulationRef = useRef<SimulationResult | null>(null);

  // Refresh run data to get fresh presigned URLs when audio fails to load
  const refreshRunData = useCallback(async () => {
    if (!backendAccessToken) return;

    try {
      const backendUrl = process.env.NEXT_PUBLIC_BACKEND_URL;
      if (!backendUrl) return;

      const response = await fetch(`${backendUrl}/simulations/run/${runId}`, {
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

      if (!response.ok) return;

      const data: RunData = await response.json();
      // Clear frozen simulation to allow fresh URLs to be used
      frozenSimulationRef.current = null;
      setRunData(data);
    } catch (err) {
      reportError("Error refreshing run data for audio URLs:", err);
    }
  }, [runId, backendAccessToken]);

  // Derive selectedSimulation from runData using the key
  // Uses simulation_name as unique identifier to ensure correct simulation's transcript is shown
  // Once the simulation is complete (has evaluation_results), freeze it to prevent audio reload
  const selectedSimulation = useMemo(() => {
    if (!selectedSimulationKey || !runData?.simulation_results) {
      return null;
    }

    const currentSim = runData.simulation_results.find(
      (sim) => sim.simulation_name === selectedSimulationKey
    );

    if (!currentSim) {
      return frozenSimulationRef.current;
    }

    // If we have a frozen simulation that's complete, keep using it
    if (frozenSimulationRef.current?.evaluation_results) {
      return frozenSimulationRef.current;
    }

    // If current simulation is now complete, freeze it
    if (currentSim.evaluation_results) {
      frozenSimulationRef.current = currentSim;
      return currentSim;
    }

    // Still in progress, return current (live updates)
    return currentSim;
  }, [selectedSimulationKey, runData?.simulation_results]);

  // Fetch simulation name for page title
  useEffect(() => {
    const fetchSimulationName = async () => {
      if (!backendAccessToken) return;

      try {
        const backendUrl = process.env.NEXT_PUBLIC_BACKEND_URL;
        if (!backendUrl) return;

        const response = await fetch(`${backendUrl}/simulations/${uuid}`, {
          method: "GET",
          headers: {
            accept: "application/json",
            Authorization: `Bearer ${backendAccessToken}`,
          },
        });

        if (response.ok) {
          const data = await response.json();
          setSimulationName(data.name);
          // Pull evaluator UUIDs from the simulation config so the run
          // page can still open an evaluator preview even when the run
          // response itself doesn't include `evaluators` / per-row
          // `evaluator_uuid` (e.g. older runs).
          if (Array.isArray(data?.evaluators)) {
            const map: Record<string, string> = {};
            for (const ev of data.evaluators as Array<{
              uuid?: string;
              name?: string;
            }>) {
              if (ev?.name && ev?.uuid) map[ev.name] = ev.uuid;
            }
            setSimulationEvaluatorUuidByName(map);
          }
        }
      } catch (err) {
        reportError("Error fetching simulation name:", err);
      }
    };

    fetchSimulationName();
  }, [uuid, backendAccessToken]);

  // Set page title when run data and simulation name are loaded
  useEffect(() => {
    if (runData?.name && simulationName) {
      document.title = `${runData.name} | ${simulationName} | Calibrate`;
    } else if (runData?.name) {
      document.title = `${runData.name} | Calibrate`;
    } else {
      document.title = "Simulation Run | Calibrate";
    }
  }, [runData?.name, simulationName]);

  useEffect(() => {
    if (!backendAccessToken) return;

    let pollInterval: NodeJS.Timeout | null = null;

    const fetchRunData = async (isInitialLoad = false) => {
      try {
        if (isInitialLoad) {
          setIsLoading(true);
          setError(null);
        }
        const backendUrl = process.env.NEXT_PUBLIC_BACKEND_URL;
        if (!backendUrl) {
          throw new Error("BACKEND_URL environment variable is not set");
        }

        const response = await fetch(`${backendUrl}/simulations/run/${runId}`, {
          method: "GET",
          headers: {
            accept: "application/json",
            Authorization: `Bearer ${backendAccessToken}`,
          },
        });

        if (captureResponse(response)) return;

        if (!response.ok) {
          throw new Error("Failed to fetch run data");
        }

        const data: RunData = await response.json();
        setRunData(data);

        // Stop polling if status is "done"
        if (data.status.toLowerCase() === "done" && pollInterval) {
          clearInterval(pollInterval);
          pollInterval = null;
        }
      } catch (err) {
        reportError("Error fetching run data:", err);
        if (isInitialLoad) {
          setError(err instanceof Error ? err.message : "Failed to load run");
        } else {
          // Set status to failed and stop polling on fetch error during polling
          setRunData((prev) => (prev ? { ...prev, status: "failed" } : prev));
          if (pollInterval) {
            clearInterval(pollInterval);
            pollInterval = null;
          }
        }
      } finally {
        if (isInitialLoad) {
          setIsLoading(false);
        }
      }
    };

    // Initial fetch
    fetchRunData(true);

    // Start polling every 3 seconds
    pollInterval = setInterval(() => {
      fetchRunData(false);
    }, POLLING_INTERVAL_MS);

    // Cleanup on unmount
    return () => {
      if (pollInterval) {
        clearInterval(pollInterval);
      }
    };
  }, [runId, backendAccessToken, captureResponse]);

  const getTypeBadgeClass = (type: string) => {
    switch (type.toLowerCase()) {
      case "text":
        return "bg-purple-100 text-purple-700 dark:bg-purple-500/20 dark:text-purple-400";
      case "voice":
        return "bg-orange-100 text-orange-700 dark:bg-orange-500/20 dark:text-orange-400";
      default:
        return "bg-gray-200 text-gray-700 dark:bg-gray-500/20 dark:text-gray-400";
    }
  };

  // Map of metric name → evaluator UUID, used to turn a metric card into a
  // preview of how that evaluator judges. Resolution priority:
  //   1. `runData.evaluators[]` (top-level, newer runs) — rename-safe
  //      live `name` keyed to a stable `evaluator_uuid`.
  //   2. `simulation_results[i].evaluation_results[].evaluator_uuid` —
  //      per-row fallback for runs that don't carry the top-level
  //      `evaluators` field but do carry per-row uuids.
  //   3. `simulationEvaluatorUuidByName` from the parent simulation
  //      config (`GET /simulations/{uuid}` → `data.evaluators[]`) — last
  //      resort for older runs that have neither (1) nor (2). The
  //      mapping is by name, so renaming an evaluator after the run
  //      could mis-link, but this is the best we can do without per-run
  //      uuids.
  const evaluatorUuidByName = useMemo(() => {
    const map: Record<string, string> = {};
    if (runData?.evaluators) {
      for (const ev of runData.evaluators) {
        if (ev?.name && ev?.evaluator_uuid) map[ev.name] = ev.evaluator_uuid;
      }
    }
    if (runData?.simulation_results) {
      for (const sim of runData.simulation_results) {
        if (!sim.evaluation_results) continue;
        for (const r of sim.evaluation_results) {
          if (r?.name && r?.evaluator_uuid && !(r.name in map)) {
            map[r.name] = r.evaluator_uuid;
          }
        }
      }
    }
    for (const [name, evaluatorUuid] of Object.entries(
      simulationEvaluatorUuidByName
    )) {
      if (!(name in map)) map[name] = evaluatorUuid;
    }
    return map;
  }, [runData, simulationEvaluatorUuidByName]);

  // "Submit for labelling": pick individual simulations and send each one's
  // transcript to a conversation annotation task. Rows are keyed by their
  // ORIGINAL index in `simulation_results` (stable regardless of the table's
  // display sort). A simulation is eligible when it isn't aborted and has at
  // least one non-`end_reason` transcript turn.
  const {
    selected: simLabellingSelected,
    toggle: toggleSimLabelling,
    bulkToggle: bulkToggleSimLabelling,
  } = useLabellingSelection();
  const eligibleSimKeys = useMemo(
    () =>
      (runData?.simulation_results ?? []).reduce<string[]>((acc, sim, i) => {
        if (isSimulationLabellable(sim)) acc.push(String(i));
        return acc;
      }, []),
    [runData]
  );
  const conversationLabellingResults: ConversationLabellingResult[] = useMemo(() => {
    const out: ConversationLabellingResult[] = [];
    const suffix = runId.slice(0, 8);
    (runData?.simulation_results ?? []).forEach((sim, index) => {
      if (!isSimulationLabellable(sim)) return;
      if (!simLabellingSelected.has(String(index))) return;
      const transcript = (sim.transcript ?? []).filter(
        (t) => t.role !== "end_reason",
      );
      const baseName =
        sim.simulation_name ||
        [sim.persona?.label, sim.scenario?.name].filter(Boolean).join(" / ") ||
        "Simulation";
      out.push({ name: `${baseName} — ${suffix}`, transcript });
    });
    return out;
  }, [runData, runId, simLabellingSelected]);
  const conversationLabellingEvaluators: SourceEvaluatorRef[] = useMemo(
    () =>
      dedupeSourceEvaluators(
        Object.entries(evaluatorUuidByName).map(([name, evaluatorUuid]) => ({
          uuid: evaluatorUuid,
          name,
        })),
      ),
    [evaluatorUuidByName],
  );

  const evaluatorDescriptionByName = useMemo(() => {
    const map: Record<string, string> = {};
    if (runData?.evaluators) {
      for (const ev of runData.evaluators) {
        if (ev?.name && ev.description) map[ev.name] = ev.description;
      }
    }
    if (runData?.simulation_results) {
      for (const sim of runData.simulation_results) {
        if (!sim.evaluation_results) continue;
        for (const result of sim.evaluation_results) {
          if (result?.name && result.description && !(result.name in map)) {
            map[result.name] = result.description;
          }
          if (
            result?.name === "stt_llm_judge_score" &&
            result.description &&
            !("stt_llm_judge" in map)
          ) {
            map.stt_llm_judge = result.description;
          }
        }
      }
    }
    return map;
  }, [runData]);

  // Table columns: every metric except the latency ones, which have their
  // own tab in the metric cards above.
  const displayMetricKeys = useMemo(() => {
    if (runData?.metrics) {
      return Object.keys(runData.metrics).filter((k) => !LATENCY_KEYS.includes(k));
    }
    const keys = new Set<string>();
    (runData?.simulation_results ?? []).forEach((sim) => {
      sim.evaluation_results?.forEach((r) => {
        if (!LATENCY_KEYS.includes(r.name)) keys.add(r.name);
      });
    });
    return Array.from(keys);
  }, [runData]);

  const openTranscriptDialog = (simulation: SimulationResult) => {
    // Use simulation_name as unique key to keep dialog in sync with polling updates
    // This ensures only this simulation's transcript updates, not another row's
    setSelectedSimulationKey(simulation.simulation_name);
    setTranscriptDialogOpen(true);
  };

  const closeTranscriptDialog = () => {
    setTranscriptDialogOpen(false);
    setSelectedSimulationKey(null);
    frozenSimulationRef.current = null; // Clear frozen data when dialog closes
  };

  const abortSimulation = async () => {
    if (!backendAccessToken) return;

    try {
      const backendUrl = process.env.NEXT_PUBLIC_BACKEND_URL;
      if (!backendUrl) return;

      const response = await fetch(
        `${backendUrl}/simulations/run/${runId}/abort`,
        {
          method: "POST",
          headers: {
            accept: "application/json",
            Authorization: `Bearer ${backendAccessToken}`,
          },
        }
      );

      if (response.status === 401) {
        await signOut({ callbackUrl: "/login" });
        return;
      }

      if (!response.ok) {
        reportError("Failed to abort simulation");
        return;
      }

      const data: RunData = await response.json();
      setRunData(data);
    } catch (err) {
      reportError("Error aborting simulation:", err);
    }
  };

  const crumbs: Crumb[] = [
    { label: "Simulations", href: "/simulations" },
    {
      label: simulationName ?? "Simulation",
      href: `/simulations/${uuid}?tab=runs`,
    },
    { label: runData?.name ?? "Loading..." },
  ];

  // Breadcrumb trail plus the running indicator.
  const customHeader = (
    <div className="flex items-center gap-3 min-w-0">
      <Breadcrumbs items={crumbs} />
      {(runData?.status.toLowerCase() === "in_progress" ||
        runData?.status.toLowerCase() === "queued") && (
        <svg className="w-5 h-5 animate-spin flex-shrink-0" fill="none" viewBox="0 0 24 24">
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
      )}
    </div>
  );

  // Not found header - back goes to main simulations page
  const notFoundHeader = <div className="flex items-center gap-4"></div>;

  // Determine which header to show
  const getHeader = () => {
    if (errorCode) return notFoundHeader;
    return customHeader;
  };

  const isDone = runData?.status.toLowerCase() === "done";
  const showSimCheckboxes = isDone && eligibleSimKeys.length > 0;

  return (
    <AppLayout
      activeItem="simulations"
      onItemChange={(itemId) => router.push(`/${itemId}`)}
      sidebarOpen={sidebarOpen}
      onSidebarToggle={() => setSidebarOpen(!sidebarOpen)}
      customHeader={getHeader()}
    >
      <div className="space-y-4 md:space-y-6 py-4 md:py-6">
        {/* AppLayout hides `customHeader` below md. Skipped when the run is
            missing, matching the empty header the top bar shows. */}
        {!errorCode && <Breadcrumbs items={crumbs} className="md:hidden" />}
        {isLoading ? (
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
        ) : error ? (
          <div className="border border-border rounded-xl p-8 md:p-12 flex flex-col items-center justify-center bg-muted/20">
            <p className="text-sm md:text-base text-red-500 mb-2">{error}</p>
            <button
              onClick={() => window.location.reload()}
              className="text-sm md:text-base text-muted-foreground hover:text-foreground transition-colors cursor-pointer"
            >
              Retry
            </button>
          </div>
        ) : errorCode ? (
          <NotFoundState errorCode={errorCode} />
        ) : runData ? (
          <div className="space-y-4 md:space-y-6">
            {/* Status and Type Pills */}
            <div className="flex items-center gap-2">
              <span
                className={`inline-flex items-center px-2.5 py-1 rounded-md text-xs font-medium ${getStatusBadgeClass(
                  runData.status
                )}`}
              >
                {formatStatus(runData.status)}
              </span>
              <span
                className={`inline-flex items-center px-2.5 py-1 rounded-md text-xs font-medium ${getTypeBadgeClass(
                  runData.type
                )}`}
              >
                {runData.type}
              </span>
              {isDone && backendAccessToken && (
                <ShareButton
                  entityType="simulation-run"
                  entityId={runId}
                  accessToken={backendAccessToken}
                  initialIsPublic={runData.is_public ?? false}
                  initialShareToken={runData.share_token ?? null}
                />
              )}
              {/* Send the selected simulation transcripts to a
                  human-alignment (conversation) task for labelling. Tick rows
                  in the results table first. Desktop-only, matching
                  TestRunnerDialog. */}
              {showSimCheckboxes && (
                <SubmitForLabellingButton
                  count={conversationLabellingResults.length}
                  emptyMessage="Select one or more simulations to submit for labelling"
                  onOpen={() => setAddToTaskOpen(true)}
                  className="hidden md:inline-flex items-center gap-2 h-8 px-3 rounded-md text-xs font-medium border cursor-pointer transition-colors bg-rose-500/14 border-rose-500/45 text-rose-950 dark:text-rose-100 hover:bg-rose-500/26 dark:hover:bg-rose-500/20"
                />
              )}
              {(runData.status.toLowerCase() === "in_progress" ||
                runData.status.toLowerCase() === "queued") && (
                <StopRunButton onStop={abortSimulation} />
              )}
            </div>

            {/* Error Message - show when simulation has failed */}
            {runData.status.toLowerCase() === "failed" && (
              <div className="border border-red-500/30 rounded-xl p-4 bg-red-500/10">
                <div className="flex items-center gap-3">
                  <svg
                    className="w-5 h-5 text-red-500 flex-shrink-0"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                    strokeWidth={2}
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z"
                    />
                  </svg>
                  <span className="text-sm font-medium text-red-500">
                    Simulation Failed
                  </span>
                </div>
              </div>
            )}

            {/* Overall Metrics - only show when simulation is done */}
            {isDone && (
              <SimulationMetricsGrid
                metrics={runData.metrics}
                type={runData.type}
                evaluatorUuidByName={evaluatorUuidByName}
                evaluatorDescriptionByName={evaluatorDescriptionByName}
                simulations={runData.simulation_results}
              />
            )}

            {runData.simulation_results?.length > 0 && (
              <SimulationResultsTable
                simulations={runData.simulation_results}
                metricKeys={displayMetricKeys}
                metricInfo={runData.metrics ?? undefined}
                onSelectSimulation={openTranscriptDialog}
                labellingSelection={simLabellingSelected}
                onToggleLabellingSelection={
                  showSimCheckboxes ? toggleSimLabelling : undefined
                }
                onLabellingBulkToggle={bulkToggleSimLabelling}
                labellingKeyForRow={
                  showSimCheckboxes ? (_sim, index) => String(index) : undefined
                }
              />
            )}
          </div>
        ) : null}
      </div>

      {transcriptDialogOpen && selectedSimulation && runData && (
        <SimulationTranscriptDialog
          simulation={selectedSimulation}
          runType={runData.type}
          onClose={closeTranscriptDialog}
          onAudioError={refreshRunData}
        />
      )}

      <AddRunToLabellingTaskDialog
        isOpen={addToTaskOpen}
        onClose={() => setAddToTaskOpen(false)}
        source={{
          type: "simulation_run",
          runUuid: runId,
          runName: runData?.name,
          results: conversationLabellingResults,
          evaluators: conversationLabellingEvaluators,
        }}
      />
    </AppLayout>
  );
}
