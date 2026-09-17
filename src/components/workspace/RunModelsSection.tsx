"use client";

import { useState } from "react";
import { toast } from "sonner";
import { useAccessToken, useOrganizations } from "@/hooks";
import { parseBackendErrorMessage } from "@/lib/parseBackendError";
import type { Organization } from "@/lib/orgs";
import { RunModelsChoice } from "./RunModelsChoice";

/**
 * How a model comparison runs its models for every agent in this workspace.
 * Picking a choice saves it straight away; the rows stay disabled until the
 * save answers, and a save that fails puts them back to what was saved.
 *
 * It lives here rather than inside the workspace settings page so it can be
 * tested on its own: nothing under `src/app` is measured for coverage.
 */
export function RunModelsSection({ org }: { org: Organization }) {
  const accessToken = useAccessToken();
  const { updateOrganization } = useOrganizations(accessToken);
  // The choice on screen. It starts from the workspace and then leads: this
  // page and the sidebar hold separate copies of the workspace list, so the
  // one behind this section only catches up after it has been read again.
  // Reading straight off it would snap the rows back to the old choice for as
  // long as that takes, which reads as the save having failed.
  const [value, setValue] = useState(org.benchmark_parallel_models ?? true);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleChange = async (next: boolean) => {
    const before = value;
    setError(null);
    setIsSaving(true);
    setValue(next);
    try {
      await updateOrganization(org.uuid, { benchmark_parallel_models: next });
      toast.success("Saved how the models run in a comparison");
    } catch (err) {
      // Never leave the screen claiming a choice that did not save.
      setValue(before);
      setError(
        parseBackendErrorMessage(err, "Failed to save how the models run"),
      );
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <section className="space-y-3">
      <div>
        <h2 className="text-base md:text-lg font-semibold text-foreground">
          How to run the models in a comparison
        </h2>
        <p className="text-sm text-muted-foreground">
          Running the models at the same time is quicker, but it puts more load
          on your agent server. Choose one after another to keep that load down.
          This only applies to agents you connect. For agents built in
          Calibrate, Calibrate calls the models itself.
        </p>
      </div>
      <RunModelsChoice
        value={value}
        onChange={handleChange}
        disabled={isSaving}
      />
      {error && <p className="text-[13px] text-red-500">{error}</p>}
    </section>
  );
}
