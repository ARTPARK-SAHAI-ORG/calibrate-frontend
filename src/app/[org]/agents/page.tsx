"use client";

import React, { useState, useEffect } from "react";
import { useRouter } from "@/lib/nav";
import { AppLayout } from "@/components/AppLayout";
import { Agents } from "@/components/Agents";
import { useSidebarState } from "@/lib/sidebar";

export default function AgentsPage() {
  const router = useRouter();
  const [sidebarOpen, setSidebarOpen] = useSidebarState();

  // Set page title
  useEffect(() => {
    document.title = "Agents | Calibrate";
  }, []);

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
