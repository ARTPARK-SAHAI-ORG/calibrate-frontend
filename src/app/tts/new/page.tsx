"use client";

import React, { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { AppLayout } from "@/components/AppLayout";
import { BackHeader } from "@/components/ui";
import { TextToSpeechEvaluation } from "@/components/evaluations/TextToSpeechEvaluation";

export default function NewTTSEvaluationPage() {
  const router = useRouter();
  const [sidebarOpen, setSidebarOpen] = useState(true);

  // Set page title
  useEffect(() => {
    document.title = "New TTS Evaluation | Pense";
  }, []);

  const customHeader = (
    <BackHeader
      label="Back to all TTS evaluations"
      onBack={() => router.push("/tts")}
      title="Back to TTS evaluations"
    />
  );

  return (
    <AppLayout
      activeItem="tts"
      onItemChange={(itemId) => router.push(`/${itemId}`)}
      sidebarOpen={sidebarOpen}
      onSidebarToggle={() => setSidebarOpen(!sidebarOpen)}
      customHeader={customHeader}
    >
      <TextToSpeechEvaluation />
    </AppLayout>
  );
}
