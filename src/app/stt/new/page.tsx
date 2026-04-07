"use client";

import React, { useState, useEffect, useRef, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { AppLayout } from "@/components/AppLayout";
import { SpeechToTextEvaluation } from "@/components/evaluations/SpeechToTextEvaluation";
import { useSidebarState } from "@/lib/sidebar";

function NewSTTEvaluationPageInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const initialDatasetId = searchParams.get("dataset") ?? undefined;
  const [sidebarOpen, setSidebarOpen] = useSidebarState();
  const [isEvaluating, setIsEvaluating] = useState(false);
  const evaluateRef = useRef<(() => void) | null>(null);

  useEffect(() => {
    document.title = "New STT Evaluation | Calibrate";
  }, []);

  const customHeader = (
    <div className="flex items-center gap-3">
      <button
        onClick={() => router.push("/stt")}
        className="flex items-center justify-center w-8 h-8 rounded-md hover:bg-muted transition-colors cursor-pointer"
        title="Back to STT evaluations"
      >
        <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5L8.25 12l7.5-7.5" />
        </svg>
      </button>
      <span className="text-base font-semibold text-foreground">Back</span>
      <div className="w-px h-5 bg-border mx-1" />
      {isEvaluating ? (
        <div className="flex items-center gap-2 h-8 px-3 text-sm text-muted-foreground">
          <svg className="w-3.5 h-3.5 animate-spin" fill="none" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
          </svg>
          Evaluating…
        </div>
      ) : (
        <button
          onClick={() => evaluateRef.current?.()}
          className="h-8 px-4 rounded-md text-sm font-medium bg-foreground text-background hover:opacity-90 transition-opacity cursor-pointer flex items-center gap-1.5"
        >
          <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M5.25 5.653c0-.856.917-1.398 1.667-.986l11.54 6.348a1.125 1.125 0 010 1.971l-11.54 6.347a1.125 1.125 0 01-1.667-.986V5.653z" />
          </svg>
          Evaluate
        </button>
      )}
    </div>
  );

  return (
    <AppLayout
      activeItem="stt"
      onItemChange={(itemId) => router.push(`/${itemId}`)}
      sidebarOpen={sidebarOpen}
      onSidebarToggle={() => setSidebarOpen(!sidebarOpen)}
      customHeader={customHeader}
    >
      <SpeechToTextEvaluation
        evaluateRef={evaluateRef}
        onEvaluatingChange={setIsEvaluating}
        initialDatasetId={initialDatasetId}
      />
    </AppLayout>
  );
}

export default function NewSTTEvaluationPage() {
  return (
    <Suspense fallback={null}>
      <NewSTTEvaluationPageInner />
    </Suspense>
  );
}
