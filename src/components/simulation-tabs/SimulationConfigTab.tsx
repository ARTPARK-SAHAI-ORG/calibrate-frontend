"use client";

import React from "react";
import { AgentPicker, Agent } from "@/components/AgentPicker";
import { MultiSelectPicker, PickerItem } from "@/components/MultiSelectPicker";

type SimulationConfigTabProps = {
  selectedAgent: Agent | null;
  onSelectAgent: (agent: Agent | null) => void;
  personas: PickerItem[];
  selectedPersonas: PickerItem[];
  onPersonasChange: (items: PickerItem[]) => void;
  personasLoading: boolean;
  scenarios: PickerItem[];
  selectedScenarios: PickerItem[];
  onScenariosChange: (items: PickerItem[]) => void;
  scenariosLoading: boolean;
  metrics: PickerItem[];
  selectedMetrics: PickerItem[];
  onMetricsChange: (items: PickerItem[]) => void;
  metricsLoading: boolean;
  isConfigured: boolean;
  isCreating: boolean;
  onCreateClick: () => void;
  // Used to show voice simulation restriction for agent connections
  isAgentConnection?: boolean;
};

export function SimulationConfigTab({
  selectedAgent,
  onSelectAgent,
  personas,
  selectedPersonas,
  onPersonasChange,
  personasLoading,
  scenarios,
  selectedScenarios,
  onScenariosChange,
  scenariosLoading,
  metrics,
  selectedMetrics,
  onMetricsChange,
  metricsLoading,
  isConfigured,
  isCreating,
  onCreateClick,
  isAgentConnection,
}: SimulationConfigTabProps) {
  return (
    <div className="space-y-6">
      {/* Agent Picker */}
      <AgentPicker
        selectedAgentUuid={selectedAgent?.uuid || ""}
        onSelectAgent={onSelectAgent}
        label="Select agent"
        placeholder="Choose an agent for this simulation"
        disabled={isConfigured}
      />

      {/* Unverified agent warning */}
      {selectedAgent && selectedAgent.verified === false && (
        <div className="flex items-start gap-2.5 p-3 rounded-lg bg-yellow-500/10 border border-yellow-500/20">
          <svg
            className="w-4 h-4 text-yellow-400 mt-0.5 flex-shrink-0"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={2}
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z"
            />
          </svg>
          <p className="text-xs text-yellow-300/90">
            This agent needs to be verified before the simulation can be run.
            Please verify the agent connection in the agent settings first.
          </p>
        </div>
      )}

      {/* Voice simulation notice for agent connections */}
      {isAgentConnection && (
        <div className="flex items-start gap-2.5 p-3 rounded-lg bg-blue-500/10 border border-blue-500/20">
          <svg
            className="w-4 h-4 text-blue-400 mt-0.5 flex-shrink-0"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={2}
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M11.25 11.25l.041-.02a.75.75 0 011.063.852l-.708 2.836a.75.75 0 001.063.853l.041-.021M21 12a9 9 0 11-18 0 9 9 0 0118 0zm-9-3.75h.008v.008H12V8.25z"
            />
          </svg>
          <p className="text-xs text-blue-300/90">
            Voice simulations are currently only supported for agents built
            within Calibrate but you can still run text simulations on your
            connected agent
          </p>
        </div>
      )}

      {/* Personas Picker */}
      <MultiSelectPicker
        items={personas}
        selectedItems={selectedPersonas}
        onSelectionChange={onPersonasChange}
        label="Select personas"
        placeholder="Choose one or more personas"
        searchPlaceholder="Search personas"
        isLoading={personasLoading}
        disabled={isConfigured}
      />

      {/* Scenarios Picker */}
      <MultiSelectPicker
        items={scenarios}
        selectedItems={selectedScenarios}
        onSelectionChange={onScenariosChange}
        label="Select scenarios"
        placeholder="Choose one or more scenarios"
        searchPlaceholder="Search scenarios"
        isLoading={scenariosLoading}
        disabled={isConfigured}
      />

      {/* Metrics Picker */}
      <MultiSelectPicker
        items={metrics}
        selectedItems={selectedMetrics}
        onSelectionChange={onMetricsChange}
        label="Select metrics"
        placeholder="Choose one or more metrics"
        searchPlaceholder="Search metrics"
        isLoading={metricsLoading}
        disabled={isConfigured}
      />

      {/* Create Button - shown when not configured */}
      {!isConfigured && (
        <button
          onClick={onCreateClick}
          disabled={
            isCreating ||
            !selectedAgent ||
            selectedPersonas.length === 0 ||
            selectedScenarios.length === 0
          }
          className="h-10 px-5 rounded-md text-base font-medium bg-foreground text-background hover:opacity-90 transition-opacity cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
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
                  d="M12 4.5v15m7.5-7.5h-15"
                />
              </svg>
              Create
            </>
          )}
        </button>
      )}
    </div>
  );
}
