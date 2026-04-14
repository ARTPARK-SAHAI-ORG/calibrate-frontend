"use client";

import React, { useState, useEffect } from "react";
import { signOut } from "next-auth/react";
import { useAccessToken } from "@/hooks";

export type Agent = {
  uuid: string;
  name: string;
  type?: "agent" | "connection";
  verified?: boolean;
};

type AgentPickerProps = {
  selectedAgentUuid: string;
  onSelectAgent: (agent: Agent | null) => void;
  label?: string;
  placeholder?: string;
  className?: string;
  disabled?: boolean;
};

export function AgentPicker({
  selectedAgentUuid,
  onSelectAgent,
  label = "Select Agent",
  placeholder = "Select an agent",
  className = "",
  disabled = false,
}: AgentPickerProps) {
  const backendAccessToken = useAccessToken();
  const [agents, setAgents] = useState<Agent[]>([]);
  const [agentsLoading, setAgentsLoading] = useState(false);
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");

  // Fetch agents on mount
  useEffect(() => {
    const fetchAgents = async () => {
      if (!backendAccessToken) return;

      try {
        setAgentsLoading(true);
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
        const formattedAgents: Agent[] = Array.isArray(data)
          ? data.map((agent: any) => ({
              uuid: agent.uuid,
              name: agent.name || agent.agent_name || String(agent),
              type: agent.type === "connection" ? "connection" : "agent",
              verified:
                agent.type === "connection"
                  ? agent.config?.connection_verified === true
                  : true,
            }))
          : [];
        setAgents(formattedAgents);
      } catch (err) {
        console.error("Error fetching agents:", err);
      } finally {
        setAgentsLoading(false);
      }
    };

    fetchAgents();
  }, [backendAccessToken]);

  const filteredAgents = agents.filter((agent) =>
    agent.name.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const selectedAgent = agents.find((a) => a.uuid === selectedAgentUuid);

  return (
    <div className={`space-y-1.5 ${className}`}>
      {label && (
        <label className="block text-sm font-medium text-foreground">
          {label}
        </label>
      )}
      <div className="relative">
        <div
          onClick={() => !disabled && setDropdownOpen(!dropdownOpen)}
          className={`w-full h-11 px-4 rounded-xl text-sm bg-transparent text-foreground border border-border transition-colors flex items-center justify-between ${
            disabled
              ? "cursor-default"
              : "hover:border-muted-foreground cursor-pointer"
          }`}
        >
          <span
            className={
              selectedAgent ? "text-foreground" : "text-muted-foreground"
            }
          >
            {selectedAgent ? selectedAgent.name : placeholder}
          </span>
          {!disabled && (
            <svg
              className={`w-5 h-5 text-muted-foreground transition-transform ${
                dropdownOpen ? "rotate-180" : ""
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
          )}
        </div>

        {/* Dropdown */}
        {dropdownOpen && !disabled && (
          <>
            <div
              className="fixed inset-0 z-[99]"
              onClick={() => setDropdownOpen(false)}
            />
            <div className="absolute left-0 right-0 top-full mt-2 bg-background border border-border rounded-xl shadow-xl z-[100] overflow-hidden">
              {/* Search */}
              <div className="p-3 border-b border-border">
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Search agents"
                  className="w-full h-10 px-4 rounded-lg text-sm bg-background text-foreground placeholder:text-muted-foreground border border-border focus:outline-none focus:ring-1 focus:ring-accent"
                  onClick={(e) => e.stopPropagation()}
                />
              </div>

              {/* Options */}
              <div className="max-h-60 overflow-y-auto">
                {agentsLoading ? (
                  <div className="px-4 py-3 text-sm text-muted-foreground">
                    Loading agents
                  </div>
                ) : filteredAgents.length === 0 ? (
                  <div className="px-4 py-3 text-sm text-muted-foreground">
                    No agents found
                  </div>
                ) : (
                  filteredAgents.map((agent) => (
                    <button
                      key={agent.uuid}
                      onClick={() => {
                        onSelectAgent(agent);
                        setDropdownOpen(false);
                      }}
                      className={`w-full px-4 py-3 text-left text-sm transition-colors cursor-pointer flex items-center justify-between gap-2 ${
                        selectedAgentUuid === agent.uuid
                          ? "bg-accent text-foreground"
                          : "text-foreground hover:bg-muted"
                      }`}
                    >
                      <span className="truncate flex items-center gap-1.5">
                        {agent.name}
                        {agent.verified === false && (
                          <span className="inline-flex items-center gap-1 text-xs px-1.5 py-0.5 rounded font-medium bg-yellow-500/10 text-yellow-500 flex-shrink-0">
                            <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                              <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" />
                            </svg>
                            Unverified
                          </span>
                        )}
                      </span>
                      <div className="flex items-center gap-2 flex-shrink-0">
                        <span
                          className={`text-xs px-1.5 py-0.5 rounded font-medium ${
                            agent.type === "connection"
                              ? "bg-blue-500/10 text-blue-500"
                              : "bg-muted text-muted-foreground"
                          }`}
                        >
                          {agent.type === "connection" ? "Connection" : "Agent"}
                        </span>
                        {selectedAgentUuid === agent.uuid && (
                          <svg
                            className="w-4 h-4 text-foreground"
                            fill="none"
                            viewBox="0 0 24 24"
                            stroke="currentColor"
                            strokeWidth={2}
                          >
                            <path
                              strokeLinecap="round"
                              strokeLinejoin="round"
                              d="M4.5 12.75l6 6 9-13.5"
                            />
                          </svg>
                        )}
                      </div>
                    </button>
                  ))
                )}
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
