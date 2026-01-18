"use client";

import React, { useState, useEffect, useRef } from "react";
import Link from "next/link";
import { useSearchParams, useRouter } from "next/navigation";
import { useSession, signOut } from "next-auth/react";
import {
  AgentTabContent,
  ToolsTabContent,
  DataExtractionTabContent,
  TestsTabContent,
  SettingsTabContent,
  llmProviders,
} from "@/components/agent-tabs";
import type {
  LLMModel,
  DataExtractionFieldData,
} from "@/components/agent-tabs";

export type AgentDetailHeaderState = {
  agentName: string;
  activeTab: string;
  isLoading: boolean;
  isSaving: boolean;
  onSave: () => void;
  onEditName: () => void;
};

type AgentDetailProps = {
  agentUuid: string;
  onHeaderStateChange?: (state: AgentDetailHeaderState) => void;
};

type AgentData = {
  uuid: string;
  name: string;
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

type TabType = "agent" | "tools" | "data-extraction" | "tests" | "settings";

const validTabs: TabType[] = [
  "agent",
  "tools",
  "data-extraction",
  "tests",
  "settings",
];

export function AgentDetail({
  agentUuid,
  onHeaderStateChange,
}: AgentDetailProps) {
  const searchParams = useSearchParams();
  const router = useRouter();
  const { data: session } = useSession();
  const backendAccessToken = (session as any)?.backendAccessToken;

  // Get initial tab from URL or default to "agent"
  const getInitialTab = (): TabType => {
    const tabParam = searchParams.get("tab");
    if (tabParam && validTabs.includes(tabParam as TabType)) {
      return tabParam as TabType;
    }
    return "agent";
  };

  const [agent, setAgent] = useState<AgentData | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<TabType>(getInitialTab);

  // Name editing dialog state
  const [isEditNameDialogOpen, setIsEditNameDialogOpen] = useState(false);
  const [editedName, setEditedName] = useState("");

  // Update URL when tab changes
  const handleTabChange = (tab: TabType) => {
    setActiveTab(tab);
    // Use replaceState to update URL without triggering navigation
    const params = new URLSearchParams(searchParams.toString());
    params.set("tab", tab);
    window.history.replaceState(null, "", `?${params.toString()}`);
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
            config: {
              system_prompt: systemPrompt,
              stt: { provider: sttProvider },
              tts: { provider: ttsProvider },
              llm: { model: selectedLLM?.id || "" },
              settings: { agent_speaks_first: agentSpeaksFirst },
              system_tools: { end_call: endConversationEnabled },
              data_extraction_fields: dataExtractionFields.map((field) => ({
                name: field.name,
                type: field.type,
                description: field.description,
                required: field.required,
              })),
            },
          }),
        });

        if (response.status === 401) {
          await signOut({ callbackUrl: "/login" });
          return;
        }

        if (!response.ok) {
          throw new Error("Failed to save agent");
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
    endConversationEnabled,
    dataExtractionFields,
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
      });
    }
  }, [agent?.name, activeTab, isLoading, isSaving, onHeaderStateChange]);

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
          <span className="text-base text-muted-foreground">
            Loading agent...
          </span>
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
    <div className="space-y-6">
      {/* Agent Header - only shown when not using external header */}
      {!onHeaderStateChange && (
        <div className="flex items-center justify-between -mt-4">
          <div className="flex items-center gap-3">
            <Link
              href="/agents"
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
            </Link>
            <h1
              className="text-xl font-semibold cursor-pointer hover:opacity-70 transition-opacity"
              onClick={handleOpenEditNameDialog}
              title="Click to edit name"
            >
              {agent.name}
            </h1>
          </div>
          <button
            onClick={() => saveRef.current()}
            disabled={isSaving}
            className="h-9 px-6 rounded-md text-sm font-medium bg-foreground text-background hover:opacity-90 transition-opacity cursor-pointer disabled:opacity-70 disabled:cursor-not-allowed flex items-center gap-2"
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
            {isSaving ? "" : "Save"}
          </button>
        </div>
      )}

      {/* Tabs Navigation */}
      <div className="flex items-center gap-6 border-b border-border">
        <button
          onClick={() => handleTabChange("agent")}
          className={`pb-2 text-base font-medium transition-colors cursor-pointer ${
            activeTab === "agent"
              ? "text-foreground border-b-2 border-foreground"
              : "text-muted-foreground hover:text-foreground"
          }`}
        >
          Agent
        </button>
        <button
          onClick={() => handleTabChange("tools")}
          className={`pb-2 text-base font-medium transition-colors cursor-pointer ${
            activeTab === "tools"
              ? "text-foreground border-b-2 border-foreground"
              : "text-muted-foreground hover:text-foreground"
          }`}
        >
          Tools
        </button>
        <button
          onClick={() => handleTabChange("data-extraction")}
          className={`pb-2 text-base font-medium transition-colors cursor-pointer ${
            activeTab === "data-extraction"
              ? "text-foreground border-b-2 border-foreground"
              : "text-muted-foreground hover:text-foreground"
          }`}
        >
          Data extraction
        </button>
        <button
          onClick={() => handleTabChange("tests")}
          className={`pb-2 text-base font-medium transition-colors cursor-pointer ${
            activeTab === "tests"
              ? "text-foreground border-b-2 border-foreground"
              : "text-muted-foreground hover:text-foreground"
          }`}
        >
          Tests
        </button>
        {/* Settings tab button - commented out to hide the tab */}
        <button
          onClick={() => handleTabChange("settings")}
          className={`pb-2 text-base font-medium transition-colors cursor-pointer ${
            activeTab === "settings"
              ? "text-foreground border-b-2 border-foreground"
              : "text-muted-foreground hover:text-foreground"
          }`}
        >
          Settings
        </button>
      </div>

      {/* Agent Tab Content */}
      {activeTab === "agent" && (
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
        <TestsTabContent agentUuid={agentUuid} agentName={agent.name} />
      )}

      {/* Settings Tab Content - commented out to hide the tab */}
      {activeTab === "settings" && (
        <SettingsTabContent
          agentSpeaksFirst={agentSpeaksFirst}
          setAgentSpeaksFirst={setAgentSpeaksFirst}
        />
      )}

      {/* Edit Name Dialog */}
      {isEditNameDialogOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50"
          onClick={handleCancelEditName}
        >
          <div
            className="bg-background border border-border rounded-xl p-6 max-w-md w-full mx-4 shadow-lg"
            onClick={(e) => e.stopPropagation()}
          >
            <h2 className="text-lg font-semibold mb-4">Edit Agent Name</h2>
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
              className="w-full h-10 px-3 rounded-md text-sm border border-border bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-accent focus:border-transparent mb-4"
              maxLength={50}
              autoFocus
            />
            <div className="flex items-center justify-end gap-3">
              <button
                onClick={handleCancelEditName}
                className="h-10 px-4 rounded-md text-sm font-medium border border-border bg-background hover:bg-muted/50 transition-colors cursor-pointer"
              >
                Cancel
              </button>
              <button
                onClick={handleSaveName}
                disabled={!editedName.trim()}
                className="h-10 px-4 rounded-md text-sm font-medium bg-foreground text-background hover:opacity-90 transition-opacity cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Save
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Success Toast */}
      {showSaveToast && (
        <div className="fixed bottom-6 right-6 z-50 animate-in slide-in-from-bottom-4 fade-in duration-300">
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
    </div>
  );
}
