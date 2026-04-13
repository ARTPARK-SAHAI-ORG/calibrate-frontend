"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { signOut } from "next-auth/react";
import { DeleteConfirmationDialog } from "@/components/DeleteConfirmationDialog";
import { useHideFloatingButton } from "@/components/AppLayout";
import { useAccessToken } from "@/hooks";

type Agent = {
  uuid: string;
  name: string;
  type: "agent" | "connection";
  updatedAt: string; // Formatted display date
  updatedAtRaw: string; // Original date for sorting
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
  const backendAccessToken = useAccessToken();
  const [searchQuery, setSearchQuery] = useState("");
  const [sortOrder, setSortOrder] = useState<"asc" | "desc">("desc");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [agents, setAgents] = useState<Agent[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [deletingAgentUuid, setDeletingAgentUuid] = useState<string | null>(
    null,
  );

  // Delete confirmation state
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [agentToDelete, setAgentToDelete] = useState<Agent | null>(null);

  // Duplicate dialog state
  const [duplicateDialogOpen, setDuplicateDialogOpen] = useState(false);
  const [agentToDuplicate, setAgentToDuplicate] = useState<Agent | null>(null);

  // Hide the floating "Talk to Us" button when any dialog is open
  useHideFloatingButton(dialogOpen);
  useHideFloatingButton(duplicateDialogOpen);

  useEffect(() => {
    const fetchAgents = async () => {
      if (!backendAccessToken) return;

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
            Authorization: `Bearer ${backendAccessToken}`,
          },
        });

        if (response.status === 401) {
          await signOut({ callbackUrl: "/login" });
          return;
        }

        if (!response.ok) {
          throw new Error("Failed to fetch agents");
        }

        const data = await response.json();
        // Transform API response to match our Agent type
        const formattedAgents: Agent[] = Array.isArray(data)
          ? data.map((agent: any) => {
              const rawDate =
                agent.updated_at || agent.updatedAt || new Date().toISOString();
              return {
                uuid: agent.uuid,
                name: agent.name || agent.agent_name || String(agent),
                type: agent.type === "connection" ? "connection" : "agent",
                updatedAt: formatDate(rawDate),
                updatedAtRaw: rawDate,
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
  }, [backendAccessToken]);

  const filteredAgents = agents.filter((agent) =>
    agent.name.toLowerCase().includes(searchQuery.toLowerCase()),
  );

  const sortedAgents = [...filteredAgents].sort((a, b) => {
    // Use raw date for accurate sorting
    const dateA = new Date(a.updatedAtRaw).getTime();
    const dateB = new Date(b.updatedAtRaw).getTime();
    // Handle invalid dates by falling back to string comparison
    if (isNaN(dateA) || isNaN(dateB)) {
      return sortOrder === "asc"
        ? a.updatedAtRaw.localeCompare(b.updatedAtRaw)
        : b.updatedAtRaw.localeCompare(a.updatedAtRaw);
    }
    return sortOrder === "asc" ? dateA - dateB : dateB - dateA;
  });

  // Open delete confirmation dialog
  const openDeleteDialog = (agent: Agent) => {
    setAgentToDelete(agent);
    setDeleteDialogOpen(true);
  };

  // Close delete confirmation dialog
  const closeDeleteDialog = () => {
    if (!deletingAgentUuid) {
      setDeleteDialogOpen(false);
      setAgentToDelete(null);
    }
  };

  // Open duplicate dialog
  const openDuplicateDialog = (agent: Agent) => {
    setAgentToDuplicate(agent);
    setDuplicateDialogOpen(true);
  };

  // Close duplicate dialog
  const closeDuplicateDialog = () => {
    setDuplicateDialogOpen(false);
    setAgentToDuplicate(null);
  };

  // Handle agent duplicated - add to list
  const handleAgentDuplicated = (newAgent: Agent) => {
    setAgents((prevAgents) => [newAgent, ...prevAgents]);
  };

  const handleDeleteAgent = async () => {
    if (!agentToDelete) return;

    try {
      setDeletingAgentUuid(agentToDelete.uuid);
      const backendUrl = process.env.NEXT_PUBLIC_BACKEND_URL;
      if (!backendUrl) {
        throw new Error("BACKEND_URL environment variable is not set");
      }

      // DELETE /agents/{agent_uuid} - agent_uuid is required in path
      const response = await fetch(
        `${backendUrl}/agents/${agentToDelete.uuid}`,
        {
          method: "DELETE",
          headers: {
            accept: "application/json",
            "ngrok-skip-browser-warning": "true",
            Authorization: `Bearer ${backendAccessToken}`,
          },
        },
      );

      if (response.status === 401) {
        await signOut({ callbackUrl: "/login" });
        return;
      }

      if (!response.ok) {
        throw new Error("Failed to delete agent");
      }

      // Remove the agent from the list
      setAgents((prevAgents) =>
        prevAgents.filter((agent) => agent.uuid !== agentToDelete.uuid),
      );
      closeDeleteDialog();
    } catch (err) {
      console.error("Error deleting agent:", err);
    } finally {
      setDeletingAgentUuid(null);
    }
  };

  const toggleSort = () => {
    setSortOrder(sortOrder === "asc" ? "desc" : "asc");
  };

  return (
    <div className="space-y-4 md:space-y-6 py-4 md:py-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <h2 className="text-xl md:text-2xl font-semibold tracking-tight">
          Agents
        </h2>
        <button
          onClick={() => setDialogOpen(true)}
          className="h-9 md:h-10 px-4 rounded-md text-sm md:text-base font-medium bg-foreground text-background hover:opacity-90 transition-opacity cursor-pointer"
        >
          New agent
        </button>
      </div>

      {/* Search Bar */}
      <div className="relative">
        <div className="absolute inset-y-0 left-0 flex items-center pl-3 pointer-events-none">
          <svg
            className="w-5 h-5 text-muted-foreground"
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
          className="w-full h-9 md:h-10 pl-10 pr-4 rounded-md text-sm md:text-base border border-border bg-background text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-accent focus:border-transparent"
        />
      </div>

      {/* Table */}
      {isLoading ? (
        <div className="flex items-center justify-center py-12">
          <svg
            className="w-5 h-5 animate-spin text-muted-foreground"
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
        <div className="border border-border rounded-xl p-12 flex items-center justify-center bg-muted/20">
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
      ) : sortedAgents.length === 0 ? (
        <div className="border border-border rounded-xl p-8 md:p-12 flex flex-col items-center justify-center bg-muted/20">
          <div className="w-12 h-12 md:w-14 md:h-14 rounded-xl bg-muted flex items-center justify-center mb-3 md:mb-4">
            <svg
              className="w-6 h-6 md:w-7 md:h-7 text-muted-foreground"
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
          </div>
          <h3 className="text-base md:text-lg font-semibold text-foreground mb-1">
            No agents found
          </h3>
          <p className="text-sm md:text-base text-muted-foreground mb-3 md:mb-4 text-center">
            Get started by creating your first agent
          </p>
          <button
            onClick={() => setDialogOpen(true)}
            className="h-9 md:h-10 px-4 rounded-md text-sm md:text-base font-medium border border-border bg-background hover:bg-muted/50 transition-colors cursor-pointer"
          >
            New agent
          </button>
        </div>
      ) : (
        <>
          {/* Mobile Sort Button */}
          <div className="flex justify-end md:hidden mb-3">
            <button
              onClick={toggleSort}
              className="flex items-center gap-2 px-3 py-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors rounded-md hover:bg-muted/50"
            >
              Sort by date
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
          </div>

          {/* Desktop Table View */}
          <div className="hidden md:block border border-border rounded-xl overflow-hidden">
            {/* Table Header */}
            <div className="grid grid-cols-[1fr_160px_1fr_auto_auto] gap-4 px-4 py-2 border-b border-border bg-muted/30">
              <div className="text-sm font-medium text-muted-foreground">
                Name
              </div>
              <div className="text-sm font-medium text-muted-foreground">
                Type
              </div>
              <div className="text-sm font-medium text-muted-foreground">
                <button
                  onClick={toggleSort}
                  className="flex items-center gap-2 hover:text-foreground transition-colors cursor-pointer"
                >
                  Last updated at
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
              </div>
              <div className="w-8"></div>
              <div className="w-8"></div>
            </div>
            {/* Table Body */}
            {sortedAgents.map((agent) => (
              <div
                key={agent.uuid}
                className="grid grid-cols-[1fr_160px_1fr_auto_auto] gap-4 border-b border-border last:border-b-0 hover:bg-muted/20 transition-colors"
              >
                {/* Name Column */}
                <Link
                  href={`/agents/${agent.uuid}`}
                  onClick={(e) => {
                    if (onNavigateToAgent) {
                      e.preventDefault();
                      onNavigateToAgent(agent.uuid);
                    }
                  }}
                  className="flex items-center px-4 py-2"
                >
                  <div className="text-sm font-medium text-foreground">
                    {agent.name}
                  </div>
                </Link>
                {/* Type Column */}
                <Link
                  href={`/agents/${agent.uuid}`}
                  onClick={(e) => {
                    if (onNavigateToAgent) {
                      e.preventDefault();
                      onNavigateToAgent(agent.uuid);
                    }
                  }}
                  className="flex items-center px-4 py-2"
                >
                  <span
                    className={`text-xs px-2 py-1 rounded-md font-medium ${
                      agent.type === "connection"
                        ? "bg-blue-500/10 text-blue-500"
                        : "bg-muted text-muted-foreground"
                    }`}
                  >
                    {agent.type === "connection" ? "Connection" : "Agent"}
                  </span>
                </Link>
                {/* Last Updated At Column */}
                <Link
                  href={`/agents/${agent.uuid}`}
                  onClick={(e) => {
                    if (onNavigateToAgent) {
                      e.preventDefault();
                      onNavigateToAgent(agent.uuid);
                    }
                  }}
                  className="flex items-center px-4 py-2"
                >
                  <span className="text-sm text-muted-foreground">
                    {agent.updatedAt}
                  </span>
                </Link>
                {/* Duplicate Button */}
                <div className="flex items-center">
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      openDuplicateDialog(agent);
                    }}
                    className="w-8 h-8 flex items-center justify-center rounded-md text-muted-foreground hover:text-foreground hover:bg-muted/50 transition-colors cursor-pointer"
                    title="Duplicate agent"
                  >
                    <svg
                      className="w-4 h-4"
                      fill="none"
                      viewBox="0 0 24 24"
                      stroke="currentColor"
                      strokeWidth={1.5}
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        d="M15.75 17.25v3.375c0 .621-.504 1.125-1.125 1.125h-9.75a1.125 1.125 0 01-1.125-1.125V7.875c0-.621.504-1.125 1.125-1.125H6.75a9.06 9.06 0 011.5.124m7.5 10.376h3.375c.621 0 1.125-.504 1.125-1.125V11.25c0-4.46-3.243-8.161-7.5-8.876a9.06 9.06 0 00-1.5-.124H9.375c-.621 0-1.125.504-1.125 1.125v3.5m7.5 10.375H9.375a1.125 1.125 0 01-1.125-1.125v-9.25m12 6.625v-1.875a3.375 3.375 0 00-3.375-3.375h-1.5a1.125 1.125 0 01-1.125-1.125v-1.5a3.375 3.375 0 00-3.375-3.375H9.75"
                      />
                    </svg>
                  </button>
                </div>
                {/* Delete Button */}
                <div className="flex items-center">
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      openDeleteDialog(agent);
                    }}
                    disabled={deletingAgentUuid === agent.uuid}
                    className="w-8 h-8 flex items-center justify-center rounded-md text-muted-foreground hover:text-red-500 hover:bg-red-500/10 transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
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
                        strokeWidth={1.5}
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          d="M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 01-2.244 2.077H8.084a2.25 2.25 0 01-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 00-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 013.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 00-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 00-7.5 0"
                        />
                      </svg>
                    )}
                  </button>
                </div>
              </div>
            ))}
          </div>

          {/* Mobile Card View */}
          <div className="md:hidden space-y-3">
            {sortedAgents.map((agent) => (
              <div
                key={agent.uuid}
                className="border border-border rounded-lg overflow-hidden bg-background"
              >
                <Link
                  href={`/agents/${agent.uuid}`}
                  onClick={(e) => {
                    if (onNavigateToAgent) {
                      e.preventDefault();
                      onNavigateToAgent(agent.uuid);
                    }
                  }}
                  className="block p-4"
                >
                  <div className="flex items-center gap-2 mb-1">
                    <div className="font-medium text-sm text-foreground">
                      {agent.name}
                    </div>
                    <span
                      className={`text-xs px-1.5 py-0.5 rounded font-medium ${
                        agent.type === "connection"
                          ? "bg-blue-500/10 text-blue-500"
                          : "bg-muted text-muted-foreground"
                      }`}
                    >
                      {agent.type === "connection" ? "Connection" : "Agent"}
                    </span>
                  </div>
                  <div className="text-xs text-muted-foreground">
                    {agent.updatedAt}
                  </div>
                </Link>
                <div className="flex items-center gap-2 px-4 pb-3 pt-0">
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      openDuplicateDialog(agent);
                    }}
                    className="flex-1 h-8 flex items-center justify-center gap-2 rounded-md text-xs font-medium text-foreground bg-muted/50 hover:bg-muted transition-colors"
                  >
                    <svg
                      className="w-4 h-4"
                      fill="none"
                      viewBox="0 0 24 24"
                      stroke="currentColor"
                      strokeWidth={1.5}
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        d="M15.75 17.25v3.375c0 .621-.504 1.125-1.125 1.125h-9.75a1.125 1.125 0 01-1.125-1.125V7.875c0-.621.504-1.125 1.125-1.125H6.75a9.06 9.06 0 011.5.124m7.5 10.376h3.375c.621 0 1.125-.504 1.125-1.125V11.25c0-4.46-3.243-8.161-7.5-8.876a9.06 9.06 0 00-1.5-.124H9.375c-.621 0-1.125.504-1.125 1.125v3.5m7.5 10.375H9.375a1.125 1.125 0 01-1.125-1.125v-9.25m12 6.625v-1.875a3.375 3.375 0 00-3.375-3.375h-1.5a1.125 1.125 0 01-1.125-1.125v-1.5a3.375 3.375 0 00-3.375-3.375H9.75"
                      />
                    </svg>
                    Duplicate
                  </button>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      openDeleteDialog(agent);
                    }}
                    disabled={deletingAgentUuid === agent.uuid}
                    className="flex-1 h-8 flex items-center justify-center gap-2 rounded-md text-xs font-medium text-red-500 bg-red-500/10 hover:bg-red-500/20 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
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
                      <>
                        <svg
                          className="w-4 h-4"
                          fill="none"
                          viewBox="0 0 24 24"
                          stroke="currentColor"
                          strokeWidth={1.5}
                        >
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            d="M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 01-2.244 2.077H8.084a2.25 2.25 0 01-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 00-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 013.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 00-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 00-7.5 0"
                          />
                        </svg>
                        Delete
                      </>
                    )}
                  </button>
                </div>
              </div>
            ))}
          </div>
        </>
      )}

      {/* New Agent Dialog */}
      {dialogOpen && (
        <NewAgentDialog
          onClose={() => setDialogOpen(false)}
          onCreateAgent={onNavigateToAgent}
          backendAccessToken={backendAccessToken ?? undefined}
        />
      )}

      {/* Delete Confirmation Dialog */}
      <DeleteConfirmationDialog
        isOpen={deleteDialogOpen}
        onClose={closeDeleteDialog}
        onConfirm={handleDeleteAgent}
        title="Delete agent"
        message={`Are you sure you want to delete "${agentToDelete?.name}"?`}
        confirmText="Delete"
        isDeleting={!!deletingAgentUuid}
      />

      {/* Duplicate Agent Dialog */}
      {duplicateDialogOpen && agentToDuplicate && (
        <DuplicateAgentDialog
          originalAgent={agentToDuplicate}
          onClose={closeDuplicateDialog}
          onDuplicated={handleAgentDuplicated}
          onNavigateToAgent={onNavigateToAgent}
          backendAccessToken={backendAccessToken ?? undefined}
        />
      )}
    </div>
  );
}

