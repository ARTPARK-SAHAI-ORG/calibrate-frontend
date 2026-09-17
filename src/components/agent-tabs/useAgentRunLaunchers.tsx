"use client";

import { toast } from "sonner";
import React, { useRef, useState } from "react";
import { useAccessToken } from "@/hooks";
import { overEvalLimit } from "@/lib/evalLimit";
import { startTestRunOrNotify } from "@/lib/testRunApi";
import { ConfirmDialog } from "@/components/ui";
import { BenchmarkDialog } from "@/components/BenchmarkDialog";
import { VerifyConnectionDialog } from "@/components/VerifyConnectionDialog";
import { EnableBenchmarkDialog } from "@/components/agent-tabs/EnableBenchmarkDialog";

export type LaunchableTest = { uuid: string; name: string };


/**
 * The two ways a tab starts work on an agent's tests: a plain run and a model
 * comparison. Shared by the Tests tab and the Evaluations tab so both gate the
 * same way (connection check, size limit, turning benchmarking on) and mount
 * the same three dialogs.
 */
export type AgentRunLauncherOptions = {
  agentUuid: string;
  agentName: string;
  agentNature?: "conversation" | "general";
  agentType?: "agent" | "connection";
  connectionVerified?: boolean;
  supportsBenchmark?: boolean;
  benchmarkModelsVerified?: Record<
    string,
    { verified: boolean; verified_at: string; error: string | null }
  >;
  benchmarkProvider?: string;
  onConnectionVerified?: () => void;
  onGoToConnectionSettings?: () => void;
  onEnableBenchmark?: (provider: string) => void | Promise<void>;
  /** How many tests "every linked test" is; only the Tests tab knows it. */
  linkedTestsTotal?: number;
  /** A plain run was created. The caller points its run window at it. */
  onRunCreated: (taskId: string) => void;
  /** A model comparison was created (the picker opened its own results window). */
  onComparisonCreated?: () => void;
  /** The picker (or the comparison window it opened) was closed. `started`
   *  says whether a comparison was actually created. */
  onComparisonClosed?: (started: boolean) => void;
};

/** The agent settings the hook needs; what a tab takes from the agent page. */
export type AgentRunLauncherSettings = Omit<
  AgentRunLauncherOptions,
  "onRunCreated" | "onComparisonCreated" | "onComparisonClosed" | "linkedTestsTotal"
>;

type RunIntent = { tests: LaunchableTest[]; allLinked: boolean; runKey: string };

