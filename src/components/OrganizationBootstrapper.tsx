"use client";

import { useEffect } from "react";
import { installOrgFetchInterceptor } from "@/lib/fetchInterceptor";

/**
 * Puts the workspace on requests made with the browser's own fetch rather than
 * through `src/lib/api.ts`. The workspace itself comes from the address (see
 * `src/lib/routes.ts`), so there is nothing to look up and nothing to wait for.
 */
export function OrganizationBootstrapper() {
  useEffect(() => {
    installOrgFetchInterceptor();
  }, []);

  return null;
}
