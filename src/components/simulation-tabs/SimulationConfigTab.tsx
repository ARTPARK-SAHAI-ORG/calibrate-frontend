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
