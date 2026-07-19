"use client";
import { reportError } from "@/lib/reportError";

import { useState, useCallback, useRef } from "react";
import { signOut } from "next-auth/react";
import { useAccessToken } from "./useAccessToken";

export type VerifyMessage = { role: string; content: string };

export type VerifyConnectionResult = {
  isVerifying: boolean;
  verifyError: string | null;
  verifySampleResponse: Record<string, unknown> | null;
  /** Verify a saved agent's connection by UUID */
  verifySavedAgent: (agentUuid: string, messages?: VerifyMessage[]) => Promise<boolean>;
  /** Verify an ad-hoc connection (unsaved URL/headers) */
  verifyAdHoc: (
    agentUrl: string,
    agentHeaders?: Record<string, string>,
    messages?: VerifyMessage[],
  ) => Promise<boolean>;
  dismiss: () => void;
};

export function useVerifyConnection(): VerifyConnectionResult {
  const backendAccessToken = useAccessToken();
  const [isVerifying, setIsVerifying] = useState(false);
  const [verifyError, setVerifyError] = useState<string | null>(null);
  const [verifySampleResponse, setVerifySampleResponse] = useState<Record<
    string,
    unknown
  > | null>(null);

  // Identifies the attempt currently in flight. A check the user walked away
  // from must not land on a later one: without this, closing a slow check and
  // starting another showed the abandoned attempt's error, and for the run
  // picker that error could belong to a different agent entirely.
  const attemptRef = useRef(0);
  const isCurrent = (attempt: number) => attemptRef.current === attempt;

  const dismiss = useCallback(() => {
    // Abandons anything in flight as well as clearing what is on screen, so a
    // late result cannot repaint a fresh attempt.
    attemptRef.current += 1;
    setIsVerifying(false);
    setVerifyError(null);
    setVerifySampleResponse(null);
  }, []);

  const handleResponse = async (
    response: Response,
    attempt: number,
  ): Promise<boolean> => {
    if (response.status === 401) {
      await signOut({ callbackUrl: "/login" });
      return false;
    }

    if (!response.ok) throw new Error("Verification request failed");

    const result = await response.json();
    const success: boolean = result.success ?? false;

    // The user moved on while this was in flight, so drop it silently.
    if (!isCurrent(attempt)) return false;

    if (success) {
      setVerifyError(null);
      setVerifySampleResponse(null);
    } else {
      setVerifyError(result.error || "Connection verification failed");
      setVerifySampleResponse(result.sample_response ?? null);
    }

    return success;
  };

  const verifySavedAgent = useCallback(
    async (agentUuid: string, messages?: VerifyMessage[]): Promise<boolean> => {
      const attempt = ++attemptRef.current;
      setIsVerifying(true);
      setVerifyError(null);
      setVerifySampleResponse(null);

      try {
        const backendUrl = process.env.NEXT_PUBLIC_BACKEND_URL;
        if (!backendUrl) throw new Error("BACKEND_URL not set");

        const response = await fetch(
          `${backendUrl}/agents/${agentUuid}/verify-connection`,
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              accept: "application/json",
              Authorization: `Bearer ${backendAccessToken}`,
            },
            body: JSON.stringify(
              messages && messages.length > 0 ? { messages } : {},
            ),
          },
        );

        return await handleResponse(response, attempt);
      } catch (err) {
        reportError("Error verifying connection:", err);
        if (!isCurrent(attempt)) return false;
        setVerifyError(
          err instanceof Error ? err.message : "Verification failed",
        );
        return false;
      } finally {
        if (isCurrent(attempt)) setIsVerifying(false);
      }
    },
    [backendAccessToken],
  );

  const verifyAdHoc = useCallback(
    async (
      agentUrl: string,
      agentHeaders?: Record<string, string>,
      messages?: VerifyMessage[],
    ): Promise<boolean> => {
      const attempt = ++attemptRef.current;
      setIsVerifying(true);
      setVerifyError(null);
      setVerifySampleResponse(null);

      try {
        const backendUrl = process.env.NEXT_PUBLIC_BACKEND_URL;
        if (!backendUrl) throw new Error("BACKEND_URL not set");

        const response = await fetch(
          `${backendUrl}/agents/verify-connection`,
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              accept: "application/json",
              Authorization: `Bearer ${backendAccessToken}`,
            },
            body: JSON.stringify({
              agent_url: agentUrl.trim(),
              ...(agentHeaders &&
                Object.keys(agentHeaders).length > 0 && {
                  agent_headers: agentHeaders,
                }),
              ...(messages && messages.length > 0 && { messages }),
            }),
          },
        );

        return await handleResponse(response, attempt);
      } catch (err) {
        reportError("Error verifying connection:", err);
        if (!isCurrent(attempt)) return false;
        setVerifyError(
          err instanceof Error ? err.message : "Verification failed",
        );
        return false;
      } finally {
        if (isCurrent(attempt)) setIsVerifying(false);
      }
    },
    [backendAccessToken],
  );

  return {
    isVerifying,
    verifyError,
    verifySampleResponse,
    verifySavedAgent,
    verifyAdHoc,
    dismiss,
  };
}
