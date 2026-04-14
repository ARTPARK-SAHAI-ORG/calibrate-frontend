"use client";

import React, { useState, useEffect, useRef } from "react";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { signOut } from "next-auth/react";
import { useAccessToken } from "@/hooks";
import { toast } from "sonner";
import { AppLayout } from "@/components/AppLayout";
import { Agent } from "@/components/AgentPicker";
import { PickerItem } from "@/components/MultiSelectPicker";
import {
  SimulationConfigTab,
  SimulationRunsTab,
} from "@/components/simulation-tabs";
import { LIMITS, CONTACT_LINK } from "@/constants/limits";
import { useSidebarState } from "@/lib/sidebar";

type PersonaData = {
  uuid: string;
  name: string;
  description: string;
  config?: Record<string, any>;
  created_at: string;
  updated_at: string;
};

type ScenarioData = {
  uuid: string;
  name: string;
  description: string;
  created_at: string;
  updated_at: string;
};

type MetricData = {
  uuid: string;
  name: string;
  description: string;
  config?: Record<string, any> | null;
  created_at: string;
  updated_at: string;
};

type AgentData = {
  uuid: string;
  name: string;
  type?: "agent" | "connection";
  config?: Record<string, any>;
  created_at: string;
  updated_at: string;
};

type SimulationData = {
  uuid: string;
  name: string;
  description?: string;
  status?: "pending" | "running" | "completed" | "failed";
  created_at: string;
  updated_at: string;
  agent?: AgentData;
  personas?: PersonaData[];
  scenarios?: ScenarioData[];
  metrics?: MetricData[];
};

