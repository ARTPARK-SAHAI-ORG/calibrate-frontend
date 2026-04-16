"use client";

import React, { useState, useEffect, useRef } from "react";
import Link from "next/link";
import { useSearchParams, useRouter } from "next/navigation";
import { signOut } from "next-auth/react";
import { useAccessToken } from "@/hooks";
import {
  AgentTabContent,
  AgentConnectionTabContent,
  ToolsTabContent,
  DataExtractionTabContent,
  TestsTabContent,
  SettingsTabContent,
} from "@/components/agent-tabs";
import type {
  LLMModel,
  DataExtractionFieldData,
} from "@/components/agent-tabs";
import { useOpenRouterModels, findModelInProviders, useVerifyConnection } from "@/hooks";
import { SpinnerIcon, CheckCircleIcon } from "@/components/icons";
import { VerifyErrorPopover } from "@/components/VerifyErrorPopover";
import {
  VerifyRequestPreviewDialog,
  type MessageRow,
} from "@/components/VerifyRequestPreviewDialog";
import type { ConnectionConfig } from "@/components/agent-tabs/AgentConnectionTabContent";
import { useHideFloatingButton } from "@/components/AppLayout";

export type AgentDetailHeaderState = {
  agentName: string;
  activeTab: string;
  isLoading: boolean;
  isSaving: boolean;
  onSave: () => void;
  onEditName: () => void;
  isConnectionUnverified: boolean;
  isVerifying: boolean;
  onVerify: () => void;
  verifyError: string | null;
  verifySampleResponse: Record<string, unknown> | null;
  onDismissVerifyError: () => void;
};

type AgentDetailProps = {
  agentUuid: string;
  onHeaderStateChange?: (state: AgentDetailHeaderState) => void;
};

type AgentData = {
  uuid: string;
  name: string;
  type?: "agent" | "connection";
  config: Record<string, any>;
  created_at: string;
  updated_at: string;
};

type ToolData = {
  uuid: string;
  name: string;
  config: Record<string, any>;
  created_at: string;
  updated_at: string;
};

type TabType = "agent" | "connection" | "tools" | "data-extraction" | "tests" | "settings";

const tabLabels: Record<TabType, string> = {
  agent: "Agent",
  connection: "Connection",
  tools: "Tools",
  "data-extraction": "Data extraction",
  tests: "Tests",
  settings: "Settings",
};

const calibrateTabs: TabType[] = ["agent", "tools", "data-extraction", "tests", "settings"];
const connectionTabs: TabType[] = ["connection", "tests", "settings"];

