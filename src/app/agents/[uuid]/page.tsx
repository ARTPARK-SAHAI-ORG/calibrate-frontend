"use client";

import React, { useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { AppLayout } from "@/components/AppLayout";
import { AgentDetail } from "@/components/AgentDetail";

export default function AgentDetailPage() {
  const router = useRouter();
  const params = useParams();
  const uuid = params.uuid as string;
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [customHeader, setCustomHeader] = useState<React.ReactNode>(null);

  return (
    <AppLayout
      activeItem="agents"
      onItemChange={(itemId) => router.push(`/${itemId}`)}
      sidebarOpen={sidebarOpen}
      onSidebarToggle={() => setSidebarOpen(!sidebarOpen)}
      customHeader={customHeader}
    >
      <AgentDetail agentUuid={uuid} onHeaderUpdate={setCustomHeader} />
    </AppLayout>
  );
}
