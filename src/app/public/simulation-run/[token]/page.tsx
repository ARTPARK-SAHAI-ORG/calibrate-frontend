"use client";

import React, { useState, useEffect } from "react";
import { useParams } from "next/navigation";
import { PublicPageLayout, PublicNotFound, PublicLoading } from "@/components/PublicPageLayout";
import {
  SimulationMetricsGrid,
  SimulationResultsTable,
  SimulationTranscriptDialog,
  LATENCY_KEYS,
} from "@/components/eval-details";
import type { MetricData, SimulationResult } from "@/components/eval-details";

type RunData = {
  task_id: string;
  name: string;
  status: string;
  type: "text" | "voice";
  updated_at: string;
  total_simulations: number;
  metrics: Record<string, MetricData | undefined> | null;
  simulation_results: SimulationResult[];
  // Top-level evaluator list (newer runs only). Public page intentionally
  // doesn't render links to /evaluators/{uuid} since that route is
  // authenticated — but the type is here so the field doesn't disappear
  // from `data` if we ever need it.
  evaluators?: Array<{
    evaluator_uuid: string;
    name: string;
    description?: string | null;
  }> | null;
  error: string | null;
};

export default function PublicSimulationRunPage() {
  const params = useParams();
  const token = params.token as string;

  const [data, setData] = useState<RunData | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [selectedSim, setSelectedSim] = useState<SimulationResult | null>(null);

  useEffect(() => {
    document.title = data?.name ? `Simulation | ${data.name} | Calibrate` : "Simulation Run | Calibrate";
  }, [data?.name]);

  useEffect(() => {
    const fetchData = async () => {
      try {
        const backendUrl = process.env.NEXT_PUBLIC_BACKEND_URL;
        if (!backendUrl) throw new Error("Backend URL not configured");

        const res = await fetch(`${backendUrl}/public/simulation-run/${token}`, {
          headers: { accept: "application/json" },
        });

        if (res.status === 404) { setNotFound(true); return; }
        if (!res.ok) throw new Error("Failed to load results");

        const result: RunData = await res.json();
        if (result.status.toLowerCase() !== "done") { setNotFound(true); return; }

        setData(result);
      } catch {
        setNotFound(true);
      } finally {
        setIsLoading(false);
      }
    };
    fetchData();
  }, [token]);

  if (isLoading) return <PublicPageLayout><PublicLoading /></PublicPageLayout>;
  if (notFound || !data) return <PublicPageLayout><PublicNotFound /></PublicPageLayout>;

  // Derive metric keys for table columns (exclude latency keys)
  let displayMetricKeys: string[] = [];
  if (data.metrics) {
    displayMetricKeys = Object.keys(data.metrics).filter((k) => !LATENCY_KEYS.includes(k));
  } else {
    const metricSet = new Set<string>();
    data.simulation_results.forEach((sim) => {
      sim.evaluation_results?.forEach((r) => {
        if (!LATENCY_KEYS.includes(r.name)) metricSet.add(r.name);
      });
    });
    displayMetricKeys = Array.from(metricSet);
  }

  const evaluatorDescriptionByName: Record<string, string> = {};
  data.evaluators?.forEach((e) => {
    if (e.name && e.description) evaluatorDescriptionByName[e.name] = e.description;
  });
  data.simulation_results.forEach((sim) => {
    sim.evaluation_results?.forEach((result) => {
      if (result.name && result.description && !(result.name in evaluatorDescriptionByName)) {
        evaluatorDescriptionByName[result.name] = result.description;
      }
      if (
        result.name === "stt_llm_judge_score" &&
        result.description &&
        !("stt_llm_judge" in evaluatorDescriptionByName)
      ) {
        evaluatorDescriptionByName.stt_llm_judge = result.description;
      }
    });
  });

  return (
    <PublicPageLayout
      title={`Simulation | ${data.name}`}
      pills={
        <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-medium ${data.type === "voice" ? "bg-orange-100 text-orange-700 dark:bg-orange-500/20 dark:text-orange-400" : "bg-purple-100 text-purple-700 dark:bg-purple-500/20 dark:text-purple-400"}`}>
          {data.type}
        </span>
      }
    >
      <div className="space-y-6 md:space-y-8">
        <SimulationMetricsGrid
          metrics={data.metrics}
          type={data.type}
          evaluatorDescriptionByName={evaluatorDescriptionByName}
        />

        {data.simulation_results.length > 0 && (
          <SimulationResultsTable
            simulations={data.simulation_results}
            metricKeys={displayMetricKeys}
            onSelectSimulation={setSelectedSim}
            metricInfo={data.metrics ?? undefined}
          />
        )}
      </div>

      {selectedSim && (
        <SimulationTranscriptDialog
          simulation={selectedSim}
          runType={data.type}
          onClose={() => setSelectedSim(null)}
        />
      )}
    </PublicPageLayout>
  );
}