export function AgentDetail({
  agentUuid,
  onHeaderStateChange,
}: AgentDetailProps) {
  const searchParams = useSearchParams();
  const router = useRouter();
  const backendAccessToken = useAccessToken();

  // Get initial tab from URL or default based on agent type
  const getInitialTab = (): TabType => {
    const tabParam = searchParams.get("tab");
    if (tabParam && [...calibrateTabs, ...connectionTabs].includes(tabParam as TabType)) {
      return tabParam as TabType;
    }
    return "agent";
  };

  const { providers: llmProviders } = useOpenRouterModels();

  const [agent, setAgent] = useState<AgentData | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<TabType>(getInitialTab);

  // Name editing dialog state
  const [isEditNameDialogOpen, setIsEditNameDialogOpen] = useState(false);
  const [editedName, setEditedName] = useState("");

  // Track the last-saved benchmark provider so we can detect unsaved changes
  const [savedBenchmarkProvider, setSavedBenchmarkProvider] = useState<string | undefined>(undefined);

  // Unsaved changes dialog state (shown when switching tabs with unsaved benchmark provider)
  const [unsavedChangesDialogOpen, setUnsavedChangesDialogOpen] = useState(false);
  const [pendingTab, setPendingTab] = useState<TabType | null>(null);

  // Hide the floating "Talk to Us" button when the edit name dialog is open
  useHideFloatingButton(isEditNameDialogOpen);

  // Helper to perform the actual tab switch + URL update
  const performTabSwitch = (tab: TabType) => {
    setActiveTab(tab);
    const params = new URLSearchParams(searchParams.toString());
    params.set("tab", tab);
    window.history.replaceState(null, "", `?${params.toString()}`);
  };

  // Update URL when tab changes, with unsaved-changes guard for benchmark provider
  const handleTabChange = (tab: TabType) => {
    if (
      agent?.type === "connection" &&
      activeTab === "connection" &&
      connectionConfig.benchmark_provider !== savedBenchmarkProvider
    ) {
      setPendingTab(tab);
      setUnsavedChangesDialogOpen(true);
      return;
    }
    performTabSwitch(tab);
  };

  // Agent tab state
  const [systemPrompt, setSystemPrompt] = useState("");
  const [sttProvider, setSttProvider] = useState<string>("google");
  const [ttsProvider, setTtsProvider] = useState<string>("google");
  const [selectedLLM, setSelectedLLM] = useState<LLMModel | null>({
    id: "google/gemini-3-flash-preview",
    name: "Gemini 3 Flash Preview",
  });

  // Settings tab state
  const [endConversationEnabled, setEndConversationEnabled] = useState(true);
  const [agentSpeaksFirst, setAgentSpeaksFirst] = useState(false);
  const [maxAssistantTurns, setMaxAssistantTurns] = useState<number>(50);

  // Save state
  const [isSaving, setIsSaving] = useState(false);
  const [showSaveToast, setShowSaveToast] = useState(false);
  const saveRef = useRef<() => void>(() => {});
  const isSavingRef = useRef(false);

  // Tools linked to this agent
  const [agentTools, setAgentTools] = useState<ToolData[]>([]);
  const [agentToolsLoading, setAgentToolsLoading] = useState(false);
  const [agentToolsError, setAgentToolsError] = useState<string | null>(null);

  // All available tools (for the add tool dialog)
  const [allTools, setAllTools] = useState<ToolData[]>([]);
  const [allToolsLoading, setAllToolsLoading] = useState(false);
  const [allToolsError, setAllToolsError] = useState<string | null>(null);

  // Data extraction fields list state
  const [dataExtractionFields, setDataExtractionFields] = useState<
    DataExtractionFieldData[]
  >([]);
  const [dataExtractionFieldsLoading, setDataExtractionFieldsLoading] =
    useState(false);
  const [dataExtractionFieldsError, setDataExtractionFieldsError] = useState<
    string | null
  >(null);

  // Agent connection state
  const [connectionUrl, setConnectionUrl] = useState("");
  const [connectionHeaders, setConnectionHeaders] = useState<
    Array<{ key: string; value: string }>
  >([{ key: "", value: "" }]);
  const [connectionConfig, setConnectionConfig] = useState<ConnectionConfig>(
    {},
  );

  // Connection verification via shared hook
  const verify = useVerifyConnection();

  const isConnectionUnverified = agent?.type === "connection" && connectionConfig.connection_verified !== true;

  const [verifyDialogOpen, setVerifyDialogOpen] = useState(false);

  const handleVerifyClick = () => {
    setVerifyDialogOpen(true);
  };

  const handleVerifyConfirm = async (messages: MessageRow[]) => {
    const success = await verify.verifySavedAgent(agentUuid, messages);
    if (success) {
      setConnectionConfig((prev) => ({
        ...prev,
        connection_verified: true,
        connection_verified_at: new Date().toISOString(),
        connection_verified_error: null,
      }));
      setVerifyDialogOpen(false);
    }
  };

  // Fetch agent data
  useEffect(() => {
    const fetchAgent = async () => {
      if (!backendAccessToken) return;

      try {
        setIsLoading(true);
        setError(null);
        const backendUrl = process.env.NEXT_PUBLIC_BACKEND_URL;
        if (!backendUrl) {
          throw new Error("BACKEND_URL environment variable is not set");
        }

        const response = await fetch(`${backendUrl}/agents/${agentUuid}`, {
          method: "GET",
          headers: {
            accept: "application/json",
            "ngrok-skip-browser-warning": "true",
            Authorization: `Bearer ${backendAccessToken}`,
          },
        });

        if (response.status === 401) {
          await signOut({ callbackUrl: "/login" });
          return;
        }

        if (!response.ok) {
          throw new Error("Failed to fetch agent");
        }

        const data: AgentData = await response.json();
        setAgent(data);

        // Set initial tab based on agent type
        const currentTab = searchParams.get("tab") as TabType | null;
        if (data.type === "connection") {
          if (!currentTab || !connectionTabs.includes(currentTab)) {
            setActiveTab("connection");
          }
        } else {
          if (!currentTab || !calibrateTabs.includes(currentTab)) {
            setActiveTab("agent");
          }
        }

        // Initialize connection fields if agent is a connection type
        if (data.type === "connection" && data.config) {
          setConnectionUrl(data.config.agent_url || "");
          const headers = data.config.agent_headers || {};
          const parsed = Object.entries(headers).map(([key, value]) => ({
            key,
            value: String(value),
          }));
          setConnectionHeaders(
            parsed.length > 0 ? parsed : [{ key: "", value: "" }],
          );
          setConnectionConfig(data.config);
          setSavedBenchmarkProvider(data.config.benchmark_provider);
        }

        // Initialize form fields from agent config if available
        if (data.config) {
          if (data.config.system_prompt) {
            setSystemPrompt(data.config.system_prompt);
          }
          if (data.config.stt?.provider) {
            setSttProvider(data.config.stt.provider);
          }
          if (data.config.tts?.provider) {
            setTtsProvider(data.config.tts.provider);
          }
          if (data.config.llm?.model) {
            // Find the matching LLM model from the providers list
            const modelId = data.config.llm.model;
            let foundModel: LLMModel | null = null;
            for (const provider of llmProviders) {
              const model = provider.models.find((m) => m.id === modelId);
              if (model) {
                foundModel = model;
                break;
              }
            }
            if (foundModel) {
              setSelectedLLM(foundModel);
            } else {
              // If model not found in list, create a basic entry
              setSelectedLLM({ id: modelId, name: modelId });
            }
          }
          if (data.config.settings?.agent_speaks_first !== undefined) {
            setAgentSpeaksFirst(data.config.settings.agent_speaks_first);
          }
          if (data.config.settings?.max_assistant_turns !== undefined) {
            setMaxAssistantTurns(data.config.settings.max_assistant_turns);
          }
          if (data.config.system_tools?.end_call !== undefined) {
            setEndConversationEnabled(data.config.system_tools.end_call);
          }
          // Load data extraction fields from config
          if (data.config.data_extraction_fields) {
            const fields = data.config.data_extraction_fields.map(
              (field: any) => ({
                uuid: field.uuid || crypto.randomUUID(),
                type: field.type,
                name: field.name,
                description: field.description,
                required: field.required ?? true,
                agent_id: agentUuid,
                created_at: field.created_at || new Date().toISOString(),
                updated_at: field.updated_at || new Date().toISOString(),
              })
            );
            setDataExtractionFields(fields);
          }
        }
      } catch (err) {
        console.error("Error fetching agent:", err);
        setError(err instanceof Error ? err.message : "Failed to load agent");
      } finally {
        setIsLoading(false);
      }
    };

    if (agentUuid && backendAccessToken) {
      fetchAgent();
    }
  }, [agentUuid, backendAccessToken]);

  // When providers load asynchronously, resolve the display name if it was set to the raw ID
  useEffect(() => {
    if (!selectedLLM || llmProviders.length === 0) return;
    const found = findModelInProviders(llmProviders, selectedLLM.id);
    if (found && found.name !== selectedLLM.name) {
      setSelectedLLM(found);
    }
  }, [llmProviders, selectedLLM]);

  // Fetch tools linked to this agent
  useEffect(() => {
    const fetchAgentTools = async () => {
      if (!agentUuid || !backendAccessToken) return;

      try {
        setAgentToolsLoading(true);
        setAgentToolsError(null);
        const backendUrl = process.env.NEXT_PUBLIC_BACKEND_URL;
        if (!backendUrl) {
          throw new Error("BACKEND_URL environment variable is not set");
        }

        const response = await fetch(
          `${backendUrl}/agent-tools/agent/${agentUuid}/tools`,
          {
            method: "GET",
            headers: {
              accept: "application/json",
              "ngrok-skip-browser-warning": "true",
              Authorization: `Bearer ${backendAccessToken}`,
            },
          }
        );

        if (response.status === 401) {
          await signOut({ callbackUrl: "/login" });
          return;
        }

        if (!response.ok) {
          throw new Error("Failed to fetch agent tools");
        }

        const data: ToolData[] = await response.json();
        setAgentTools(data);
      } catch (err) {
        console.error("Error fetching agent tools:", err);
        setAgentToolsError(
          err instanceof Error ? err.message : "Failed to load agent tools"
        );
      } finally {
        setAgentToolsLoading(false);
      }
    };

    fetchAgentTools();
  }, [agentUuid, backendAccessToken]);

  // Fetch all available tools (for the add tool dialog)
  useEffect(() => {
    const fetchAllTools = async () => {
      if (!backendAccessToken) return;

      try {
        setAllToolsLoading(true);
        setAllToolsError(null);
        const backendUrl = process.env.NEXT_PUBLIC_BACKEND_URL;
        if (!backendUrl) {
          throw new Error("BACKEND_URL environment variable is not set");
        }

        const response = await fetch(`${backendUrl}/tools`, {
          method: "GET",
          headers: {
            accept: "application/json",
            "ngrok-skip-browser-warning": "true",
            Authorization: `Bearer ${backendAccessToken}`,
          },
        });

        if (response.status === 401) {
          await signOut({ callbackUrl: "/login" });
          return;
        }

        if (!response.ok) {
          throw new Error("Failed to fetch tools");
        }

        const data: ToolData[] = await response.json();
        setAllTools(data);
      } catch (err) {
        console.error("Error fetching tools:", err);
        setAllToolsError(
          err instanceof Error ? err.message : "Failed to load tools"
        );
      } finally {
        setAllToolsLoading(false);
      }
    };

    fetchAllTools();
  }, [backendAccessToken]);

  // Update save function ref when relevant state changes
  useEffect(() => {
    saveRef.current = async () => {
      if (!agent) return;

      try {
        setIsSaving(true);
        isSavingRef.current = true;
        const backendUrl = process.env.NEXT_PUBLIC_BACKEND_URL;
        if (!backendUrl) {
          throw new Error("BACKEND_URL environment variable is not set");
        }

        // Build config based on agent type
        const configPayload =
          agent.type === "connection"
            ? {
                ...connectionConfig,
                agent_url: connectionUrl,
                agent_headers: Object.fromEntries(
                  connectionHeaders
                    .filter((h) => h.key.trim())
                    .map((h) => [h.key.trim(), h.value])
                ),
                settings: {
                  agent_speaks_first: agentSpeaksFirst,
                  max_assistant_turns: maxAssistantTurns,
                },
              }
            : {
                system_prompt: systemPrompt,
                stt: { provider: sttProvider },
                tts: { provider: ttsProvider },
                llm: { model: selectedLLM?.id || "" },
                settings: {
                  agent_speaks_first: agentSpeaksFirst,
                  max_assistant_turns: maxAssistantTurns,
                },
                system_tools: { end_call: endConversationEnabled },
                data_extraction_fields: dataExtractionFields.map((field) => ({
                  name: field.name,
                  type: field.type,
                  description: field.description,
                  required: field.required,
                })),
              };

        const response = await fetch(`${backendUrl}/agents/${agentUuid}`, {
          method: "PUT",
          headers: {
            accept: "application/json",
            "Content-Type": "application/json",
            "ngrok-skip-browser-warning": "true",
            Authorization: `Bearer ${backendAccessToken}`,
          },
          body: JSON.stringify({
            name: agent.name,
            config: configPayload,
            ...(agent.type === "connection" && {
              connection_verified:
                connectionConfig.connection_verified === true,
            }),
          }),
        });

        if (response.status === 401) {
          await signOut({ callbackUrl: "/login" });
          return;
        }

        if (!response.ok) {
          throw new Error("Failed to save agent");
        }

        const savedAgent = await response.json();

        if (agent.type === "connection" && savedAgent.config) {
          setConnectionConfig((prev) => ({
            ...prev,
            connection_verified:
              savedAgent.config.connection_verified ?? false,
            connection_verified_at:
              savedAgent.config.connection_verified_at ?? null,
            connection_verified_error:
              savedAgent.config.connection_verified_error ?? null,
            benchmark_models_verified:
              savedAgent.config.benchmark_models_verified ?? {},
          }));
          setSavedBenchmarkProvider(connectionConfig.benchmark_provider);
        }

        // Show success toast
        setShowSaveToast(true);
      } catch (err) {
        console.error("Error saving agent:", err);
        alert(err instanceof Error ? err.message : "Failed to save agent");
      } finally {
        setIsSaving(false);
        isSavingRef.current = false;
      }
    };
  }, [
    agent,
    agentUuid,
    systemPrompt,
    sttProvider,
    ttsProvider,
    selectedLLM,
    agentSpeaksFirst,
    maxAssistantTurns,
    endConversationEnabled,
    dataExtractionFields,
    connectionUrl,
    connectionHeaders,
    connectionConfig,
    backendAccessToken,
  ]);

  // Handle name edit dialog open
  const handleOpenEditNameDialog = () => {
    if (agent) {
      setEditedName(agent.name);
      setIsEditNameDialogOpen(true);
    }
  };

  // Handle name save from dialog
  const handleSaveName = async () => {
    if (!agent || !editedName.trim() || editedName.trim() === agent.name) {
      setIsEditNameDialogOpen(false);
      return;
    }

    try {
      setIsSaving(true);
      const backendUrl = process.env.NEXT_PUBLIC_BACKEND_URL;
      if (!backendUrl) {
        throw new Error("BACKEND_URL environment variable is not set");
      }

      const response = await fetch(`${backendUrl}/agents/${agentUuid}`, {
        method: "PUT",
        headers: {
          accept: "application/json",
          "Content-Type": "application/json",
          "ngrok-skip-browser-warning": "true",
          Authorization: `Bearer ${backendAccessToken}`,
        },
        body: JSON.stringify({
          name: editedName.trim(),
          config: agent.config || {},
        }),
      });

      if (response.status === 401) {
        await signOut({ callbackUrl: "/login" });
        return;
      }

      if (!response.ok) {
        throw new Error("Failed to save agent name");
      }

      // Update local state with new name
      setAgent({ ...agent, name: editedName.trim() });
      setIsEditNameDialogOpen(false);
      setShowSaveToast(true);
    } catch (err) {
      console.error("Error saving agent name:", err);
      alert(err instanceof Error ? err.message : "Failed to save agent name");
    } finally {
      setIsSaving(false);
    }
  };

  // Handle dialog cancel
  const handleCancelEditName = () => {
    setIsEditNameDialogOpen(false);
    setEditedName("");
  };

  // Unsaved benchmark provider dialog: discard changes and switch tab
  const handleDiscardAndSwitchTab = () => {
    setConnectionConfig((prev) => ({
      ...prev,
      benchmark_provider: savedBenchmarkProvider,
    }));
    setUnsavedChangesDialogOpen(false);
    if (pendingTab) {
      performTabSwitch(pendingTab);
      setPendingTab(null);
    }
  };

  // Unsaved benchmark provider dialog: save changes then switch tab
  const handleSaveAndSwitchTab = async () => {
    await saveRef.current();
    setUnsavedChangesDialogOpen(false);
    if (pendingTab) {
      performTabSwitch(pendingTab);
      setPendingTab(null);
    }
  };

  // Auto-dismiss toast after 3 seconds
  useEffect(() => {
    if (showSaveToast) {
      const timer = setTimeout(() => {
        setShowSaveToast(false);
      }, 3000);
      return () => clearTimeout(timer);
    }
  }, [showSaveToast]);

  // Notify parent of header state changes
  useEffect(() => {
    if (onHeaderStateChange) {
      onHeaderStateChange({
        agentName: agent?.name || "Loading...",
        activeTab,
        isLoading,
        isSaving,
        onSave: () => saveRef.current(),
        onEditName: handleOpenEditNameDialog,
        isConnectionUnverified,
        isVerifying: verify.isVerifying,
        onVerify: handleVerifyClick,
        verifyError: verify.verifyError,
        verifySampleResponse: verify.verifySampleResponse,
        onDismissVerifyError: verify.dismiss,
      });
    }
  }, [agent?.name, activeTab, isLoading, isSaving, onHeaderStateChange, isConnectionUnverified, verify.isVerifying, verify.verifyError, verify.verifySampleResponse]);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="flex items-center gap-3">
          <svg className="w-5 h-5 animate-spin" fill="none" viewBox="0 0 24 24">
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
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-center">
          <p className="text-base text-red-500 mb-2">{error}</p>
          <button
            onClick={() => window.location.reload()}
            className="text-base text-muted-foreground hover:text-foreground transition-colors cursor-pointer"
          >
            Retry
          </button>
        </div>
      </div>
    );
  }

  if (!agent) {
    return (
      <div className="flex items-center justify-center h-64">
        <p className="text-base text-muted-foreground">Agent not found</p>
      </div>
    );
  }

  return (
    <div className="space-y-4 md:space-y-6 py-4 md:py-0">
      {/* Agent Header - only shown when not using external header */}
      {!onHeaderStateChange && (
        <div className="flex items-center justify-between gap-3 -mt-2 md:-mt-4">
          <div className="flex items-center gap-2 md:gap-3 min-w-0">
            <Link
              href="/agents"
              className="flex items-center justify-center w-8 h-8 rounded-md hover:bg-muted transition-colors cursor-pointer flex-shrink-0"
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
            </Link>
            <h1
              className="text-lg md:text-xl font-semibold cursor-pointer hover:opacity-70 transition-opacity truncate"
              onClick={handleOpenEditNameDialog}
              title="Click to edit name"
            >
              {agent.name}
            </h1>
          </div>
          <div className="flex items-center gap-2 flex-shrink-0">
            {isConnectionUnverified && (
              <div className="relative">
                <button
                  onClick={handleVerifyClick}
                  disabled={verify.isVerifying}
                  className="h-8 md:h-9 px-3 md:px-4 rounded-md text-xs md:text-sm font-medium bg-yellow-500 text-black hover:bg-yellow-400 transition-colors cursor-pointer disabled:opacity-70 disabled:cursor-not-allowed flex items-center gap-2"
                >
                  {verify.isVerifying ? (
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
                  error={verify.verifyError}
                  sampleResponse={verify.verifySampleResponse}
                  onDismiss={verify.dismiss}
                />
              </div>
            )}
            <button
              onClick={() => saveRef.current()}
              disabled={isSaving}
              className="h-8 md:h-9 px-4 md:px-6 rounded-md text-xs md:text-sm font-medium bg-foreground text-background hover:opacity-90 transition-opacity cursor-pointer disabled:opacity-70 disabled:cursor-not-allowed flex items-center gap-2"
            >
              {isSaving && <SpinnerIcon className="w-4 h-4 animate-spin" />}
              {isSaving ? "" : "Save"}
            </button>
          </div>
        </div>
      )}

      {/* Tabs Navigation */}
      <div
        className="hide-scrollbar flex items-center gap-3 md:gap-4 lg:gap-6 border-b border-border overflow-x-auto -mx-4 md:mx-0 px-4 md:px-0"
        style={{ scrollbarWidth: "none", msOverflowStyle: "none" }}
      >
        {(agent.type === "connection" ? connectionTabs : calibrateTabs).map(
          (tab) => (
            <button
              key={tab}
              onClick={() => handleTabChange(tab)}
              className={`pb-3 px-1 text-sm md:text-base font-medium transition-colors cursor-pointer whitespace-nowrap flex-shrink-0 ${
                activeTab === tab
                  ? "text-foreground border-b-2 border-foreground"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              {tabLabels[tab]}
            </button>
          ),
        )}
      </div>

      {/* Tab Content Container */}
      <div className="pt-2 md:pt-4">
        {/* Connection Tab Content */}
        {activeTab === "connection" && agent.type === "connection" && (
          <AgentConnectionTabContent
            agentUuid={agentUuid}
            agentUrl={connectionUrl}
            onAgentUrlChange={setConnectionUrl}
            agentHeaders={connectionHeaders}
            onAgentHeadersChange={setConnectionHeaders}
            connectionConfig={connectionConfig}
            onConnectionConfigChange={setConnectionConfig}
            onSave={() => saveRef.current()}
            isSaving={isSaving}
          />
        )}

        {/* Agent Tab Content */}
        {activeTab === "agent" && agent.type !== "connection" && (
          <AgentTabContent
            systemPrompt={systemPrompt}
            setSystemPrompt={setSystemPrompt}
            sttProvider={sttProvider}
            setSttProvider={setSttProvider}
            ttsProvider={ttsProvider}
            setTtsProvider={setTtsProvider}
            selectedLLM={selectedLLM}
            setSelectedLLM={setSelectedLLM}
          />
        )}

        {/* Tools Tab Content */}
        {activeTab === "tools" && (
          <ToolsTabContent
            agentUuid={agentUuid}
            agentTools={agentTools}
            setAgentTools={setAgentTools}
            agentToolsLoading={agentToolsLoading}
            agentToolsError={agentToolsError}
            allTools={allTools}
            allToolsLoading={allToolsLoading}
            endConversationEnabled={endConversationEnabled}
            setEndConversationEnabled={setEndConversationEnabled}
          />
        )}

        {/* Data Extraction Tab Content */}
        {activeTab === "data-extraction" && (
          <DataExtractionTabContent
            agentUuid={agentUuid}
            dataExtractionFields={dataExtractionFields}
            setDataExtractionFields={setDataExtractionFields}
            dataExtractionFieldsLoading={dataExtractionFieldsLoading}
            dataExtractionFieldsError={dataExtractionFieldsError}
            saveRef={saveRef}
          />
        )}

        {/* Tests Tab Content */}
        {activeTab === "tests" && (
          <TestsTabContent
            agentUuid={agentUuid}
            agentName={agent.name}
            agentType={agent.type}
            connectionVerified={
              agent.type === "connection"
                ? connectionConfig.connection_verified === true
                : undefined
            }
            supportsBenchmark={
              agent.type === "connection"
                ? connectionConfig.supports_benchmark === true
                : undefined
            }
            benchmarkModelsVerified={
              agent.type === "connection"
                ? connectionConfig.benchmark_models_verified
                : undefined
            }
            benchmarkProvider={
              agent.type === "connection"
                ? connectionConfig.benchmark_provider
                : undefined
            }
          />
        )}

        {/* Settings Tab Content - commented out to hide the tab */}
        {activeTab === "settings" && (
          <SettingsTabContent
            agentSpeaksFirst={agentSpeaksFirst}
            setAgentSpeaksFirst={setAgentSpeaksFirst}
            maxAssistantTurns={maxAssistantTurns}
            setMaxAssistantTurns={setMaxAssistantTurns}
          />
        )}
      </div>

      {/* Edit Name Dialog */}
      {isEditNameDialogOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4"
          onClick={handleCancelEditName}
        >
          <div
            className="bg-background border border-border rounded-xl p-5 md:p-6 max-w-md w-full shadow-lg"
            onClick={(e) => e.stopPropagation()}
          >
            <h2 className="text-base md:text-lg font-semibold mb-3 md:mb-4">
              Edit Agent Name
            </h2>
            <input
              type="text"
              value={editedName}
              onChange={(e) => setEditedName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  handleSaveName();
                } else if (e.key === "Escape") {
                  handleCancelEditName();
                }
              }}
              className="w-full h-9 md:h-10 px-3 rounded-md text-sm border border-border bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-accent focus:border-transparent mb-4"
              maxLength={50}
              autoFocus
            />
            <div className="flex items-center justify-end gap-2 md:gap-3">
              <button
                onClick={handleCancelEditName}
                className="h-9 md:h-10 px-4 rounded-md text-xs md:text-sm font-medium border border-border bg-background hover:bg-muted/50 transition-colors cursor-pointer"
              >
                Cancel
              </button>
              <button
                onClick={handleSaveName}
                disabled={!editedName.trim()}
                className="h-9 md:h-10 px-4 rounded-md text-xs md:text-sm font-medium bg-foreground text-background hover:opacity-90 transition-opacity cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Save
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Unsaved Benchmark Provider Changes Dialog */}
      {unsavedChangesDialogOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4"
          onClick={() => {
            setUnsavedChangesDialogOpen(false);
            setPendingTab(null);
          }}
        >
          <div
            className="bg-background border border-border rounded-xl p-5 md:p-6 max-w-md w-full shadow-lg"
            onClick={(e) => e.stopPropagation()}
          >
            <h2 className="text-base md:text-lg font-semibold mb-2">
              Unsaved changes
            </h2>
            <p className="text-sm md:text-base text-muted-foreground mb-5 md:mb-6">
              You have unsaved changes to the benchmark provider. Would you like
              to save before switching tabs?
            </p>
            <div className="flex items-center justify-end gap-2 md:gap-3">
              <button
                onClick={handleDiscardAndSwitchTab}
                className="h-9 md:h-10 px-4 rounded-md text-xs md:text-sm font-medium border border-border bg-background hover:bg-muted/50 transition-colors cursor-pointer"
              >
                Discard
              </button>
              <button
                onClick={handleSaveAndSwitchTab}
                disabled={isSaving}
                className="h-9 md:h-10 px-4 rounded-md text-xs md:text-sm font-medium bg-foreground text-background hover:opacity-90 transition-opacity cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
              >
                {isSaving && (
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
                {isSaving ? "Saving..." : "Save"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Success Toast */}
      {showSaveToast && (
        <div className="fixed top-16 right-6 z-50 animate-in slide-in-from-top-4 fade-in duration-300">
          <div className="flex items-center gap-3 bg-foreground text-background px-4 py-3 rounded-lg shadow-lg">
            <svg
              className="w-5 h-5 text-green-400"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={2}
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
              />
            </svg>
            <span className="text-sm font-medium">Saved successfully</span>
            <button
              onClick={() => setShowSaveToast(false)}
              className="ml-2 hover:opacity-70 transition-opacity cursor-pointer"
            >
              <svg
                className="w-4 h-4"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth={2}
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M6 18L18 6M6 6l12 12"
                />
              </svg>
            </button>
          </div>
        </div>
      )}

      <VerifyRequestPreviewDialog
        open={verifyDialogOpen}
        onClose={() => setVerifyDialogOpen(false)}
        onConfirm={handleVerifyConfirm}
        isVerifying={verify.isVerifying}
        verifyError={verify.verifyError}
        verifySampleResponse={verify.verifySampleResponse}
      />
    </div>
  );
}
