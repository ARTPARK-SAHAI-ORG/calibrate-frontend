"use client";

import { useEffect } from "react";
import { useRouter } from "@/lib/nav";
import { HOME_PATH } from "@/lib/routes";
import { LoadingState } from "@/components/ui/LoadingState";

/** A link to a workspace on its own opens its agents page. */
export default function WorkspaceHomePage() {
  const router = useRouter();

  useEffect(() => {
    router.replace(HOME_PATH);
  }, [router]);

  return (
    <div className="min-h-screen flex items-center justify-center">
      <LoadingState />
    </div>
  );
}
