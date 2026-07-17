"use client";

import { useCallback, useState } from "react";
import { BenchmarkResultsDialog } from "./BenchmarkResultsDialog";

/**
 * A "direct benchmark rerun": start a fresh benchmark of the same models and
 * test subset a completed run used, skipping the model picker. Carries the
 * agent identity so the same shape works whether the agent is fixed (agent
 * page) or per-run (global Tests page).
 */
export type BenchmarkRerunConfig = {
  agentUuid: string;
  agentName: string;
  models: string[];
  testUuids: string[];
  testNames: string[];
};

/**
 * Owns the direct-benchmark-rerun state. `key` bumps on every `start` so a
 * repeat rerun remounts the dialog and re-POSTs instead of no-op'ing on
 * unchanged props (a fresh BenchmarkResultsDialog only POSTs once per mount).
 */
export function useBenchmarkRerun() {
  const [config, setConfig] = useState<BenchmarkRerunConfig | null>(null);
  const [key, setKey] = useState(0);

  const start = useCallback((next: BenchmarkRerunConfig) => {
    setConfig(next);
    setKey((k) => k + 1);
  }, []);

  const clear = useCallback(() => setConfig(null), []);

  return { config, key, start, clear };
}

type BenchmarkRerunDialogProps = {
  config: BenchmarkRerunConfig | null;
  /** From `useBenchmarkRerun().key` — forces a remount per rerun. */
  rerunKey: number;
  onClose: () => void;
  /** The new benchmark's task id, plus the config it ran, for optimistic list updates. */
  onBenchmarkCreated: (taskId: string, config: BenchmarkRerunConfig) => void;
  /** Rerun again from the completed rerun (same shape as start). */
  onRerun: (config: BenchmarkRerunConfig) => void;
};

/**
 * Renders the keyed BenchmarkResultsDialog for a direct rerun. Renders nothing
 * when there's no active rerun. Shared by the agent Tests tab and the global
 * Tests page so the remount/wiring lives in one place.
 */
export function BenchmarkRerunDialog({
  config,
  rerunKey,
  onClose,
  onBenchmarkCreated,
  onRerun,
}: BenchmarkRerunDialogProps) {
  if (!config) return null;

  return (
    <BenchmarkResultsDialog
      key={rerunKey}
      isOpen
      onClose={onClose}
      agentUuid={config.agentUuid}
      agentName={config.agentName}
      testUuids={config.testUuids}
      testNames={config.testNames}
      models={config.models}
      onBenchmarkCreated={(taskId) => onBenchmarkCreated(taskId, config)}
      onRerun={(models, testUuids, testNames) =>
        onRerun({ ...config, models, testUuids, testNames })
      }
    />
  );
}
