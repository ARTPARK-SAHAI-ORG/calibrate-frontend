"use client";

import { useState } from "react";
import { toast } from "sonner";
import { useAccessToken, useOrganizations } from "@/hooks";
import { parseBackendErrorMessage } from "@/lib/parseBackendError";
import { workspaceRunModelsInParallel, type Organization } from "@/lib/orgs";
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
  const [value, setValue] = useState(workspaceRunModelsInParallel(org) ?? true);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleChange = async (next: boolean) => {
    const before = value;
    setError(null);
    setIsSaving(true);
    setValue(next);
    try {
      await updateOrganization(org.uuid, {
        settings: { model_benchmarking: { run_models_in_parallel: next } },
      });
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
    <section className="flex flex-col gap-3 md:flex-row md:items-center md:gap-10">
      <div className="md:max-w-2xl">
        <h2 className="text-base md:text-lg font-semibold text-foreground">
          Benchmarking
        </h2>
        <p className="text-sm text-muted-foreground">
          Running models in parallel is quicker, but it will increase the load
          on your agent server. Choose to run them sequentially to prevent
          overloading it.
        </p>
        {error && <p className="text-[13px] text-red-500 mt-1">{error}</p>}
      </div>
      <div className="md:flex-shrink-0">
        <RunModelsChoice
          value={value}
          onChange={handleChange}
          disabled={isSaving}
          inline
        />
      </div>
    </section>
  );
}
