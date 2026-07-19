"use client";

import { useCallback, useRef } from "react";
import { toast } from "sonner";
import { reportError } from "@/lib/reportError";
import { startAgentTestRun } from "@/lib/agentTestRun";
import { useAccessToken } from "./useAccessToken";

type StartTestRunArgs = {
  agentUuid: string;
  /** The tests to run. Only the uuids are sent. */
  tests: { uuid: string }[];
  /** Run every test linked to the agent instead of the ones listed. */
  runAllLinked?: boolean;
  /**
   * Called once the run exists, with its uuid. Do the per-surface work here:
   * hand the uuid to the runner, add the optimistic row, clear a selection.
   * Not called if the run never started.
   */
  onStarted: (taskId: string) => void;
};

/**
 * What happened, so callers do not have to re-derive it:
 * - "started": the run exists and `onStarted` ran.
 * - "busy": a start was already in flight, this click was ignored. The caller
 *   must leave its runner alone, the earlier click owns it.
 * - "failed": no run. Includes an expired session. The toast is already shown.
 */
export type StartTestRunResult = "started" | "busy" | "failed";

/**
 * Starts an agent test run from wherever the user clicked.
 *
 * Both run surfaces (the agent Tests tab and the LLM Tests page) need the same
 * three things around that call: ignore repeat clicks while the request is in
 * flight, bail quietly when the session expired, and surface a failure as a
 * toast without disturbing the page. Having each surface write that itself is
 * how they drifted apart before, so it lives here once.
 *
 * Callers open the runner on click, so the result tells them what to do with
 * it: keep it for "started", close it for "failed", and leave it alone for
 * "busy" because an earlier click owns it.
 */
export function useStartTestRun() {
  const backendAccessToken = useAccessToken();
  // A ref, not state: it only needs to gate the next click synchronously, and
  // flipping it must not re-render the caller.
  const isStartingRef = useRef(false);

  return useCallback(
    async ({
      agentUuid,
      tests,
      runAllLinked,
      onStarted,
    }: StartTestRunArgs): Promise<StartTestRunResult> => {
      if (isStartingRef.current) return "busy";
      isStartingRef.current = true;

      try {
        const taskId = await startAgentTestRun({
          agentUuid,
          testUuids: tests.map((t) => t.uuid),
          runAllLinked,
          accessToken: backendAccessToken,
        });
        // null means the session expired and the user is being signed out.
        if (!taskId) return "failed";
        onStarted(taskId);
        return "started";
      } catch (err) {
        // A failed start is not a page-level failure: keep the page as it is
        // and just tell the user.
        reportError("Error starting test run:", err);
        toast.error(
          err instanceof Error ? err.message : "Failed to start test run",
        );
        return "failed";
      } finally {
        isStartingRef.current = false;
      }
    },
    [backendAccessToken],
  );
}