export function useAgentRunLaunchers({
  agentUuid,
  agentName,
  agentNature,
  agentType,
  connectionVerified,
  supportsBenchmark,
  benchmarkModelsVerified,
  benchmarkProvider,
  onConnectionVerified,
  onGoToConnectionSettings,
  onEnableBenchmark,
  linkedTestsTotal,
  onRunCreated,
  onComparisonCreated,
  onComparisonClosed,
}: AgentRunLauncherOptions) {
  const accessToken = useAccessToken();

  const isConnectionUnverified =
    agentType === "connection" && connectionVerified === false;
  const isBenchmarkDisabled =
    agentType === "connection" && supportsBenchmark !== true;
  // Benchmarking is off, but it can be turned on from here: Compare models
  // stays clickable and asks for the provider first instead of sending the
  // reader to the Connection tab.
  const canEnableBenchmarkHere = isBenchmarkDisabled && !!onEnableBenchmark;

  // Key of the run control whose "create run" call is in flight. Non-null
  // disables every run control.
  const [startingRun, setStartingRun] = useState<string | null>(null);
  // Set when a Run was clicked on an unverified connection agent: holds the
  // run the user asked for so it can start once the verify dialog passes.
  const [pendingRun, setPendingRun] = useState<RunIntent | null>(null);

  // The tests the model picker compares on. Empty means every test linked to
  // the agent: the backend runs them all when it is sent no test ids.
  const [benchmarkTests, setBenchmarkTests] = useState<LaunchableTest[]>([]);
  const [benchmarkDialogOpen, setBenchmarkDialogOpen] = useState(false);
  const [enableBenchmarkOpen, setEnableBenchmarkOpen] = useState(false);
  // Whether the open comparison window actually started a run, so closing it
  // can be told apart from cancelling the picker.
  const startedComparisonRef = useRef(false);

  // A run waiting on the reader's confirmation.
  const [runToConfirm, setRunToConfirm] = useState<RunIntent | null>(null);

  const countOf = (tests: LaunchableTest[], allLinked: boolean) =>
    allLinked ? (linkedTestsTotal ?? 0) : tests.length;

  const startRunNow = async (
    tests: LaunchableTest[],
    allLinked: boolean,
    runKey: string,
  ): Promise<string | null> => {
    const backendUrl = process.env.NEXT_PUBLIC_BACKEND_URL;
    if (!backendUrl) return null;
    // Creating a run is a real, billed call. Ignore repeat clicks until the
    // in-flight one settles.
    if (startingRun !== null) return null;
    setStartingRun(runKey);
    try {
      const taskId = await startTestRunOrNotify(
        backendUrl,
        accessToken,
        agentUuid,
        allLinked ? null : tests.map((t) => t.uuid),
        countOf(tests, allLinked),
      );
      if (!taskId) return null;
      onRunCreated(taskId);
      return taskId;
    } finally {
      setStartingRun(null);
    }
  };

  // Ask before starting: the size check first, so nobody confirms a run that
  // cannot start, then the confirmation, then launchTestRun.
  const confirmTestRun = async (
    tests: LaunchableTest[],
    allLinked = false,
    runKey = "all",
  ): Promise<void> => {
    if (await overEvalLimit(accessToken, countOf(tests, allLinked), "tests")) {
      return;
    }
    setRunToConfirm({ tests, allLinked, runKey });
  };

  // The one gate every Run action funnels through. On an unverified connection
  // agent it holds the intent and opens the verify dialog instead of running.
  const launchTestRun = async (
    tests: LaunchableTest[],
    allLinked = false,
    runKey = "all",
  ): Promise<string | null> => {
    if (isConnectionUnverified) {
      setPendingRun({ tests, allLinked, runKey });
      return null;
    }
    return startRunNow(tests, allLinked, runKey);
  };

  // Comparing against even one model already runs every chosen test once, so
  // the test count alone can rule a run out before the model picker opens.
  // Resolves true once the picker (or the question before it) is open, and
  // false when the size limit refused the comparison.
  const openCompare = async (
    tests: LaunchableTest[],
    allLinked: boolean,
  ): Promise<boolean> => {
    // The Tests tab greys its Compare button out for these two; a results
    // window has no room for that, so the same rule lives here for every way in.
    if (isConnectionUnverified) {
      toast.error("Verify the agent connection before comparing models.");
      return false;
    }
    if (isBenchmarkDisabled && !canEnableBenchmarkHere) {
      toast.error("Turn benchmarking on in the Connection tab first.");
      return false;
    }
    if (await overEvalLimit(accessToken, countOf(tests, allLinked), "tests")) {
      return false;
    }
    setBenchmarkTests(allLinked ? [] : tests);
    if (canEnableBenchmarkHere) {
      setEnableBenchmarkOpen(true);
    } else {
      setBenchmarkDialogOpen(true);
    }
    return true;
  };

  const runToConfirmCount = runToConfirm ? countOf(runToConfirm.tests, runToConfirm.allLinked) : 0;
  // The overlays here are fixed to the viewport. The tabs that mount them lay
  // their children out with flex gap, never space-y: a margin would shrink a
  // fixed overlay and show the page under it.
  const dialogs = (
    <>
      <ConfirmDialog
        isOpen={runToConfirm !== null}
        onClose={() => setRunToConfirm(null)}
        onConfirm={() => {
          const r = runToConfirm;
          setRunToConfirm(null);
          if (r) void launchTestRun(r.tests, r.allLinked, r.runKey);
        }}
        title={
          runToConfirm?.allLinked
            ? "Run every test on this agent"
            : "Run the selected tests"
        }
        message={`${
          isConnectionUnverified
            ? "Your agent's connection is checked first. Once it works, this"
            : "This"
        } will start the evaluation on ${runToConfirmCount} ${
          runToConfirmCount === 1 ? "test" : "tests"
        }. Each test calls your agent, evaluates its response against the evaluation criteria and reports the metrics.`}
        confirmText="Start the run"
      />
      {/* Shown when a Run is clicked on an unverified connection agent. On a
          passing check it flips the parent's verified state and starts the
          held run; otherwise it offers a jump to the Connection settings. */}
      {pendingRun && (
        <VerifyConnectionDialog
          isOpen
          agentUuid={agentUuid}
          onClose={() => setPendingRun(null)}
          onVerified={() => {
            const p = pendingRun;
            setPendingRun(null);
            onConnectionVerified?.();
            void startRunNow(p.tests, p.allLinked, p.runKey);
          }}
          onGoToConnectionSettings={() => {
            setPendingRun(null);
            onGoToConnectionSettings?.();
          }}
        />
      )}

      {/* Provider question, shown when Compare models is used on an agent that
          has benchmarking turned off. Saving it opens the benchmark dialog. */}
      <EnableBenchmarkDialog
        isOpen={enableBenchmarkOpen}
        onClose={() => {
          setEnableBenchmarkOpen(false);
          setBenchmarkTests([]);
        }}
        currentProvider={benchmarkProvider}
        onConfirm={async (provider) => {
          await onEnableBenchmark?.(provider);
          setEnableBenchmarkOpen(false);
          setBenchmarkDialogOpen(true);
        }}
      />

      {/* Rendered only while open, so every open starts from scratch: the
          models picked and the checks that failed last time belong to that
          window, not to the next one. */}
      {benchmarkDialogOpen && (
        <BenchmarkDialog
          isOpen
          onClose={() => {
            setBenchmarkDialogOpen(false);
            setBenchmarkTests([]);
            const started = startedComparisonRef.current;
            startedComparisonRef.current = false;
            onComparisonClosed?.(started);
          }}
          agentUuid={agentUuid}
          agentName={agentName}
          agentNature={agentNature}
          // The picker reads only uuid and name off each test.
          tests={benchmarkTests}
          totalTests={linkedTestsTotal}
          onBenchmarkCreated={(taskId) => {
            startedComparisonRef.current = true;
            onComparisonCreated?.();
          }}
          agentType={agentType}
          benchmarkModelsVerified={benchmarkModelsVerified}
          benchmarkProvider={benchmarkProvider}
        />
      )}
    </>
  );

  return {
    isConnectionUnverified,
    // Greyed out only when nothing here can turn benchmarking on.
    isBenchmarkDisabled: isBenchmarkDisabled && !canEnableBenchmarkHere,
    startingRun,
    launchTestRun,
    confirmTestRun,
    openCompare,
    dialogs,
  };
}
