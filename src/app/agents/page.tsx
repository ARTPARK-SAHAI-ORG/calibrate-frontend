"use client";

import React, { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { AppLayout } from "@/components/AppLayout";
import { Agents } from "@/components/Agents";

export default function AgentsPage() {
  // Set page title
  useEffect(() => {
    document.title = "Agents | Pense";
  }, []);
  const router = useRouter();
  const [sidebarOpen, setSidebarOpen] = useState(true);

  return (
    <AppLayout
      activeItem="agents"
      onItemChange={(itemId) => router.push(`/${itemId}`)}
      sidebarOpen={sidebarOpen}
      onSidebarToggle={() => setSidebarOpen(!sidebarOpen)}
    >
      <Agents
        onNavigateToAgent={(agentUuid) => router.push(`/agents/${agentUuid}`)}
      />
    </AppLayout>
  );
}
