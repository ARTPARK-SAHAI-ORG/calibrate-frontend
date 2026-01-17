"use client";

import React, { useState, useEffect, useRef } from "react";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { useSession, signOut } from "next-auth/react";
import { AppLayout } from "@/components/AppLayout";
import { Agent } from "@/components/AgentPicker";
import { PickerItem } from "@/components/MultiSelectPicker";
import {
  SimulationConfigTab,
  SimulationRunsTab,
} from "@/components/simulation-tabs";

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
  const { data: session } = useSession();
  const backendAccessToken = (session as any)?.backendAccessToken;
  const uuid = params.uuid as string;
  const [sidebarOpen, setSidebarOpen] = useState(true);
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

  // Configuration state (whether config has been saved/created)
  const [isConfigured, setIsConfigured] = useState(false);
  const [isCreating, setIsCreating] = useState(false);

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
          setSelectedAgent({
            uuid: data.agent.uuid,
            name: data.agent.name,
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
      <span className="text-base font-semibold text-foreground">
        {isLoading ? "Loading..." : simulation?.name || "Simulation"}
      </span>
    </div>
  );

  // Launch button for header actions
  const headerActions =
    !isLoading && !error && simulation && isConfigured ? (
      <div className="relative mr-2" ref={launchDropdownRef}>
        <button
          onClick={() => setLaunchDropdownOpen(!launchDropdownOpen)}
          disabled={isLaunching}
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

        {/* Dropdown Menu */}
        {launchDropdownOpen && (
          <div className="absolute right-0 top-full mt-2 bg-popover border border-border rounded-xl shadow-xl z-50 overflow-hidden min-w-[180px]">
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
            <button
              onClick={() => handleLaunch("voice")}
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
                  d="M12 18.75a6 6 0 006-6v-1.5m-6 7.5a6 6 0 01-6-6v-1.5m6 7.5v3.75m-3.75 0h7.5M12 15.75a3 3 0 01-3-3V4.5a3 3 0 116 0v8.25a3 3 0 01-3 3z"
                />
              </svg>
              Voice Simulation
            </button>
          </div>
        )}
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
      <div className="space-y-6">
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
          <div className="border border-border rounded-xl p-12 flex flex-col items-center justify-center bg-muted/20">
            <p className="text-base text-red-500 mb-2">{error}</p>
            <button
              onClick={() => window.location.reload()}
              className="text-base text-muted-foreground hover:text-foreground transition-colors cursor-pointer"
            >
              Retry
            </button>
          </div>
        ) : simulation ? (
          <div className="space-y-6">
            {/* Tabs - only shown when configured */}
            {isConfigured && (
              <div className="flex gap-6 border-b border-border">
                <button
                  onClick={() => {
                    setActiveTab("config");
                    router.push(`/simulations/${uuid}?tab=config`, {
                      scroll: false,
                    });
                  }}
                  className={`pb-2 text-base font-medium transition-colors cursor-pointer ${
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
                    router.push(`/simulations/${uuid}?tab=runs`, {
                      scroll: false,
                    });
                  }}
                  className={`pb-2 text-base font-medium transition-colors cursor-pointer ${
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
                onPersonasChange={setSelectedPersonas}
                personasLoading={personasLoading}
                scenarios={scenarios}
                selectedScenarios={selectedScenarios}
                onScenariosChange={setSelectedScenarios}
                scenariosLoading={scenariosLoading}
                metrics={metrics}
                selectedMetrics={selectedMetrics}
                onMetricsChange={setSelectedMetrics}
                metricsLoading={metricsLoading}
                isConfigured={isConfigured}
                isCreating={isCreating}
                onCreateClick={handleCreate}
              />
            )}

            {/* Runs Tab Content - only shown when configured */}
            {isConfigured && activeTab === "runs" && (
              <SimulationRunsTab simulationUuid={uuid} />
            )}
          </div>
        ) : null}
      </div>
    </AppLayout>
  );
}