export default function SimulationDetailPage() {
  const router = useRouter();
  const params = useParams();
  const searchParams = useSearchParams();
  const backendAccessToken = useAccessToken();
  const uuid = params.uuid as string;
  const [sidebarOpen, setSidebarOpen] = useSidebarState();
  const [simulation, setSimulation] = useState<SimulationData | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Form state
  const [selectedAgent, setSelectedAgent] = useState<Agent | null>(null);

  // Personas state
  const [personas, setPersonas] = useState<PickerItem[]>([]);
  const [personasLoading, setPersonasLoading] = useState(false);
  const [selectedPersonas, setSelectedPersonas] = useState<PickerItem[]>([]);

  // Scenarios state
  const [scenarios, setScenarios] = useState<PickerItem[]>([]);
  const [scenariosLoading, setScenariosLoading] = useState(false);
  const [selectedScenarios, setSelectedScenarios] = useState<PickerItem[]>([]);

  // Metrics state
  const [metrics, setMetrics] = useState<PickerItem[]>([]);
  const [metricsLoading, setMetricsLoading] = useState(false);
  const [selectedMetrics, setSelectedMetrics] = useState<PickerItem[]>([]);

  // Tab state
  type TabType = "config" | "runs";
  const [activeTab, setActiveTab] = useState<TabType>("config");

  // Tab display names for page title
  const tabDisplayNames: Record<TabType, string> = {
    config: "Config",
    runs: "Runs",
  };

  // Set page title when simulation or tab changes
  useEffect(() => {
    if (simulation?.name) {
      const tabName = tabDisplayNames[activeTab];
      document.title = `${simulation.name} - ${tabName} | Calibrate`;
    } else {
      document.title = "Simulation | Calibrate";
    }
  }, [simulation?.name, activeTab]);

  // Configuration state (whether config has been saved/created)
  const [isConfigured, setIsConfigured] = useState(false);
  const [isCreating, setIsCreating] = useState(false);

  // Name editing state
  const [isEditNameDialogOpen, setIsEditNameDialogOpen] = useState(false);
  const [editedName, setEditedName] = useState("");
  const [isSavingName, setIsSavingName] = useState(false);

  // Launch dropdown state
  const [launchDropdownOpen, setLaunchDropdownOpen] = useState(false);
  const [isLaunching, setIsLaunching] = useState(false);
  const launchDropdownRef = useRef<HTMLDivElement>(null);

  // Close launch dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (
        launchDropdownRef.current &&
        !launchDropdownRef.current.contains(event.target as Node)
      ) {
        setLaunchDropdownOpen(false);
      }
    };

    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  // Handle personas change with limit check
  const handlePersonasChange = (items: PickerItem[]) => {
    if (items.length > LIMITS.SIMULATION_MAX_PERSONAS) {
      toast.error(
        <span>
          You can only select up to {LIMITS.SIMULATION_MAX_PERSONAS} personas at
          a time.{" "}
          <a
            href={CONTACT_LINK}
            target="_blank"
            rel="noopener noreferrer"
            className="underline"
          >
            Contact us
          </a>{" "}
          to extend your limits.
        </span>
      );
      return;
    }
    setSelectedPersonas(items);
  };

  // Handle scenarios change with limit check
  const handleScenariosChange = (items: PickerItem[]) => {
    if (items.length > LIMITS.SIMULATION_MAX_SCENARIOS) {
      toast.error(
        <span>
          You can only select up to {LIMITS.SIMULATION_MAX_SCENARIOS} scenarios
          at a time.{" "}
          <a
            href={CONTACT_LINK}
            target="_blank"
            rel="noopener noreferrer"
            className="underline"
          >
            Contact us
          </a>{" "}
          to extend your limits.
        </span>
      );
      return;
    }
    setSelectedScenarios(items);
  };

  // Set active tab from query parameter
  useEffect(() => {
    const tab = searchParams.get("tab");
    if (tab === "runs" || tab === "config") {
      setActiveTab(tab);
    }
  }, [searchParams]);

  const handleLaunch = async (type: "text" | "voice") => {
    setLaunchDropdownOpen(false);
    setIsLaunching(true);

    try {
      const backendUrl = process.env.NEXT_PUBLIC_BACKEND_URL;
      if (!backendUrl) {
        throw new Error("BACKEND_URL environment variable is not set");
      }

      const response = await fetch(`${backendUrl}/simulations/${uuid}/run`, {
        method: "POST",
        headers: {
          accept: "application/json",
          "Content-Type": "application/json",
          "ngrok-skip-browser-warning": "true",
          Authorization: `Bearer ${backendAccessToken}`,
        },
        body: JSON.stringify({
          type: type === "voice" ? "voice" : "text",
        }),
      });

      if (response.status === 401) {
        await signOut({ callbackUrl: "/login" });
        return;
      }

      if (!response.ok) {
        throw new Error("Failed to launch simulation");
      }

      const data = await response.json();
      const runId = data.run_id || data.task_id || data.id;

      if (!runId) {
        throw new Error("No run ID returned from API");
      }

      router.push(`/simulations/${uuid}/runs/${runId}`);
    } catch (err) {
      console.error("Error launching simulation:", err);
      alert(err instanceof Error ? err.message : "Failed to launch simulation");
    } finally {
      setIsLaunching(false);
    }
  };

  const handleCreate = async () => {
    if (!simulation) return;

    try {
      setIsCreating(true);
      const backendUrl = process.env.NEXT_PUBLIC_BACKEND_URL;
      if (!backendUrl) {
        throw new Error("BACKEND_URL environment variable is not set");
      }

      const payload = {
        name: simulation.name,
        agent_uuid: selectedAgent?.uuid,
        persona_uuids: selectedPersonas.map((p) => p.uuid),
        scenario_uuids: selectedScenarios.map((s) => s.uuid),
        metric_uuids: selectedMetrics.map((m) => m.uuid),
      };

      const response = await fetch(`${backendUrl}/simulations/${uuid}`, {
        method: "PUT",
        headers: {
          accept: "application/json",
          "Content-Type": "application/json",
          "ngrok-skip-browser-warning": "true",
          Authorization: `Bearer ${backendAccessToken}`,
        },
        body: JSON.stringify(payload),
      });

      if (response.status === 401) {
        await signOut({ callbackUrl: "/login" });
        return;
      }

      if (!response.ok) {
        throw new Error("Failed to update simulation");
      }

      setIsConfigured(true);
    } catch (err) {
      console.error("Error updating simulation:", err);
      alert(err instanceof Error ? err.message : "Failed to update simulation");
    } finally {
      setIsCreating(false);
    }
  };

  // Fetch simulation
  useEffect(() => {
    const fetchSimulation = async () => {
      if (!backendAccessToken) return;

      try {
        setIsLoading(true);
        setError(null);
        const backendUrl = process.env.NEXT_PUBLIC_BACKEND_URL;
        if (!backendUrl) {
          throw new Error("BACKEND_URL environment variable is not set");
        }

        const response = await fetch(`${backendUrl}/simulations/${uuid}`, {
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
          throw new Error("Failed to fetch simulation");
        }

        const data: SimulationData = await response.json();
        setSimulation(data);

        // Pre-populate agent if present
        if (data.agent) {
          const agentType = data.agent.type === "connection" ? "connection" : "agent";
          setSelectedAgent({
            uuid: data.agent.uuid,
            name: data.agent.name,
            type: agentType,
            verified:
              agentType === "connection"
                ? data.agent.config?.connection_verified === true
                : true,
          });
        }

        // Check if simulation is already configured (has personas, scenarios, or metrics)
        const hasPersonas = data.personas && data.personas.length > 0;
        const hasScenarios = data.scenarios && data.scenarios.length > 0;
        const hasMetrics = data.metrics && data.metrics.length > 0;

        if (hasPersonas || hasScenarios || hasMetrics) {
          setIsConfigured(true);

          // Pre-populate selected items from the simulation data
          if (data.personas) {
            setSelectedPersonas(
              data.personas.map((p) => ({
                uuid: p.uuid,
                name: p.name,
                description: p.description,
              }))
            );
          }
          if (data.scenarios) {
            setSelectedScenarios(
              data.scenarios.map((s) => ({
                uuid: s.uuid,
                name: s.name,
                description: s.description,
              }))
            );
          }
          if (data.metrics) {
            setSelectedMetrics(
              data.metrics.map((m) => ({
                uuid: m.uuid,
                name: m.name,
                description: m.description,
              }))
            );
          }
        }
      } catch (err) {
        console.error("Error fetching simulation:", err);
        setError(
          err instanceof Error ? err.message : "Failed to load simulation"
        );
      } finally {
        setIsLoading(false);
      }
    };

    if (uuid && backendAccessToken) {
      fetchSimulation();
    }
  }, [uuid, backendAccessToken]);

  // Fetch personas
  useEffect(() => {
    const fetchPersonas = async () => {
      if (!backendAccessToken) return;

      try {
        setPersonasLoading(true);
        const backendUrl = process.env.NEXT_PUBLIC_BACKEND_URL;
        if (!backendUrl) return;

        const response = await fetch(`${backendUrl}/personas`, {
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
          throw new Error("Failed to fetch personas");
        }

        const data = await response.json();
        const formattedPersonas: PickerItem[] = Array.isArray(data)
          ? data.map((p: any) => ({
              uuid: p.uuid,
              name: p.name,
              description: p.description,
            }))
          : [];
        setPersonas(formattedPersonas);
      } catch (err) {
        console.error("Error fetching personas:", err);
      } finally {
        setPersonasLoading(false);
      }
    };

    fetchPersonas();
  }, [backendAccessToken]);

  // Fetch scenarios
  useEffect(() => {
    const fetchScenarios = async () => {
      if (!backendAccessToken) return;

      try {
        setScenariosLoading(true);
        const backendUrl = process.env.NEXT_PUBLIC_BACKEND_URL;
        if (!backendUrl) return;

        const response = await fetch(`${backendUrl}/scenarios`, {
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
          throw new Error("Failed to fetch scenarios");
        }

        const data = await response.json();
        const formattedScenarios: PickerItem[] = Array.isArray(data)
          ? data.map((s: any) => ({
              uuid: s.uuid,
              name: s.name,
              description: s.description,
            }))
          : [];
        setScenarios(formattedScenarios);
      } catch (err) {
        console.error("Error fetching scenarios:", err);
      } finally {
        setScenariosLoading(false);
      }
    };

    fetchScenarios();
  }, [backendAccessToken]);

  // Fetch metrics
  useEffect(() => {
    const fetchMetrics = async () => {
      if (!backendAccessToken) return;

      try {
        setMetricsLoading(true);
        const backendUrl = process.env.NEXT_PUBLIC_BACKEND_URL;
        if (!backendUrl) return;

        const response = await fetch(`${backendUrl}/metrics`, {
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
          throw new Error("Failed to fetch metrics");
        }

        const data = await response.json();
        const formattedMetrics: PickerItem[] = Array.isArray(data)
          ? data.map((m: any) => ({
              uuid: m.uuid,
              name: m.name,
              description: m.description,
            }))
          : [];
        setMetrics(formattedMetrics);
      } catch (err) {
        console.error("Error fetching metrics:", err);
      } finally {
        setMetricsLoading(false);
      }
    };

    fetchMetrics();
  }, [backendAccessToken]);

  // Name editing handlers
  const handleOpenEditName = () => {
    if (simulation) {
      setEditedName(simulation.name);
      setIsEditNameDialogOpen(true);
    }
  };

  const handleSaveName = async () => {
    if (!simulation || !editedName.trim() || editedName.trim() === simulation.name) {
      setIsEditNameDialogOpen(false);
      return;
    }

    try {
      setIsSavingName(true);
      const backendUrl = process.env.NEXT_PUBLIC_BACKEND_URL;
      if (!backendUrl) {
        throw new Error("BACKEND_URL environment variable is not set");
      }

      const response = await fetch(`${backendUrl}/simulations/${uuid}`, {
        method: "PUT",
        headers: {
          accept: "application/json",
          "Content-Type": "application/json",
          "ngrok-skip-browser-warning": "true",
          Authorization: `Bearer ${backendAccessToken}`,
        },
        body: JSON.stringify({ name: editedName.trim() }),
      });

      if (response.status === 401) {
        await signOut({ callbackUrl: "/login" });
        return;
      }

      if (!response.ok) {
        throw new Error("Failed to update simulation name");
      }

      setSimulation({ ...simulation, name: editedName.trim() });
      setIsEditNameDialogOpen(false);
      toast.success("Simulation name updated");
    } catch (err) {
      console.error("Error saving simulation name:", err);
      toast.error(err instanceof Error ? err.message : "Failed to save name");
    } finally {
      setIsSavingName(false);
    }
  };

  const handleCancelEditName = () => {
    setIsEditNameDialogOpen(false);
    setEditedName("");
  };

  // Header with back button and simulation name
  const customHeader = (
    <div className="flex items-center gap-3">
      <button
        onClick={() => router.push("/simulations")}
        className="flex items-center justify-center w-8 h-8 rounded-md hover:bg-muted transition-colors cursor-pointer"
        title="Back to simulations"
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
        className={`text-base font-semibold text-foreground ${
          !isLoading && simulation ? "cursor-pointer hover:opacity-70 transition-opacity" : ""
        }`}
        onClick={!isLoading && simulation ? handleOpenEditName : undefined}
        title={!isLoading && simulation ? "Click to edit name" : undefined}
      >
        {isLoading ? "Loading..." : simulation?.name || "Simulation"}
      </span>
    </div>
  );

  const isAgentUnverified = selectedAgent?.verified === false;
  const [isVerifying, setIsVerifying] = useState(false);
  const [verifyError, setVerifyError] = useState<string | null>(null);
  const [verifySampleResponse, setVerifySampleResponse] = useState<Record<string, unknown> | null>(null);

  const handleVerifyAgent = async () => {
    if (!selectedAgent) return;

    try {
      setIsVerifying(true);
      setVerifyError(null);
      setVerifySampleResponse(null);
      const backendUrl = process.env.NEXT_PUBLIC_BACKEND_URL;
      if (!backendUrl) {
        throw new Error("BACKEND_URL environment variable is not set");
      }

      const response = await fetch(
        `${backendUrl}/agents/${selectedAgent.uuid}/verify-connection`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            accept: "application/json",
            "ngrok-skip-browser-warning": "true",
            Authorization: `Bearer ${backendAccessToken}`,
          },
          body: JSON.stringify({}),
        }
      );

      if (response.status === 401) {
        await signOut({ callbackUrl: "/login" });
        return;
      }

      if (!response.ok) {
        throw new Error("Verification request failed");
      }

      const result = await response.json();

      if (result.success) {
        setSelectedAgent({ ...selectedAgent, verified: true });
        toast.success("Agent connection verified successfully");
      } else {
        setVerifyError(result.error || "Connection verification failed");
        setVerifySampleResponse(result.sample_response ?? null);
      }
    } catch (err) {
      console.error("Error verifying agent connection:", err);
      setVerifyError(err instanceof Error ? err.message : "Verification failed");
    } finally {
      setIsVerifying(false);
    }
  };

  // Launch button for header actions
  const headerActions =
    !isLoading && !error && simulation && isConfigured ? (
      <div className="flex items-center gap-2 mr-2">
        {isAgentUnverified && (
          <div className="relative">
            <button
              onClick={handleVerifyAgent}
              disabled={isVerifying}
              className="h-8 px-4 rounded-md text-sm font-medium bg-yellow-500 text-black hover:bg-yellow-400 transition-colors cursor-pointer disabled:opacity-70 disabled:cursor-not-allowed flex items-center gap-2"
            >
              {isVerifying ? (
                <>
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
                  <span>Verifying...</span>
                </>
              ) : (
                <>
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
                      d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
                    />
                  </svg>
                  <span>Verify</span>
                </>
              )}
            </button>

            {(verifyError || verifySampleResponse) && (
              <>
                <div
                  className="fixed inset-0 z-[99]"
                  onClick={() => { setVerifyError(null); setVerifySampleResponse(null); }}
                />
                <div className="absolute right-0 top-full mt-2 w-80 bg-background border border-border rounded-xl shadow-xl z-[100] overflow-hidden">
                  <div className="flex items-center justify-between p-3 border-b border-border">
                    <span className="text-sm font-medium text-red-400">Verification Failed</span>
                    <button
                      onClick={() => { setVerifyError(null); setVerifySampleResponse(null); }}
                      className="w-6 h-6 flex items-center justify-center rounded-md hover:bg-muted transition-colors cursor-pointer"
                    >
                      <svg className="w-4 h-4 text-muted-foreground" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                      </svg>
                    </button>
                  </div>
                  <div className="p-3 space-y-2">
                    {verifyError && (
                      <p className="text-xs text-red-400">{verifyError}</p>
                    )}
                    {verifySampleResponse && (
                      <div className="space-y-1">
                        <p className="text-xs font-medium text-muted-foreground">
                          Your agent responded with:
                        </p>
                        <pre className="text-xs bg-muted rounded-lg p-3 overflow-x-auto text-foreground max-h-48 overflow-y-auto">
                          {JSON.stringify(verifySampleResponse, null, 2)}
                        </pre>
                      </div>
                    )}
                  </div>
                </div>
              </>
            )}
          </div>
        )}
        <div className="relative group" ref={launchDropdownRef}>
        <button
          onClick={() => !isAgentUnverified && setLaunchDropdownOpen(!launchDropdownOpen)}
          disabled={isLaunching || isAgentUnverified}
          className="h-8 px-4 rounded-md text-sm font-medium bg-foreground text-background hover:opacity-90 transition-opacity cursor-pointer disabled:opacity-70 disabled:cursor-not-allowed flex items-center gap-2"
        >
          {isLaunching ? (
            <>
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
              <span>Launching...</span>
            </>
          ) : (
            <>
              <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
                <path d="M8 5v14l11-7z" />
              </svg>
              <span>Launch</span>
              <svg
                className={`w-4 h-4 transition-transform ${
                  launchDropdownOpen ? "rotate-180" : ""
                }`}
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth={2}
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M19.5 8.25l-7.5 7.5-7.5-7.5"
                />
              </svg>
            </>
          )}
        </button>

        {isAgentUnverified && (
          <div className="absolute right-0 top-full mt-1 w-56 px-3 py-2 bg-foreground text-background text-xs rounded-lg shadow-lg opacity-0 group-hover:opacity-100 pointer-events-none transition-opacity z-[60]">
            Agent must be verified before launching a simulation
          </div>
        )}

        {/* Dropdown Menu */}
        {launchDropdownOpen && (
          <div className="absolute right-0 top-full mt-2 bg-background border border-border rounded-xl shadow-xl z-50 min-w-[180px]">
            <button
              onClick={() => handleLaunch("text")}
              disabled={isLaunching}
              className="w-full px-4 py-3 text-left text-sm text-foreground hover:bg-muted transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-3"
            >
              <svg
                className="w-5 h-5"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth={1.5}
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M8.625 12a.375.375 0 11-.75 0 .375.375 0 01.75 0zm0 0H8.25m4.125 0a.375.375 0 11-.75 0 .375.375 0 01.75 0zm0 0H12m4.125 0a.375.375 0 11-.75 0 .375.375 0 01.75 0zm0 0h-.375M21 12c0 4.556-4.03 8.25-9 8.25a9.764 9.764 0 01-2.555-.337A5.972 5.972 0 015.41 20.97a5.969 5.969 0 01-.474-.065 4.48 4.48 0 00.978-2.025c.09-.457-.133-.901-.467-1.226C3.93 16.178 3 14.189 3 12c0-4.556 4.03-8.25 9-8.25s9 3.694 9 8.25z"
                />
              </svg>
              Text Simulation
            </button>
            <div className="relative group/voice">
              <button
                onClick={() => handleLaunch("voice")}
                disabled={isLaunching || selectedAgent?.type === "connection"}
                className="w-full px-4 py-3 text-left text-sm text-foreground hover:bg-muted transition-colors cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed flex items-center gap-3 rounded-b-xl"
              >
                <svg
                  className="w-5 h-5"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                  strokeWidth={1.5}
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M12 18.75a6 6 0 006-6v-1.5m-6 7.5a6 6 0 01-6-6v-1.5m6 7.5v3.75m-3.75 0h7.5M12 15.75a3 3 0 01-3-3V4.5a3 3 0 116 0v8.25a3 3 0 01-3 3z"
                  />
                </svg>
                Voice Simulation
              </button>
              {selectedAgent?.type === "connection" && (
                <div className="absolute left-0 top-full mt-1 w-64 px-3 py-2 bg-foreground text-background text-xs rounded-lg shadow-lg opacity-0 group-hover/voice:opacity-100 pointer-events-none transition-opacity z-[60]">
                  Agent connections don&apos;t support voice simulations yet
                </div>
              )}
            </div>
          </div>
        )}
        </div>
      </div>
    ) : null;

  return (
    <AppLayout
      activeItem="simulations"
      onItemChange={(itemId) => router.push(`/${itemId}`)}
      sidebarOpen={sidebarOpen}
      onSidebarToggle={() => setSidebarOpen(!sidebarOpen)}
      customHeader={customHeader}
      headerActions={headerActions}
    >
      <div className="space-y-4 md:space-y-6 py-4 md:py-6">
        {/* Content */}
        {isLoading ? (
          <div className="flex items-center justify-center gap-3 py-8">
            <svg
              className="w-5 h-5 animate-spin"
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
          </div>
        ) : error ? (
          <div className="border border-border rounded-xl p-8 md:p-12 flex flex-col items-center justify-center bg-muted/20">
            <p className="text-sm md:text-base text-red-500 mb-2">{error}</p>
            <button
              onClick={() => window.location.reload()}
              className="text-sm md:text-base text-muted-foreground hover:text-foreground transition-colors cursor-pointer"
            >
              Retry
            </button>
          </div>
        ) : simulation ? (
          <div className="space-y-4 md:space-y-6">
            {/* Tabs - only shown when configured */}
            {isConfigured && (
              <div className="flex gap-4 md:gap-6 border-b border-border overflow-x-auto">
                <button
                  onClick={() => {
                    setActiveTab("config");
                    window.history.replaceState(
                      null,
                      "",
                      `/simulations/${uuid}?tab=config`
                    );
                  }}
                  className={`pb-2 text-sm md:text-base font-medium transition-colors cursor-pointer whitespace-nowrap ${
                    activeTab === "config"
                      ? "text-foreground border-b-2 border-foreground"
                      : "text-muted-foreground hover:text-foreground"
                  }`}
                >
                  Config
                </button>
                <button
                  onClick={() => {
                    setActiveTab("runs");
                    window.history.replaceState(
                      null,
                      "",
                      `/simulations/${uuid}?tab=runs`
                    );
                  }}
                  className={`pb-2 text-sm md:text-base font-medium transition-colors cursor-pointer whitespace-nowrap ${
                    activeTab === "runs"
                      ? "text-foreground border-b-2 border-foreground"
                      : "text-muted-foreground hover:text-foreground"
                  }`}
                >
                  Runs
                </button>
              </div>
            )}

            {/* Config Tab Content - shown when not configured OR when Config tab is active */}
            {(!isConfigured || activeTab === "config") && (
              <SimulationConfigTab
                selectedAgent={selectedAgent}
                onSelectAgent={setSelectedAgent}
                personas={personas}
                selectedPersonas={selectedPersonas}
                onPersonasChange={handlePersonasChange}
                personasLoading={personasLoading}
                scenarios={scenarios}
                selectedScenarios={selectedScenarios}
                onScenariosChange={handleScenariosChange}
                scenariosLoading={scenariosLoading}
                metrics={metrics}
                selectedMetrics={selectedMetrics}
                onMetricsChange={setSelectedMetrics}
                metricsLoading={metricsLoading}
                isConfigured={isConfigured}
                isCreating={isCreating}
                onCreateClick={handleCreate}
                isAgentConnection={selectedAgent?.type === "connection"}
              />
            )}

            {/* Runs Tab Content - only shown when configured */}
            {isConfigured && activeTab === "runs" && (
              <SimulationRunsTab simulationUuid={uuid} />
            )}
          </div>
        ) : null}
      </div>

      {/* Edit Name Dialog */}
      {isEditNameDialogOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
          onClick={handleCancelEditName}
        >
          <div
            className="bg-background border border-border rounded-xl p-5 md:p-6 max-w-md w-full shadow-lg"
            onClick={(e) => e.stopPropagation()}
          >
            <h2 className="text-base md:text-lg font-semibold mb-3 md:mb-4">
              Edit Simulation Name
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
                disabled={!editedName.trim() || isSavingName}
                className="h-9 md:h-10 px-4 rounded-md text-xs md:text-sm font-medium bg-foreground text-background hover:opacity-90 transition-opacity cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {isSavingName ? "Saving..." : "Save"}
              </button>
            </div>
          </div>
        </div>
      )}
    </AppLayout>
  );
}
