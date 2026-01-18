"use client";

import { useState, useCallback, useEffect } from "react";
import { useParams, useRouter } from "next/navigation";
import { AppLayout } from "@/components/AppLayout";
import { AgentDetail, AgentDetailHeaderState } from "@/components/AgentDetail";

// Map tab IDs to display names for page title
const tabDisplayNames: Record<string, string> = {
  agent: "Agent",
  tools: "Tools",
  "data-extraction": "Data Extraction",
  tests: "Tests",
  settings: "Settings",
};

export default function AgentDetailPage() {
  const router = useRouter();
  const params = useParams();
  const uuid = params.uuid as string;
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [headerState, setHeaderState] = useState<AgentDetailHeaderState | null>(
    null
  );

  // Set page title when agent name or tab changes
  useEffect(() => {
    if (headerState?.agentName && headerState.agentName !== "Loading...") {
      const tabName = tabDisplayNames[headerState.activeTab] || "Agent";
      document.title = `${headerState.agentName} - ${tabName} | Pense`;
    } else {
      document.title = "Agent | Pense";
    }
  }, [headerState?.agentName, headerState?.activeTab]);

  const handleHeaderStateChange = useCallback(
    (state: AgentDetailHeaderState) => {
      setHeaderState(state);
    },
    []
  );

  // Header with back button and agent name
  const customHeader = (
    <div className="flex items-center gap-3">
      <button
        onClick={() => router.push("/agents")}
        className="flex items-center justify-center w-8 h-8 rounded-md hover:bg-muted transition-colors cursor-pointer"
        title="Back to agents"
      >
        <svg
          className="w-5 h-5"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          strokeWidth={2}
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M15.75 19.5L8.25 12l7.5-7.5"
          />
        </svg>
      </button>
      <span
        className="text-base font-semibold text-foreground cursor-pointer hover:opacity-70 transition-opacity"
        onClick={() => headerState?.onEditName()}
        title="Click to edit name"
      >
        {headerState?.agentName || "Loading..."}
      </span>
    </div>
  );

  // Save button for header actions
  const headerActions =
    headerState && !headerState.isLoading ? (
      <div className="mr-2">
        <button
          onClick={() => headerState.onSave()}
          disabled={headerState.isSaving}
          className="h-8 px-4 rounded-md text-sm font-medium bg-foreground text-background hover:opacity-90 transition-opacity cursor-pointer disabled:opacity-70 disabled:cursor-not-allowed flex items-center gap-2"
        >
          {headerState.isSaving && (
            <svg
              className="w-4 h-4 animate-spin"
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
              ></circle>
              <path
                className="opacity-75"
                fill="currentColor"
                d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
              ></path>
            </svg>
          )}
          {headerState.isSaving ? "" : "Save"}
        </button>
      </div>
    ) : null;

  return (
    <AppLayout
      activeItem="agents"
      onItemChange={(itemId) => router.push(`/${itemId}`)}
      sidebarOpen={sidebarOpen}
      onSidebarToggle={() => setSidebarOpen(!sidebarOpen)}
      customHeader={customHeader}
      headerActions={headerActions}
    >
      <AgentDetail
        agentUuid={uuid}
        onHeaderStateChange={handleHeaderStateChange}
      />
    </AppLayout>
  );
}
