"use client";

import { useCallback, useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { PublicPageLayout } from "@/components/PublicPageLayout";
import {
  AnnotationJobView,
  jobStatusLabel,
  jobStatusPillClass,
  type AnnotationJobMeta,
} from "@/components/human-labelling/AnnotationJobView";

export default function PublicAnnotationJobViewerPage() {
  const params = useParams();
  const [meta, setMeta] = useState<AnnotationJobMeta | null>(null);
  // Stable callback — `AnnotationJobView` lists onLoaded in its fetch
  // effect deps, so an inline arrow would trip a refetch on every state
  // update and loop forever.
  const handleLoaded = useCallback(
    (m: AnnotationJobMeta) => setMeta(m),
    [],
  );

  const token =
    typeof params?.token === "string"
      ? params.token
      : Array.isArray(params?.token)
        ? params.token[0]
        : "";

  const headerTitle = meta
    ? meta.annotator.name
      ? `${meta.task.name} | Annotated by ${meta.annotator.name}`
      : meta.task.name
    : "Annotation job";

  useEffect(() => {
    document.title = meta?.task.name
      ? `${meta.task.name} | Annotation job | Calibrate`
      : "Annotation job | Calibrate";
  }, [meta?.task.name]);

  return (
    <PublicPageLayout
      title={headerTitle}
      pills={
        meta ? (
          <span
            className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium border ${jobStatusPillClass(
              meta.jobStatus,
            )}`}
          >
            {jobStatusLabel(meta.jobStatus)}
          </span>
        ) : null
      }
      contentClassName="max-w-7xl"
    >
      <div className="flex flex-col gap-4" style={{ height: "calc(100dvh - 140px)" }}>
        {meta && meta.evaluators.length > 0 && (
          // Same uncarded evaluator pills as the admin annotation-job page.
          <div className="space-y-2">
            <div className="text-[10px] uppercase tracking-wide text-muted-foreground">
              Evaluators
            </div>
            <div className="flex flex-wrap gap-1.5">
              {meta.evaluators.map((ev) => (
                <span
                  key={ev.uuid}
                  className="inline-flex items-center px-2 py-0.5 rounded-md text-xs font-medium border border-border bg-muted/40 text-foreground"
                >
                  {ev.name}
                </span>
              ))}
            </div>
          </div>
        )}

        <div className="border border-border rounded-xl [overflow:clip] flex flex-col flex-1 min-h-0">
          <AnnotationJobView
            token={token}
            mode="public-readonly"
            fillViewport={false}
            onLoaded={handleLoaded}
          />
        </div>
      </div>
    </PublicPageLayout>
  );
}

