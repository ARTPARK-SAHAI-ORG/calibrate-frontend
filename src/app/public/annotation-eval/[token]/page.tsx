"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import {
  PublicPageLayout,
  PublicNotFound,
  PublicLoading,
} from "@/components/PublicPageLayout";
import {
  EvaluatorRunDetailView,
  statusLabel,
  statusPillClass,
  type EvaluatorRunJob,
  type LabellingTaskFull,
} from "@/components/human-labelling/EvaluatorRunDetailView";

/**
 * Public payload shape from `GET /public/annotation-eval/{share_token}`.
 * Mirrors the authenticated detail view, plus enough task metadata to render
 * without a separate task fetch.
 */
type PublicEvalRunResponse = EvaluatorRunJob & {
  task: LabellingTaskFull;
};

export default function PublicEvaluatorRunPage() {
  const params = useParams();
  const token =
    typeof params?.token === "string"
      ? params.token
      : Array.isArray(params?.token)
        ? params.token[0]
        : "";

  const [job, setJob] = useState<EvaluatorRunJob | null>(null);
  const [task, setTask] = useState<LabellingTaskFull | null>(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    document.title = task?.name
      ? `${task.name} | Evaluation run | Calibrate`
      : "Evaluation run | Calibrate";
  }, [task?.name]);

  useEffect(() => {
    if (!token) return;
    let cancelled = false;
    (async () => {
      try {
        const backendUrl = process.env.NEXT_PUBLIC_BACKEND_URL;
        if (!backendUrl) throw new Error("Backend URL not configured");
        const res = await fetch(
          `${backendUrl}/public/annotation-eval/${encodeURIComponent(token)}`,
          { headers: { accept: "application/json" } },
        );
        if (cancelled) return;
        if (res.status === 404) {
          setNotFound(true);
          setLoading(false);
          return;
        }
        if (!res.ok) throw new Error(`Request failed (${res.status})`);
        const data: PublicEvalRunResponse = await res.json();
        if (cancelled) return;
        const { task: taskPayload, ...jobPayload } = data;
        setTask(taskPayload);
        setJob(jobPayload);
        setLoading(false);
      } catch (err) {
        if (cancelled) return;
        setError(err instanceof Error ? err.message : "Failed to load run");
        setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [token]);

  if (loading) {
    return (
      <PublicPageLayout title="Evaluation run">
        <PublicLoading />
      </PublicPageLayout>
    );
  }

  if (notFound) {
    return (
      <PublicPageLayout title="Evaluation run">
        <PublicNotFound message="This evaluation run is not available." />
      </PublicPageLayout>
    );
  }

  if (error || !job || !task) {
    return (
      <PublicPageLayout title="Evaluation run">
        <div className="rounded-md border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-500">
          {error ?? "Failed to load run"}
        </div>
      </PublicPageLayout>
    );
  }

  return (
    <PublicPageLayout
      title={task.name ?? "Evaluation run"}
      pills={
        <span
          className={`inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-medium border ${statusPillClass(
            job.status,
          )}`}
        >
          {statusLabel(job.status)}
        </span>
      }
      contentClassName="max-w-7xl"
    >
      <div className="flex flex-col gap-4" style={{ height: "calc(100dvh - 140px)" }}>
        <EvaluatorRunDetailView
          job={job}
          task={task}
          versionLabels={{}}
          linkEvaluators={false}
        />
      </div>
    </PublicPageLayout>
  );
}
