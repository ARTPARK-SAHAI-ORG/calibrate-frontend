"use client";

import { useEffect, useMemo, useState } from "react";
import { useHideFloatingButton } from "@/components/AppLayout";
import { SingleSelectPicker } from "@/components/SingleSelectPicker";
import { apiClient } from "@/lib/api";

type LinkedEvaluator = { uuid: string; name: string };

type EvaluatorVersion = {
  uuid: string;
  version_number: number;
};

type EvaluatorDetail = {
  uuid: string;
  live_version_id: string | null;
  live_version: EvaluatorVersion | null;
  versions?: EvaluatorVersion[];
};

export type RunEvaluatorsSelection = {
  evaluator_id: string;
  evaluator_version_id: string;
};

function parseApiError(err: unknown, fallback: string): string {
  if (!(err instanceof Error)) return fallback;
  const match = err.message.match(/Request failed: \d+ - (.+)$/);
  if (match) {
    try {
      const parsed = JSON.parse(match[1]);
      if (parsed && typeof parsed.detail === "string") return parsed.detail;
    } catch {
      // not JSON
    }
    return match[1];
  }
  return err.message || fallback;
}

type EvaluatorVersionInfo = {
  versions: EvaluatorVersion[];
  liveVersionId: string | null;
};

type RunEvaluatorsDialogProps = {
  isOpen: boolean;
  accessToken: string;
  evaluators: LinkedEvaluator[];
  submitting: boolean;
  submitError: string | null;
  onClose: () => void;
  onConfirm: (selections: RunEvaluatorsSelection[]) => void | Promise<void>;
};

function VersionLabel({
  version,
  liveVersionId,
}: {
  version: EvaluatorVersion;
  liveVersionId: string | null;
}) {
  const isLive = version.uuid === liveVersionId;
  return (
    <span className="inline-flex items-center gap-1.5 min-w-0">
      <span className="truncate">v{version.version_number}</span>
      {isLive && (
        <span className="inline-flex items-center text-[10px] font-semibold px-1.5 py-0.5 rounded bg-green-500/10 text-green-600 dark:text-green-400 leading-none flex-shrink-0">
          Live
        </span>
      )}
    </span>
  );
}

