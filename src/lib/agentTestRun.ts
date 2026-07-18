import { signOut } from "next-auth/react";
import { getDefaultHeaders } from "@/lib/api";

/**
 * Starts an agent test run and returns the new run's uuid.
 *
 * This lives outside TestRunnerDialog on purpose. Starting a run is something
 * the user asked for by clicking a button, so it belongs at the click, not in
 * a dialog that has to infer it from changing props. The dialog is handed the
 * returned uuid and only displays that run.
 *
 * Pass `runAllLinked` to run every test linked to the agent (the backend picks
 * them); otherwise the given `testUuids` are sent.
 *
 * Returns null when the session expired (the caller is being signed out).
 * Throws on any other failure so the caller can surface it.
 */
export async function startAgentTestRun({
  agentUuid,
  testUuids,
  runAllLinked = false,
  accessToken,
}: {
  agentUuid: string;
  testUuids: string[];
  runAllLinked?: boolean;
  accessToken: string | null;
}): Promise<string | null> {
  const backendUrl = process.env.NEXT_PUBLIC_BACKEND_URL;
  if (!backendUrl) {
    throw new Error("BACKEND_URL environment variable is not set");
  }

  const response = await fetch(
    `${backendUrl}/agent-tests/agent/${agentUuid}/run`,
    {
      method: "POST",
      headers: {
        ...getDefaultHeaders(accessToken),
        "Content-Type": "application/json",
      },
      body: JSON.stringify(runAllLinked ? {} : { test_uuids: testUuids }),
    },
  );

  if (response.status === 401) {
    await signOut({ callbackUrl: "/login" });
    return null;
  }

  if (!response.ok) {
    throw new Error("Failed to start test run");
  }

  const result = await response.json();
  return result.task_id as string;
}