function NewAgentDialog({
  onClose,
  onCreateAgent,
  backendAccessToken,
}: {
  onClose: () => void;
  onCreateAgent?: (agentUuid: string) => void;
  backendAccessToken?: string;
}) {
  const [agentName, setAgentName] = useState("");
  const [agentKind, setAgentKind] = useState<"agent" | "connection">("agent");
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

      const body =
        agentKind === "connection"
          ? {
              name: agentName.trim(),
              type: "connection",
              config: {
                agent_url: "",
                agent_headers: {},
                connection_verified: false,
                connection_verified_at: null,
                connection_verified_error: null,
                benchmark_models_verified: {},
              },
            }
          : {
              name: agentName.trim(),
              type: "agent",
              config: {
                system_prompt: "You are a helpful assistant.",
                stt: { provider: "google" },
                tts: { provider: "google" },
                llm: { model: "google/gemini-3-flash-preview" },
                settings: { agent_speaks_first: false },
                system_tools: { end_call: true },
              },
            };

      const response = await fetch(`${backendUrl}/agents`, {
        method: "POST",
        headers: {
          accept: "application/json",
          "Content-Type": "application/json",
          "ngrok-skip-browser-warning": "true",
          Authorization: `Bearer ${backendAccessToken}`,
        },
        body: JSON.stringify(body),
      });

      if (response.status === 401) {
        await signOut({ callbackUrl: "/login" });
        return;
      }

      if (!response.ok) {
        throw new Error("Failed to create agent");
      }

      const data = await response.json();
      const agentUuid = data.uuid;

      if (agentUuid && onCreateAgent) {
        onClose();
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
            New agent
          </h2>
          <p className="text-muted-foreground text-[15px]">
            Choose a name and how you want to set up your agent
          </p>
        </div>

        {/* Agent Name Input */}
        <div className="mb-5">
          <label className="block text-[13px] font-medium text-foreground mb-2">
            Agent name <span className="text-red-500">*</span>
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
              onKeyDown={(e) => {
                if (e.key === "Enter" && agentName.trim() && !isCreating) {
                  handleCreate();
                }
              }}
              placeholder="Enter agent name"
              className="w-full h-10 px-3 pr-16 rounded-md text-[13px] border border-border bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-accent focus:border-transparent"
              maxLength={maxLength}
              autoFocus
            />
            <div className="absolute inset-y-0 right-0 flex items-center pr-3 pointer-events-none">
              <span className="text-[12px] text-muted-foreground">
                {agentName.length}/{maxLength}
              </span>
            </div>
          </div>
        </div>

        {/* Agent Kind Selection */}
        <div className="mb-5 space-y-2">
          <label className="block text-[13px] font-medium text-foreground mb-2">
            Setup
          </label>

          {/* Build option */}
          <button
            type="button"
            onClick={() => setAgentKind("agent")}
            className={`w-full text-left p-4 rounded-lg border transition-colors cursor-pointer ${
              agentKind === "agent"
                ? "border-foreground bg-muted/30"
                : "border-border hover:border-muted-foreground"
            }`}
          >
            <div className="flex items-start gap-3">
              <div
                className={`mt-0.5 w-4 h-4 rounded-full border-2 flex-shrink-0 flex items-center justify-center ${
                  agentKind === "agent"
                    ? "border-foreground"
                    : "border-muted-foreground"
                }`}
              >
                {agentKind === "agent" && (
                  <div className="w-2 h-2 rounded-full bg-foreground" />
                )}
              </div>
              <div>
                <div className="text-[13px] font-medium text-foreground">
                  Build your agent in Calibrate
                </div>
                <div className="text-[12px] text-muted-foreground mt-0.5">
                  Configure the LLM/STT/TTS models for your agent, set the
                  instructions and define the tools your agent can use. All
                  within Calibrate.
                </div>
              </div>
            </div>
          </button>

          {/* Connect option */}
          <button
            type="button"
            onClick={() => setAgentKind("connection")}
            className={`w-full text-left p-4 rounded-lg border transition-colors cursor-pointer ${
              agentKind === "connection"
                ? "border-foreground bg-muted/30"
                : "border-border hover:border-muted-foreground"
            }`}
          >
            <div className="flex items-start gap-3">
              <div
                className={`mt-0.5 w-4 h-4 rounded-full border-2 flex-shrink-0 flex items-center justify-center ${
                  agentKind === "connection"
                    ? "border-foreground"
                    : "border-muted-foreground"
                }`}
              >
                {agentKind === "connection" && (
                  <div className="w-2 h-2 rounded-full bg-foreground" />
                )}
              </div>
              <div>
                <div className="text-[13px] font-medium text-foreground">
                  Connect your existing agent
                </div>
                <div className="text-[12px] text-muted-foreground mt-0.5">
                  Provide a URL for your deployed agent. Calibrate will call it
                  directly to run evals, benchmarks and simulations.
                </div>
              </div>
            </div>
          </button>
        </div>

        {/* Error Message */}
        {error && (
          <div className="mb-5 p-3 rounded-md bg-red-500/10 border border-red-500/20">
            <p className="text-[13px] text-red-500">{error}</p>
          </div>
        )}

        {/* Footer Buttons */}
        <div className="flex items-center justify-between">
          <button
            onClick={onClose}
            className="h-9 px-4 rounded-md text-[13px] font-medium bg-muted text-foreground hover:bg-muted/80 transition-colors cursor-pointer"
          >
            Cancel
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
              "Create"
            )}
          </button>
        </div>
      </div>
    </div>
  );
}

