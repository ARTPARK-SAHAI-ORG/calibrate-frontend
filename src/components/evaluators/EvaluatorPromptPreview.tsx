"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useAccessToken } from "@/hooks";
import {
  fetchEvaluatorDetail,
  canDeleteEvaluator,
  type EvaluatorDetail,
} from "@/lib/evaluatorApi";
// The one helper the evaluator page uses to find the version marked current,
// so this column can never show a different one.
import { liveVersionOf } from "@/lib/evaluatorVersions";
import { reportError } from "@/lib/reportError";
import { VersionCard } from "./VersionCard";

/**
 * How an evaluator judges, shown beside the picker so the reader can read the
 * prompt before adding it. The body is the evaluator page's own Prompts-tab
 * card, so the two screens cannot drift apart.
 *
 * The lists the pickers are given carry no prompt text, so this asks for the
 * evaluator itself the first time each one is opened and keeps what it got
 * while the dialog is open.
 */
export function EvaluatorPromptPreview({
  evaluatorUuid,
  onDelete,
}: {
  evaluatorUuid: string | null;
  /**
   * Permanently deletes the previewed evaluator. Omit to hide the button.
   * Hidden anyway on a locked evaluator, same rule as everywhere else.
   */
  onDelete?: (evaluatorUuid: string) => void;
}) {
  const accessToken = useAccessToken();
  const [detail, setDetail] = useState<EvaluatorDetail | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState(false);
  // What has already been fetched this time the dialog is open.
  const cacheRef = useRef<Map<string, EvaluatorDetail>>(new Map());

  const load = useCallback(async () => {
    if (!evaluatorUuid || !accessToken) return;
    const cached = cacheRef.current.get(evaluatorUuid);
    if (cached) {
      setDetail(cached);
      setError(false);
      return;
    }
    setIsLoading(true);
    setError(false);
    try {
      const fetched = await fetchEvaluatorDetail(evaluatorUuid, accessToken);
      cacheRef.current.set(evaluatorUuid, fetched);
      setDetail(fetched);
    } catch (err) {
      reportError("Error fetching evaluator detail:", err);
      setDetail(null);
      setError(true);
    } finally {
      setIsLoading(false);
    }
  }, [evaluatorUuid, accessToken]);

  useEffect(() => {
    if (!evaluatorUuid) {
      setDetail(null);
      setError(false);
      return;
    }
    void load();
  }, [evaluatorUuid, load]);

  if (!evaluatorUuid) {
    return (
      <Frame>
        <p className="text-sm text-muted-foreground">
          Select an evaluator to see its details
        </p>
      </Frame>
    );
  }

  if (isLoading) {
    return (
      <Frame>
        <svg
          className="w-5 h-5 animate-spin text-muted-foreground"
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
      </Frame>
    );
  }

  if (error || !detail) {
    return (
      <Frame>
        <p className="text-sm text-muted-foreground">
          Could not load this evaluator.{" "}
          <button
            type="button"
            onClick={() => void load()}
            className="text-foreground underline underline-offset-2 cursor-pointer"
          >
            Try again
          </button>
        </p>
      </Frame>
    );
  }

  const version = liveVersionOf(detail);

  return (
    <div className="h-full overflow-y-auto p-4 md:p-5">
      {onDelete && canDeleteEvaluator(detail) && (
        <div className="flex items-center justify-end mb-2">
          <button
            type="button"
            onClick={() => onDelete(detail.uuid)}
            title="Delete evaluator"
            className="w-7 h-7 flex items-center justify-center rounded-md text-muted-foreground hover:text-red-500 hover:bg-red-500/10 transition-colors cursor-pointer"
          >
            <svg
              className="w-4 h-4"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={1.5}
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 01-2.244 2.077H8.084a2.25 2.25 0 01-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 00-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 013.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 00-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 00-7.5 0"
              />
            </svg>
          </button>
        </div>
      )}
      {!version ? (
        <p className="text-sm text-muted-foreground">
          This evaluator has no version marked as current
        </p>
      ) : (
        // The evaluator page's own Prompts-tab card, in that card's read-only
        // shape: judge model, prompt, the values it asks for and the output.
        // The name, type and description are already on the row to the left,
        // so they are not repeated here.
        <VersionCard
          version={{
            uuid: version.uuid,
            version_number: version.version_number,
            judge_model: version.judge_model,
            system_prompt: version.system_prompt,
            output_config: version.output_config ?? null,
            variables: version.variables ?? null,
            created_at: "",
          }}
          outputType={detail.output_type ?? "binary"}
          isDefault
          isLive
          isSettingLive={false}
          onSetLive={() => {}}
          formatDateTime={(date) => date}
        />
      )}
    </div>
  );
}

/** Centred box used by the states that have nothing to lay out. */
function Frame({ children }: { children: React.ReactNode }) {
  return (
    <div className="h-full min-h-[8rem] flex items-center justify-center p-4 text-center">
      {children}
    </div>
  );
}
