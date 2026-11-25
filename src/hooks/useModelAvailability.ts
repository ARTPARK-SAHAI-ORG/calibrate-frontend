"use client";

import type { ModelAvailability } from "@/lib/modelAvailability";
import { useOpenRouterModels } from "./useOpenRouterModels";
import { useUsesOwnProviderKeysIfKnown } from "./useOrgLimits";

/** What OpenRouter says about every model, for this workspace. The server's
 *  privacy setting binds only calls made with the server's key, so the privacy
 *  list is dropped for a workspace on its own keys, and when `serverCalls` is
 *  false: a connection agent's own server calls the model it is sent. */
export function useModelAvailability(
  serverCalls = true,
): ModelAvailability | null {
  const { availability } = useOpenRouterModels();
  // Only once the workspace is known to be on the server's keys: until then
  // the privacy list could block models it is free to use.
  const usesOwnKeys = useUsesOwnProviderKeysIfKnown();
  if (!availability || (serverCalls && usesOwnKeys === false)) {
    return availability;
  }
  return { ...availability, privacyAllowed: null };
}
