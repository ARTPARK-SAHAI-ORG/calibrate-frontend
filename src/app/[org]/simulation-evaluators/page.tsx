"use client";

import { useEffect } from "react";
import { useRouter } from "@/lib/nav";
import { AppLayout } from "@/components/AppLayout";
import { EvaluatorLibraryPanel } from "@/components/evaluations/EvaluatorLibraryPanel";
import { useSidebarState } from "@/lib/sidebar";

/**
 * The conversation evaluators, shown the same way the Speech-to-Text and
 * Text-to-Speech pages show theirs and the same way they appear when setting
 * up a simulation, so they can be looked at, created and deleted without
 * starting one.
 */
export default function SimulationEvaluatorsPage() {
  const router = useRouter();
  const [sidebarOpen, setSidebarOpen] = useSidebarState();

  useEffect(() => {
    document.title = "Simulation evaluators | Calibrate";
  }, []);

  return (
    <AppLayout
      activeItem="simulation-evaluators"
      onItemChange={(itemId) => router.push(`/${itemId}`)}
      sidebarOpen={sidebarOpen}
      onSidebarToggle={() => setSidebarOpen(!sidebarOpen)}
    >
      <div className="space-y-4 md:space-y-6 py-4 md:py-6">
        <h1 className="text-xl md:text-2xl font-semibold">Evaluators</h1>
        <EvaluatorLibraryPanel
          evaluatorType="conversation"
          description="These evaluators evaluate the agent's performance in each simulated conversation"
        />
      </div>
    </AppLayout>
  );
}
