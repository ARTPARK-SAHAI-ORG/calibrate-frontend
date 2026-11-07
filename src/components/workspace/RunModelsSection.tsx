"use client";

import { useState } from "react";
import { toast } from "sonner";
import { useAccessToken, useOrganizations } from "@/hooks";
import { parseBackendErrorMessage } from "@/lib/parseBackendError";
import {
  workspaceRunModelsInParallel,
  workspaceShowsLikelyRanges,
  type Organization,
  type OrganizationSettings,
} from "@/lib/orgs";
import { Switch } from "@/components/ui";
import { RunModelsChoice } from "./RunModelsChoice";

/**
 * How a model comparison runs its models for every agent in this workspace,
 * and whether agent-test results show likely ranges. Each change saves
 * straight away; the controls stay disabled until the save answers, and a
 * save that fails puts them back to what was saved.
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
  const [showRanges, setShowRanges] = useState(workspaceShowsLikelyRanges(org));
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const save = async (
    setting: NonNullable<OrganizationSettings["model_benchmarking"]>,
    undo: () => void,
    saved: string,
    failed: string,
  ) => {
    setError(null);
    setIsSaving(true);
    try {
      await updateOrganization(org.uuid, {
        settings: { model_benchmarking: setting },
      });
      toast.success(saved);
    } catch (err) {
      // Never leave the screen claiming a choice that did not save.
      undo();
      setError(parseBackendErrorMessage(err, failed));
    } finally {
      setIsSaving(false);
    }
  };

  const handleChange = (next: boolean) => {
    const before = value;
    setValue(next);
    return save(
      { run_models_in_parallel: next },
      () => setValue(before),
      "Saved how the models run in a comparison",
      "Failed to save how the models run",
    );
  };

  const handleRangesChange = (next: boolean) => {
    setShowRanges(next);
    return save(
      { show_likely_ranges: next },
      () => setShowRanges(!next),
      next ? "Likely ranges are now shown" : "Likely ranges are now hidden",
      "Failed to save whether likely ranges are shown",
    );
  };

  return (
    <section className="space-y-3">
      <div>
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
      <div>
        <RunModelsChoice
          value={value}
          onChange={handleChange}
          disabled={isSaving}
          inline
        />
      </div>
      <div className="flex items-start gap-3">
        <Switch
          checked={showRanges}
          onChange={handleRangesChange}
          disabled={isSaving}
          label="Show likely ranges"
        />
        <div>
          <p className="text-sm font-medium text-foreground">
            Show likely ranges
          </p>
          <p className="text-sm text-muted-foreground">
            Show a likely range under each pass rate and score, on single test
            runs and comparisons. The real pass rate falls inside this range
            95% of the time.
          </p>
        </div>
      </div>
    </section>
  );
}
