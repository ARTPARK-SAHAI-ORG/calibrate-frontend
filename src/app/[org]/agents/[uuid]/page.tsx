"use client";

import { useState, useCallback, useEffect, useRef } from "react";
import { useParams, useRouter } from "@/lib/nav";
import { AppLayout } from "@/components/AppLayout";
import { AgentDetail, AgentDetailHeaderState } from "@/components/AgentDetail";
import { useSidebarState } from "@/lib/sidebar";
import {
  SpinnerIcon,
  CheckCircleIcon,
  CopyIcon,
  SaveIcon,
} from "@/components/icons";
import { VerifyErrorPopover } from "@/components/VerifyErrorPopover";
import {
  Breadcrumbs,
  InteractionTypePill,
  type Crumb,
} from "@/components/ui";

// Map tab IDs to display names for page title
const tabDisplayNames: Record<string, string> = {
  agent: "Agent",
  connection: "Connection",
  tools: "Tools",
  "data-extraction": "Data Extraction",
  tests: "Tests",
  traces: "Traces",
  evaluators: "Evaluators",
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

  const crumbs: Crumb[] = [
    { label: "Agents", href: "/agents" },
    ...(headerState?.hasError
      ? []
      : [
          {
            label: headerState?.agentName || "Loading...",
            onClick: () => headerState?.onEditName(),
            title: "Click to edit name",
          },
        ]),
  ];

  // The trail, with the kind of agent as a pill on the same line as its name.
  const showInteractionPill = Boolean(headerState && !headerState.hasError);
  const trail = (className?: string) => (
    <div className={`flex items-center gap-2 min-w-0 ${className ?? ""}`}>
      <Breadcrumbs items={crumbs} />
      {showInteractionPill && (
        <InteractionTypePill
          interactionType={headerState?.interactionType}
          className="px-1.5 py-0.5 rounded flex-shrink-0"
        />
      )}
    </div>
  );

  const customHeader = trail();

  // Header actions: Verify button (for unverified connection agents) + Save button
  const headerActions =
    headerState && !headerState.isLoading && !headerState.hasError ? (
      <div className="flex items-center gap-2 mr-1 md:mr-2">
        <button
          onClick={() => headerState.onDuplicate()}
          className="h-8 px-3 md:px-4 rounded-md text-xs md:text-sm font-medium border border-border bg-background text-foreground hover:bg-accent transition-colors cursor-pointer flex items-center gap-2"
        >
          <CopyIcon className="w-4 h-4" />
          Duplicate
        </button>
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

            <VerifyErrorPopover
              error={headerState.verifyError}
              sampleResponse={headerState.verifySampleResponse}
              onDismiss={() => headerState.onDismissVerifyError()}
            />
          </div>
        )}
        <button
          data-tour="agent-save"
          onClick={() => headerState.onSave()}
          disabled={headerState.isSaving}
          className="h-8 px-3 md:px-4 rounded-md text-xs md:text-sm font-medium bg-foreground text-background hover:opacity-90 transition-opacity cursor-pointer disabled:opacity-70 disabled:cursor-not-allowed flex items-center gap-2"
        >
          {headerState.isSaving ? (
            <SpinnerIcon className="w-4 h-4 animate-spin" />
          ) : (
            <>
              <SaveIcon className="w-4 h-4" />
              Save
            </>
          )}
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
      {/* AppLayout hides `customHeader` below md. */}
      {trail("md:hidden pt-4")}
      <AgentDetail
        agentUuid={uuid}
        onHeaderStateChange={handleHeaderStateChange}
      />
    </AppLayout>
  );
}
