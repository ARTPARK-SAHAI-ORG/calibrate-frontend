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
 * Starts an agent test run from wherever the user clicked.
 *
 * Both run surfaces (the agent Tests tab and the LLM Tests page) need the same
 * three things around that call: ignore repeat clicks while the request is in
 * flight, bail quietly when the session expired, and surface a failure as a
 * toast without disturbing the page. Having each surface write that itself is
 * how they drifted apart before, so it lives here once.
 *
 * Resolves true only when the run exists. Callers open the runner on click, so
 * they use the false case to close it again.
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
    }: StartTestRunArgs): Promise<boolean> => {
      if (isStartingRef.current) return false;
      isStartingRef.current = true;

      try {
        const taskId = await startAgentTestRun({
          agentUuid,
          testUuids: tests.map((t) => t.uuid),
          runAllLinked,
          accessToken: backendAccessToken,
        });
        // null means the session expired and the user is being signed out.
        if (!taskId) return false;
        onStarted(taskId);
        return true;
      } catch (err) {
        // A failed start is not a page-level failure: keep the page as it is
        // and just tell the user.
        reportError("Error starting test run:", err);
        toast.error(
          err instanceof Error ? err.message : "Failed to start test run",
        );
        return false;
      } finally {
        isStartingRef.current = false;
      }
    },
    [backendAccessToken],
  );
}
