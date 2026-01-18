"use client";

import React, { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { AppLayout } from "@/components/AppLayout";
import { BackHeader } from "@/components/ui";
import { SpeechToTextEvaluation } from "@/components/evaluations/SpeechToTextEvaluation";

export default function NewSTTEvaluationPage() {
  const router = useRouter();
  const [sidebarOpen, setSidebarOpen] = useState(true);

  // Set page title
  useEffect(() => {
    document.title = "New STT Evaluation | Pense";
  }, []);

  const customHeader = (
    <BackHeader
      label="Back to all STT evaluations"
      onBack={() => router.push("/stt")}
      title="Back to STT evaluations"
    />
  );

  return (
    <AppLayout
      activeItem="stt"
      onItemChange={(itemId) => router.push(`/${itemId}`)}
      sidebarOpen={sidebarOpen}
      onSidebarToggle={() => setSidebarOpen(!sidebarOpen)}
      customHeader={customHeader}
    >
      <SpeechToTextEvaluation />
    </AppLayout>
  );
}
