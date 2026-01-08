"use client";

import { useState, useEffect } from "react";

type Agent = {
  uuid: string;
  name: string;
  createdAt: string; // Formatted display date
  createdAtRaw: string; // Original date for sorting
};

type AgentsProps = {
  onNavigateToAgent?: (agentUuid: string) => void;
};

// Format date to match the display format
const formatDate = (dateString: string): string => {
  try {
    const date = new Date(dateString);
    return date.toLocaleString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
      hour: "numeric",
      minute: "2-digit",
      hour12: true,
    });
  } catch {
    return dateString;
  }
};

export function Agents({ onNavigateToAgent }: AgentsProps) {
  const [searchQuery, setSearchQuery] = useState("");
  const [sortOrder, setSortOrder] = useState<"asc" | "desc">("desc");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [agents, setAgents] = useState<Agent[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [deletingAgentUuid, setDeletingAgentUuid] = useState<string | null>(
    null
  );

  useEffect(() => {
    const fetchAgents = async () => {
      try {
        setIsLoading(true);
        setError(null);
        const backendUrl = process.env.NEXT_PUBLIC_BACKEND_URL;
        if (!backendUrl) {
          throw new Error("BACKEND_URL environment variable is not set");
        }

        const response = await fetch(`${backendUrl}/agents`, {
          method: "GET",
          headers: {
            accept: "application/json",
            "ngrok-skip-browser-warning": "true",
          },
        });

        if (!response.ok) {
          throw new Error("Failed to fetch agents");
        }

        const data = await response.json();
        // Transform API response to match our Agent type
        const formattedAgents: Agent[] = Array.isArray(data)
          ? data.map((agent: any) => {
              const rawDate =
                agent.created_at || agent.createdAt || new Date().toISOString();
              return {
                uuid: agent.uuid,
                name: agent.name || agent.agent_name || String(agent),
                createdAt: formatDate(rawDate),
                createdAtRaw: rawDate,
              };
            })
          : [];
        setAgents(formattedAgents);
      } catch (err) {
        console.error("Error fetching agents:", err);
        setError(err instanceof Error ? err.message : "Failed to load agents");
      } finally {
        setIsLoading(false);
      }
    };

    fetchAgents();
  }, []);

  const filteredAgents = agents.filter((agent) =>
    agent.name.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const sortedAgents = [...filteredAgents].sort((a, b) => {
    // Use raw date for accurate sorting
    const dateA = new Date(a.createdAtRaw).getTime();
    const dateB = new Date(b.createdAtRaw).getTime();
    // Handle invalid dates by falling back to string comparison
    if (isNaN(dateA) || isNaN(dateB)) {
      return sortOrder === "asc"
        ? a.createdAtRaw.localeCompare(b.createdAtRaw)
        : b.createdAtRaw.localeCompare(a.createdAtRaw);
    }
    return sortOrder === "asc" ? dateA - dateB : dateB - dateA;
  });

  const handleDeleteAgent = async (agentUuid: string) => {
    if (!confirm("Are you sure you want to delete this agent?")) {
      return;
    }

    try {
      setDeletingAgentUuid(agentUuid);
      const backendUrl = process.env.NEXT_PUBLIC_BACKEND_URL;
      if (!backendUrl) {
        throw new Error("BACKEND_URL environment variable is not set");
      }

      // DELETE /agents/{agent_uuid} - agent_uuid is required in path
      const response = await fetch(`${backendUrl}/agents/${agentUuid}`, {
        method: "DELETE",
        headers: {
          accept: "application/json",
          "ngrok-skip-browser-warning": "true",
        },
      });

      if (!response.ok) {
        throw new Error("Failed to delete agent");
      }

      // Remove the agent from the list
      setAgents((prevAgents) =>
        prevAgents.filter((agent) => agent.uuid !== agentUuid)
      );
    } catch (err) {
      console.error("Error deleting agent:", err);
      alert(
        err instanceof Error
          ? err.message
          : "Failed to delete agent. Please try again."
      );
    } finally {
      setDeletingAgentUuid(null);
    }
  };

  const toggleSort = () => {
    setSortOrder(sortOrder === "asc" ? "desc" : "asc");
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-semibold tracking-tight">Agents</h2>
        <button
          onClick={() => setDialogOpen(true)}
          className="h-9 px-4 rounded-md text-[13px] font-medium bg-foreground text-background hover:opacity-90 transition-opacity cursor-pointer flex items-center gap-2"
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
              d="M12 4.5v15m7.5-7.5h-15"
            />
          </svg>
          New agent
        </button>
      </div>

      {/* Search Bar */}
      <div className="relative">
        <div className="absolute inset-y-0 left-0 flex items-center pl-3 pointer-events-none">
          <svg
            className="w-4 h-4 text-muted-foreground"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={2}
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z"
            />
          </svg>
        </div>
        <input
          type="text"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          placeholder="Search agents"
          className="w-full h-10 pl-10 pr-4 rounded-md text-[13px] border border-border bg-background text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-accent focus:border-transparent"
        />
      </div>

      {/* Table */}
      {isLoading ? (
        <div className="border rounded-xl p-8 flex items-center justify-center">
          <div className="flex items-center gap-3">
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
            <span className="text-[13px] text-muted-foreground">
              Loading agents...
            </span>
          </div>
        </div>
      ) : error ? (
        <div className="border rounded-xl p-8 flex items-center justify-center">
          <div className="text-center">
            <p className="text-[13px] text-red-500 mb-2">{error}</p>
            <button
              onClick={() => window.location.reload()}
              className="text-[13px] text-muted-foreground hover:text-foreground transition-colors cursor-pointer"
            >
              Retry
            </button>
          </div>
        </div>
      ) : sortedAgents.length === 0 ? (
        <div className="border rounded-xl p-12 flex flex-col items-center justify-center">
          <div className="text-center space-y-3">
            <svg
              className="w-12 h-12 mx-auto text-muted-foreground"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={1.5}
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M15 19.128a9.38 9.38 0 002.625.372 9.337 9.337 0 004.121-.952 4.125 4.125 0 00-7.533-2.493M15 19.128v-.003c0-1.113-.285-2.16-.786-3.07M15 19.128v.106A12.318 12.318 0 018.624 21c-2.331 0-4.512-.645-6.374-1.766l-.001-.109a6.375 6.375 0 0111.964-3.07M12 6.375a3.375 3.375 0 11-6.75 0 3.375 3.375 0 016.75 0zm8.25 2.25a2.625 2.625 0 11-5.25 0 2.625 2.625 0 015.25 0z"
              />
            </svg>
            <div>
              <p className="text-[15px] font-medium text-foreground mb-1">
                No agents yet
              </p>
              <p className="text-[13px] text-muted-foreground">
                Get started by creating your first agent
              </p>
            </div>
          </div>
        </div>
      ) : (
        <div className="border rounded-xl overflow-hidden">
          <table className="w-full">
            <thead className="bg-muted/50 border-b border-border">
              <tr>
                <th className="px-4 py-3 text-left text-[13px] font-medium text-foreground">
                  Name
                </th>
                <th className="px-4 py-3 text-left text-[13px] font-medium text-foreground">
                  <button
                    onClick={toggleSort}
                    className="flex items-center gap-2 hover:text-foreground transition-colors cursor-pointer"
                  >
                    Created at
                    <svg
                      className={`w-4 h-4 transition-transform ${
                        sortOrder === "asc" ? "rotate-180" : ""
                      }`}
                      fill="none"
                      viewBox="0 0 24 24"
                      stroke="currentColor"
                      strokeWidth={2}
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        d="M19.5 13.5L12 21m0 0l-7.5-7.5M12 21V3"
                      />
                    </svg>
                  </button>
                </th>
                <th className="px-4 py-3 text-right text-[13px] font-medium text-foreground w-20">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody>
              {sortedAgents.map((agent) => (
                <tr
                  key={agent.uuid}
                  onClick={() => {
                    if (onNavigateToAgent) {
                      onNavigateToAgent(agent.uuid);
                    }
                  }}
                  className="border-b border-border last:border-b-0 hover:bg-muted/30 transition-colors cursor-pointer"
                >
                  <td className="px-4 py-3 text-[13px] text-foreground">
                    {agent.name}
                  </td>
                  <td className="px-4 py-3 text-[13px] text-foreground">
                    {agent.createdAt}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        handleDeleteAgent(agent.uuid);
                      }}
                      disabled={deletingAgentUuid === agent.uuid}
                      className="inline-flex items-center justify-center w-8 h-8 rounded-md text-[13px] text-red-500 hover:bg-red-500/10 hover:text-red-600 transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
                      title="Delete agent"
                    >
                      {deletingAgentUuid === agent.uuid ? (
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
                      ) : (
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
                            d="M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 01-2.244 2.077H8.084a2.25 2.25 0 01-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 00-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 013.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 00-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 00-7.5 0"
                          />
                        </svg>
                      )}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* New Agent Dialog */}
      {dialogOpen && (
        <NewAgentDialog
          onClose={() => setDialogOpen(false)}
          onCreateAgent={onNavigateToAgent}
        />
      )}
    </div>
  );
}

function NewAgentDialog({
  onClose,
  onCreateAgent,
}: {
  onClose: () => void;
  onCreateAgent?: (agentUuid: string) => void;
}) {
  const [agentName, setAgentName] = useState("");
  const [isCreating, setIsCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const maxLength = 50;

  const handleCreate = async () => {
    if (!agentName.trim()) return;

    try {
      setIsCreating(true);
      setError(null);
      const backendUrl = process.env.NEXT_PUBLIC_BACKEND_URL;
      if (!backendUrl) {
        throw new Error("BACKEND_URL environment variable is not set");
      }

      const response = await fetch(`${backendUrl}/agents`, {
        method: "POST",
        headers: {
          accept: "application/json",
          "Content-Type": "application/json",
          "ngrok-skip-browser-warning": "true",
        },
        body: JSON.stringify({
          name: agentName.trim(),
          config: {},
        }),
      });

      if (!response.ok) {
        throw new Error("Failed to create agent");
      }

      const data = await response.json();
      const agentUuid = data.uuid;

      if (agentUuid && onCreateAgent) {
        onClose(); // Close dialog first
        onCreateAgent(agentUuid);
      }
    } catch (err) {
      console.error("Error creating agent:", err);
      setError(err instanceof Error ? err.message : "Failed to create agent");
    } finally {
      setIsCreating(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50"
      onClick={onClose}
    >
      <div
        className="bg-background border border-border rounded-xl p-8 max-w-lg w-full mx-4 shadow-lg"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="mb-6">
          <h2 className="text-2xl font-semibold tracking-tight mb-1">
            Complete your agent
          </h2>
          <p className="text-muted-foreground text-[15px]">
            Choose a name that reflects your agent's purpose
          </p>
        </div>

        {/* Agent Name Input */}
        <div className="mb-6">
          <label className="block text-[13px] font-medium text-foreground mb-2">
            Agent Name <span className="text-red-500">*</span>
          </label>
          <div className="relative">
            <input
              type="text"
              value={agentName}
              onChange={(e) => {
                if (e.target.value.length <= maxLength) {
                  setAgentName(e.target.value);
                }
              }}
              placeholder="Enter agent name"
              className="w-full h-10 px-3 pr-16 rounded-md text-[13px] border border-border bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-accent focus:border-transparent"
              maxLength={maxLength}
            />
            <div className="absolute inset-y-0 right-0 flex items-center pr-3 pointer-events-none">
              <span className="text-[12px] text-muted-foreground">
                {agentName.length}/{maxLength}
              </span>
            </div>
          </div>
        </div>

        {/* Error Message */}
        {error && (
          <div className="mb-6 p-3 rounded-md bg-red-500/10 border border-red-500/20">
            <p className="text-[13px] text-red-500">{error}</p>
          </div>
        )}

        {/* Footer Buttons */}
        <div className="flex items-center justify-between">
          <button
            onClick={onClose}
            className="h-9 px-4 rounded-md text-[13px] font-medium bg-muted text-foreground hover:bg-muted/80 transition-colors cursor-pointer flex items-center gap-2"
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
                d="M15.75 19.5L8.25 12l7.5-7.5"
              />
            </svg>
            Back
          </button>
          <button
            onClick={handleCreate}
            disabled={!agentName.trim() || isCreating}
            className="h-9 px-4 rounded-md text-[13px] font-medium bg-foreground text-background hover:opacity-90 transition-opacity cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
          >
            {isCreating ? (
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
                Creating...
              </>
            ) : (
              "Create Agent"
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