function DuplicateAgentDialog({
  originalAgent,
  onClose,
  onDuplicated,
  onNavigateToAgent,
  backendAccessToken,
}: {
  originalAgent: Agent;
  onClose: () => void;
  onDuplicated: (agent: Agent) => void;
  onNavigateToAgent?: (agentUuid: string) => void;
  backendAccessToken?: string;
}) {
  const [agentName, setAgentName] = useState(`Copy of ${originalAgent.name}`);
  const [isDuplicating, setIsDuplicating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const maxLength = 50;

  const handleDuplicate = async () => {
    if (!agentName.trim()) return;

    try {
      setIsDuplicating(true);
      setError(null);
      const backendUrl = process.env.NEXT_PUBLIC_BACKEND_URL;
      if (!backendUrl) {
        throw new Error("BACKEND_URL environment variable is not set");
      }

      // Call the duplicate endpoint
      const response = await fetch(
        `${backendUrl}/agents/${originalAgent.uuid}/duplicate`,
        {
          method: "POST",
          headers: {
            accept: "application/json",
            "Content-Type": "application/json",
            "ngrok-skip-browser-warning": "true",
            Authorization: `Bearer ${backendAccessToken}`,
          },
          body: JSON.stringify({
            name: agentName.trim(),
          }),
        },
      );

      if (response.status === 401) {
        await signOut({ callbackUrl: "/login" });
        return;
      }

      if (!response.ok) {
        throw new Error("Failed to duplicate agent");
      }

      const data = await response.json();
      const newAgent: Agent = {
        uuid: data.uuid,
        name: agentName.trim(),
        type: originalAgent.type,
        updatedAt: formatDate(new Date().toISOString()),
        updatedAtRaw: new Date().toISOString(),
      };

      onDuplicated(newAgent);
      onClose();

      if (onNavigateToAgent) {
        onNavigateToAgent(data.uuid);
      }
    } catch (err) {
      console.error("Error duplicating agent:", err);
      setError(
        err instanceof Error ? err.message : "Failed to duplicate agent",
      );
    } finally {
      setIsDuplicating(false);
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
            Duplicate agent
          </h2>
          <p className="text-muted-foreground text-[15px]">
            Choose a name for the duplicated agent
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
            Cancel
          </button>
          <button
            onClick={handleDuplicate}
            disabled={!agentName.trim() || isDuplicating}
            className="h-9 px-4 rounded-md text-[13px] font-medium bg-foreground text-background hover:opacity-90 transition-opacity cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
          >
            {isDuplicating ? (
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
                Duplicating...
              </>
            ) : (
              "Duplicate"
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
