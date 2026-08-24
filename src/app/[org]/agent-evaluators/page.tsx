"use client";

import { useEffect } from "react";
import { useRouter } from "@/lib/nav";
import { AppLayout } from "@/components/AppLayout";
import { EvaluatorLibraryPanel } from "@/components/evaluations/EvaluatorLibraryPanel";
import { useSidebarState } from "@/lib/sidebar";

/**
 * The evaluators that can be added to an agent: the next-reply ones a
 * conversation agent uses (`llm`) and the output ones a general agent uses
 * (`llm-general`), shown the same way the other evaluator pages show theirs.
 */
export default function AgentEvaluatorsPage() {
  const router = useRouter();
  const [sidebarOpen, setSidebarOpen] = useSidebarState();

  useEffect(() => {
    document.title = "Agent evaluators | Calibrate";
  }, []);

  return (
    <AppLayout
      activeItem="agent-evaluators"
      onItemChange={(itemId) => router.push(`/${itemId}`)}
      sidebarOpen={sidebarOpen}
      onSidebarToggle={() => setSidebarOpen(!sidebarOpen)}
    >
      <div className="py-4 md:py-6">
        <EvaluatorLibraryPanel
          title="Evaluators"
          evaluatorTypes={["llm", "llm-general", "tool-call"]}
          description="LLM judges for evaluating an agent's responses"
        />
      </div>
    </AppLayout>
  );
}
