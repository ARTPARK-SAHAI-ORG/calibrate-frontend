"use client";

import { NotFoundState } from "@/components/ui";
import { HOME_PATH } from "@/lib/routes";

/**
 * Shown for an address that matches no page at all. Without this, Next's own
 * screen appears, which says "404" and nothing a reader can act on.
 */
export default function NotFound() {
  return (
    <div className="min-h-screen flex items-center justify-center">
      <NotFoundState onGoHome={() => window.location.assign(HOME_PATH)} />
    </div>
  );
}
