"use client";

import { useState, useCallback, useEffect, useRef } from "react";
import { useParams, useRouter } from "next/navigation";
import { AppLayout } from "@/components/AppLayout";
import { AgentDetail, AgentDetailHeaderState } from "@/components/AgentDetail";
import { useSidebarState } from "@/lib/sidebar";
import { SpinnerIcon, CheckCircleIcon, CloseIcon } from "@/components/icons";

// Map tab IDs to display names for page title
const tabDisplayNames: Record<string, string> = {
  agent: "Agent",
  connection: "Connection",
  tools: "Tools",
  "data-extraction": "Data Extraction",
  tests: "Tests",
  settings: "Settings",
};

export default function AgentDetailPage() {
  const router = useRouter();
  const params = useParams();
  const uuid = params.uuid as string;
  const [sidebarOpen, setSidebarOpen] = useSidebarState();
  const [headerState, setHeaderState] = useState<AgentDetailHeaderState | null>(
    null
  );

  // Set page title when agent name or tab changes
  useEffect(() => {
    if (headerState?.agentName && headerState.agentName !== "Loading...") {
      const tabName = tabDisplayNames[headerState.activeTab] || "Agent";
      document.title = `${headerState.agentName} - ${tabName} | Calibrate`;
    } else {
      document.title = "Agent | Calibrate";
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
        className="text-sm md:text-base font-semibold text-foreground cursor-pointer hover:opacity-70 transition-opacity truncate"
        onClick={() => headerState?.onEditName()}
        title="Click to edit name"
      >
        {headerState?.agentName || "Loading..."}
      </span>
    </div>
  );

  // Header actions: Verify button (for unverified connection agents) + Save button
  const headerActions =
    headerState && !headerState.isLoading ? (
      <div className="flex items-center gap-2 mr-1 md:mr-2">
        {headerState.isConnectionUnverified && headerState.activeTab !== "connection" && (
          <div className="relative">
            <button
              onClick={() => headerState.onVerify()}
              disabled={headerState.isVerifying}
              className="h-8 px-3 md:px-4 rounded-md text-xs md:text-sm font-medium bg-yellow-500 text-black hover:bg-yellow-400 transition-colors cursor-pointer disabled:opacity-70 disabled:cursor-not-allowed flex items-center gap-2"
            >
              {headerState.isVerifying ? (
                <>
                  <SpinnerIcon className="w-4 h-4 animate-spin" />
                  <span>Verifying...</span>
                </>
              ) : (
                <>
                  <CheckCircleIcon className="w-4 h-4" />
                  <span>Verify</span>
                </>
              )}
            </button>

            {(headerState.verifyError || headerState.verifySampleResponse) && (
              <>
                <div
                  className="fixed inset-0 z-[99]"
                  onClick={() => headerState.onDismissVerifyError()}
                />
                <div className="absolute right-0 top-full mt-2 w-80 bg-background border border-border rounded-xl shadow-xl z-[100] overflow-hidden">
                  <div className="flex items-center justify-between p-3 border-b border-border">
                    <span className="text-sm font-medium text-red-400">Verification Failed</span>
                    <button
                      onClick={() => headerState.onDismissVerifyError()}
                      className="w-6 h-6 flex items-center justify-center rounded-md hover:bg-muted transition-colors cursor-pointer"
                    >
                      <CloseIcon className="w-4 h-4 text-muted-foreground" />
                    </button>
                  </div>
                  <div className="p-3 space-y-2">
                    {headerState.verifyError && (
                      <p className="text-xs text-red-400">{headerState.verifyError}</p>
                    )}
                    {headerState.verifySampleResponse && (
                      <div className="space-y-1">
                        <p className="text-xs font-medium text-muted-foreground">Your agent responded with:</p>
                        <pre className="text-xs bg-muted rounded-lg p-2 overflow-x-auto text-foreground max-h-32 overflow-y-auto">
                          {JSON.stringify(headerState.verifySampleResponse, null, 2)}
                        </pre>
                      </div>
                    )}
                  </div>
                </div>
              </>
            )}
          </div>
        )}
        <button
          onClick={() => headerState.onSave()}
          disabled={headerState.isSaving}
          className="h-8 px-3 md:px-4 rounded-md text-xs md:text-sm font-medium bg-foreground text-background hover:opacity-90 transition-opacity cursor-pointer disabled:opacity-70 disabled:cursor-not-allowed flex items-center gap-2"
        >
          {headerState.isSaving && <SpinnerIcon className="w-4 h-4 animate-spin" />}
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
