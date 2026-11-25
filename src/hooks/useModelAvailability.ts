"use client";

import type { ModelAvailability } from "@/lib/modelAvailability";
import { useOpenRouterModels } from "./useOpenRouterModels";
import { useUsesOwnProviderKeys } from "./useOrgLimits";

/** What OpenRouter says about every model, for this workspace. The server's
 *  privacy setting binds only calls made with the server's key, so the privacy
 *  list is dropped for a workspace on its own keys, and when `serverCalls` is
 *  false: a connection agent's own server calls the model it is sent. */
export function useModelAvailability(
  serverCalls = true,
): ModelAvailability | null {
  const { availability } = useOpenRouterModels();
  const usesOwnKeys = useUsesOwnProviderKeys();
  if (!availability || (serverCalls && !usesOwnKeys)) return availability;
  return { ...availability, privacyAllowed: null };
}
