"use client";

import { useState, useCallback } from "react";
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

  const dismiss = useCallback(() => {
    setVerifyError(null);
    setVerifySampleResponse(null);
  }, []);

  const handleResponse = async (response: Response): Promise<boolean> => {
    if (response.status === 401) {
      await signOut({ callbackUrl: "/login" });
      return false;
    }

    if (!response.ok) throw new Error("Verification request failed");

    const result = await response.json();
    const success: boolean = result.success ?? false;

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

        return await handleResponse(response);
      } catch (err) {
        console.error("Error verifying connection:", err);
        setVerifyError(
          err instanceof Error ? err.message : "Verification failed",
        );
        return false;
      } finally {
        setIsVerifying(false);
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

        return await handleResponse(response);
      } catch (err) {
        console.error("Error verifying connection:", err);
        setVerifyError(
          err instanceof Error ? err.message : "Verification failed",
        );
        return false;
      } finally {
        setIsVerifying(false);
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
