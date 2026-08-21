"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useAccessToken } from "@/hooks";
import {
  fetchEvaluatorDetail,
  liveVersionOf,
  type EvaluatorDetail,
  type EvaluatorVersionDetail,
} from "@/lib/evaluatorApi";
import { reportError } from "@/lib/reportError";
import { EvaluatorTypePill, OutputTypePill } from "@/components/EvaluatorPills";
import { getBinaryLabel } from "@/lib/binaryLabels";

/**
 * How an evaluator judges, shown beside the picker so the reader can read the
 * prompt before adding it. The lists the pickers are given carry no prompt
 * text, so this asks for the evaluator itself the first time each one is
 * opened and keeps what it got while the dialog is open.
 */
export function EvaluatorPromptPreview({
  evaluatorUuid,
}: {
  evaluatorUuid: string | null;
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
          Pick an evaluator to see how it judges.
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
    <div className="h-full overflow-y-auto p-3 space-y-3">
      <div>
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-sm font-medium text-foreground">
            {detail.name}
          </span>
          {detail.evaluator_type && (
            <EvaluatorTypePill evaluatorType={detail.evaluator_type} />
          )}
          {detail.output_type && (
            <OutputTypePill outputType={detail.output_type} />
          )}
        </div>
        {detail.description && (
          <p className="text-xs text-muted-foreground mt-1">
            {detail.description}
          </p>
        )}
      </div>

      {!version ? (
        <p className="text-sm text-muted-foreground">
          This evaluator has no saved prompt yet.
        </p>
      ) : (
        <VersionBody version={version} outputType={detail.output_type} />
      )}
    </div>
  );
}

function VersionBody({
  version,
  outputType,
}: {
  version: EvaluatorVersionDetail;
  outputType?: "binary" | "rating";
}) {
  const scale = version.output_config?.scale ?? [];
  const variables = version.variables ?? [];

  return (
    <>
      <Field label="Judge model">
        <span className="text-xs font-mono text-foreground break-all">
          {version.judge_model}
        </span>
      </Field>

      <Field label="Judge prompt">
        <pre className="text-xs text-foreground whitespace-pre-wrap break-words rounded-md border border-border bg-muted/30 p-2 max-h-72 overflow-y-auto">
          {version.system_prompt}
        </pre>
      </Field>

      {variables.length > 0 && (
        <Field label="Values it asks for">
          <ul className="space-y-1">
            {variables.map((v) => (
              <li key={v.name} className="text-xs text-muted-foreground">
                <span className="font-mono text-foreground">{v.name}</span>
                {v.description ? ` — ${v.description}` : ""}
              </li>
            ))}
          </ul>
        </Field>
      )}

      {scale.length > 0 && (
        <Field label="Scores it gives">
          <ul className="space-y-1">
            {scale.map((entry) => (
              <li key={String(entry.value)} className="text-xs">
                <span className="text-foreground font-medium">
                  {typeof entry.value === "boolean" && outputType === "binary"
                    ? getBinaryLabel(scale, entry.value)
                    : String(entry.value)}
                </span>
                <span className="text-muted-foreground">
                  {entry.name ? ` — ${entry.name}` : ""}
                </span>
              </li>
            ))}
          </ul>
        </Field>
      )}
    </>
  );
}

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <div className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground mb-1">
        {label}
      </div>
      {children}
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