export function RunEvaluatorsDialog({
  isOpen,
  accessToken,
  evaluators,
  submitting,
  submitError,
  onClose,
  onConfirm,
}: RunEvaluatorsDialogProps) {
  useHideFloatingButton(isOpen);

  // evaluator_uuid -> versions + live id
  const [info, setInfo] = useState<Record<string, EvaluatorVersionInfo>>({});
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);

  // evaluator_uuid -> picked (default true)
  const [picked, setPicked] = useState<Record<string, boolean>>({});
  // evaluator_uuid -> chosen version uuid (defaults to live)
  const [chosenVersion, setChosenVersion] = useState<Record<string, string>>(
    {},
  );

  useEffect(() => {
    if (!isOpen) return;
    setLoadError(null);
    setPicked(Object.fromEntries(evaluators.map((e) => [e.uuid, true])));
    setChosenVersion({});
    let cancelled = false;
    const run = async () => {
      if (evaluators.length === 0) return;
      setLoading(true);
      try {
        const results = await Promise.all(
          evaluators.map(async (e) => {
            const data = await apiClient<EvaluatorDetail>(
              `/evaluators/${e.uuid}`,
              accessToken,
            );
            const all =
              data.versions && data.versions.length > 0
                ? [...data.versions]
                : data.live_version
                  ? [data.live_version]
                  : [];
            all.sort((a, b) => b.version_number - a.version_number);
            const liveVersionId =
              data.live_version_id ?? data.live_version?.uuid ?? null;
            return [e.uuid, { versions: all, liveVersionId }] as const;
          }),
        );
        if (cancelled) return;
        const next: Record<string, EvaluatorVersionInfo> = {};
        const initialChosen: Record<string, string> = {};
        for (const [evUuid, val] of results) {
          next[evUuid] = val;
          const fallback = val.liveVersionId ?? val.versions[0]?.uuid ?? null;
          if (fallback) initialChosen[evUuid] = fallback;
        }
        setInfo(next);
        setChosenVersion(initialChosen);
      } catch (err) {
        if (!cancelled)
          setLoadError(parseApiError(err, "Failed to load evaluator versions"));
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    run();
    return () => {
      cancelled = true;
    };
  }, [isOpen, accessToken, evaluators]);

  const pickedCount = useMemo(
    () => Object.values(picked).filter(Boolean).length,
    [picked],
  );

  if (!isOpen) return null;

  const togglePicked = (id: string) => {
    setPicked((prev) => ({ ...prev, [id]: !prev[id] }));
  };

  const handleConfirm = async () => {
    if (pickedCount === 0 || submitting) return;
    const selections: RunEvaluatorsSelection[] = [];
    for (const e of evaluators) {
      if (!picked[e.uuid]) continue;
      const versionId = chosenVersion[e.uuid];
      if (!versionId) continue;
      selections.push({
        evaluator_id: e.uuid,
        evaluator_version_id: versionId,
      });
    }
    if (selections.length === 0) return;
    await onConfirm(selections);
  };

  const subtitle =
    "Decide which evaluators to run and which versions to use for each";

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4"
      onClick={() => {
        if (!submitting) onClose();
      }}
    >
      <div
        className="bg-background border border-border rounded-xl shadow-2xl w-full max-w-lg flex flex-col max-h-[90vh]"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="px-6 py-4 border-b border-border flex items-center justify-between">
          <div>
            <h2 className="text-lg font-semibold">Run evaluators</h2>
            <p className="text-xs text-muted-foreground mt-1">{subtitle}</p>
          </div>
          <button
            onClick={onClose}
            disabled={submitting}
            aria-label="Close"
            className="w-8 h-8 flex items-center justify-center rounded-md hover:bg-muted transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <svg
              className="w-5 h-5"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={2}
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M6 18L18 6M6 6l12 12"
              />
            </svg>
          </button>
        </div>
        <div className="p-4 md:p-6 space-y-2 overflow-y-auto">
          {loading ? (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <svg
                className="w-4 h-4 animate-spin"
                fill="none"
                viewBox="0 0 24 24"
              >
                <circle
                  className="opacity-25"
                  cx="12"
                  cy="12"
                  r="10"
                  stroke="currentColor"
                  strokeWidth="4"
                />
                <path
                  className="opacity-75"
                  fill="currentColor"
                  d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                />
              </svg>
              Loading evaluator versions
            </div>
          ) : loadError ? (
            <p className="text-sm text-red-500">{loadError}</p>
          ) : evaluators.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No evaluators are linked to this task.
            </p>
          ) : (
            evaluators.map((ev) => {
              const evInfo = info[ev.uuid];
              const versions = evInfo?.versions ?? [];
              const liveVersionId = evInfo?.liveVersionId ?? null;
              const isPicked = !!picked[ev.uuid];
              const value =
                chosenVersion[ev.uuid] ??
                liveVersionId ??
                versions[0]?.uuid ??
                "";
              return (
                <div
                  key={ev.uuid}
                  role="button"
                  tabIndex={0}
                  onClick={() => togglePicked(ev.uuid)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") {
                      e.preventDefault();
                      togglePicked(ev.uuid);
                    }
                  }}
                  className={`flex items-center gap-3 px-3 py-2 rounded-md border transition-colors cursor-pointer hover:bg-muted/30 ${
                    isPicked
                      ? "border-border bg-background"
                      : "border-border bg-muted/20 opacity-60"
                  }`}
                >
                  <input
                    type="checkbox"
                    checked={isPicked}
                    onChange={() => togglePicked(ev.uuid)}
                    onClick={(e) => e.stopPropagation()}
                    aria-label={`Pick ${ev.name}`}
                    className="w-4 h-4 cursor-pointer accent-foreground"
                  />
                  <div className="flex-1 min-w-0">
                    <div
                      className="text-sm font-medium truncate"
                      title={ev.name}
                    >
                      {ev.name}
                    </div>
                  </div>
                  {versions.length === 0 ? (
                    <span className="text-xs text-muted-foreground">
                      No versions
                    </span>
                  ) : (
                    <div onClick={(e) => e.stopPropagation()}>
                    <SingleSelectPicker<EvaluatorVersion>
                      items={versions}
                      selectedId={value}
                      onSelect={(v) =>
                        setChosenVersion((prev) => ({
                          ...prev,
                          [ev.uuid]: v.uuid,
                        }))
                      }
                      getId={(v) => v.uuid}
                      disabled={!isPicked}
                      ariaLabel={`Version for ${ev.name}`}
                      placeholder="Select version"
                      className="w-36 shrink-0"
                      compact
                      renderTrigger={(v) =>
                        v ? (
                          <VersionLabel
                            version={v}
                            liveVersionId={liveVersionId}
                          />
                        ) : (
                          ""
                        )
                      }
                      renderOption={(v, isSel) => (
                        <>
                          <VersionLabel
                            version={v}
                            liveVersionId={liveVersionId}
                          />
                          {isSel && (
                            <svg
                              className="w-4 h-4 text-foreground flex-shrink-0"
                              fill="none"
                              viewBox="0 0 24 24"
                              stroke="currentColor"
                              strokeWidth={2}
                            >
                              <path
                                strokeLinecap="round"
                                strokeLinejoin="round"
                                d="M4.5 12.75l6 6 9-13.5"
                              />
                            </svg>
                          )}
                        </>
                      )}
                    />
                    </div>
                  )}
                </div>
              );
            })
          )}
          {submitError && <p className="text-sm text-red-500">{submitError}</p>}
        </div>
        <div className="px-6 py-4 border-t border-border flex items-center justify-end gap-3">
          <button
            onClick={onClose}
            disabled={submitting}
            className="h-10 px-4 rounded-md text-sm font-medium border border-border bg-background hover:bg-muted/50 transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
          >
            Cancel
          </button>
          <button
            onClick={handleConfirm}
            disabled={pickedCount === 0 || submitting || loading}
            className="h-10 px-4 rounded-md text-sm font-medium bg-foreground text-background hover:opacity-90 transition-opacity cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {submitting ? "Starting..." : "Run"}
          </button>
        </div>
      </div>
    </div>
  );
}
