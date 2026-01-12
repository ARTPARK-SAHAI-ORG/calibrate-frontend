"use client";

import React, { useState } from "react";
import { llmProviders, type LLMModel } from "./agent-tabs/constants/providers";
import { BenchmarkResultsDialog } from "./BenchmarkResultsDialog";

type TestData = {
  uuid: string;
  name: string;
  description: string;
  type: "response" | "tool_call";
  config: Record<string, any>;
  created_at: string;
  updated_at: string;
};

type BenchmarkDialogProps = {
  isOpen: boolean;
  onClose: () => void;
  agentUuid: string;
  agentName: string;
  tests: TestData[];
};

export function BenchmarkDialog({
  isOpen,
  onClose,
  agentUuid,
  agentName,
  tests,
}: BenchmarkDialogProps) {
  const [selectedModels, setSelectedModels] = useState<(LLMModel | null)[]>([
    null,
  ]);
  const [modelSelectorOpen, setModelSelectorOpen] = useState(false);
  const [editingIndex, setEditingIndex] = useState<number | null>(null);
  const [showResults, setShowResults] = useState(false);

  if (!isOpen) return null;

  const handleClose = () => {
    setSelectedModels([null]);
    setShowResults(false);
    onClose();
  };

  const handleRunBenchmark = () => {
    setShowResults(true);
  };

  const handleCloseResults = () => {
    setShowResults(false);
    handleClose();
  };

  const handleAddModel = () => {
    setSelectedModels((prev) => [...prev, null]);
  };

  const handleSelectModel = (index: number, model: LLMModel) => {
    setSelectedModels((prev) => {
      const newModels = [...prev];
      newModels[index] = model;
      return newModels;
    });
  };

  const handleRemoveModel = (index: number) => {
    setSelectedModels((prev) => {
      if (prev.length === 1) return prev;
      return prev.filter((_, i) => i !== index);
    });
  };

  const openModelSelector = (index: number) => {
    setEditingIndex(index);
    setModelSelectorOpen(true);
  };

  const handleModelSelected = (model: LLMModel) => {
    if (editingIndex !== null) {
      handleSelectModel(editingIndex, model);
    }
    setModelSelectorOpen(false);
    setEditingIndex(null);
  };

  // Get IDs of already selected models
  const selectedModelIds = new Set(
    selectedModels.filter((m) => m !== null).map((m) => m!.id)
  );

  // Get available models for a given row (excluding already selected ones, except the current row's selection)
  const getAvailableProviders = (currentIndex: number) => {
    const currentModel = selectedModels[currentIndex];
    return llmProviders.map((provider) => ({
      ...provider,
      models: provider.models.filter(
        (model) =>
          !selectedModelIds.has(model.id) ||
          (currentModel && model.id === currentModel.id)
      ),
    }));
  };

  const canRunBenchmark = selectedModels.some((m) => m !== null);
  const maxModels = 5;
  const canAddMore = selectedModels.length < maxModels;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-gray-300/20">
      <div className="bg-black rounded-xl w-full max-w-lg max-h-[80vh] flex flex-col shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 ">
          <div>
            <h2 className="text-lg font-semibold text-foreground">
              Run Benchmark
            </h2>
            <p className="text-sm text-muted-foreground mt-0.5">
              Select up to 5 models to benchmark for &quot;{agentName}&quot;
            </p>
          </div>
          <button
            onClick={handleClose}
            className="flex items-center justify-center w-8 h-8 rounded-md hover:bg-muted transition-colors cursor-pointer"
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
                d="M6 18L18 6M6 6l12 12"
              />
            </svg>
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6 space-y-4">
          <div className="space-y-3">
            <label className="text-sm font-medium text-foreground mb-2">
              Select Models
            </label>

            {/* Model Rows */}
            {selectedModels.map((selectedModel, index) => (
              <div key={index} className="flex items-center gap-2">
                <button
                  onClick={() => openModelSelector(index)}
                  className="flex-1 h-10 px-4 rounded-md text-sm border border-border bg-background hover:bg-muted/50 flex items-center justify-between cursor-pointer transition-colors"
                >
                  <span
                    className={
                      selectedModel
                        ? "text-foreground"
                        : "text-muted-foreground"
                    }
                  >
                    {selectedModel ? selectedModel.name : "Select a model"}
                  </span>
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
                      d="M19.5 8.25l-7.5 7.5-7.5-7.5"
                    />
                  </svg>
                </button>

                {/* Remove Button */}
                {selectedModels.length > 1 && (
                  <button
                    onClick={() => handleRemoveModel(index)}
                    className="w-8 h-8 flex items-center justify-center rounded-md text-muted-foreground hover:text-red-500 hover:bg-red-500/10 transition-colors cursor-pointer"
                    title="Remove model"
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
                        d="M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 01-2.244 2.077H8.084a2.25 2.25 0 01-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 00-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 013.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 00-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 00-7.5 0"
                      />
                    </svg>
                  </button>
                )}
              </div>
            ))}

            {/* Add Model Button */}
            {canAddMore && (
              <button
                onClick={handleAddModel}
                className="w-full h-10 px-4 rounded-md text-sm font-medium border border-dashed border-border bg-background hover:bg-muted/50 transition-colors cursor-pointer flex items-center justify-center gap-2 text-muted-foreground hover:text-foreground"
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
                Add model
              </button>
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="px-6 py-4  flex items-center justify-end gap-3">
          <button
            onClick={handleClose}
            className="h-10 px-4 rounded-md text-sm font-medium border border-border bg-background hover:bg-muted/50 transition-colors cursor-pointer"
          >
            Cancel
          </button>
          <button
            onClick={handleRunBenchmark}
            disabled={!canRunBenchmark}
            className="h-10 px-4 rounded-md text-sm font-medium bg-foreground text-background hover:opacity-90 transition-opacity cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
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
                d="M5.25 5.653c0-.856.917-1.398 1.667-.986l11.54 6.348a1.125 1.125 0 010 1.971l-11.54 6.347a1.125 1.125 0 01-1.667-.985V5.653z"
              />
            </svg>
            Run Benchmark
          </button>
        </div>
      </div>

      {/* LLM Selector Modal */}
      {modelSelectorOpen && editingIndex !== null && (
        <LLMSelectorModal
          isOpen={modelSelectorOpen}
          onClose={() => {
            setModelSelectorOpen(false);
            setEditingIndex(null);
          }}
          selectedLLM={selectedModels[editingIndex]}
          onSelect={handleModelSelected}
          availableProviders={getAvailableProviders(editingIndex)}
        />
      )}

      {/* Benchmark Results Dialog */}
      <BenchmarkResultsDialog
        isOpen={showResults}
        onClose={handleCloseResults}
        agentUuid={agentUuid}
        agentName={agentName}
        testUuids={tests.map((t) => t.uuid)}
        testNames={tests.map((t) => t.name)}
        models={selectedModels.filter((m) => m !== null).map((m) => m!.id)}
      />
    </div>
  );
}

// LLM Selector Modal Component
type LLMSelectorModalProps = {
  isOpen: boolean;
  onClose: () => void;
  selectedLLM: LLMModel | null;
  onSelect: (model: LLMModel) => void;
  availableProviders: { name: string; models: LLMModel[] }[];
};

function LLMSelectorModal({
  isOpen,
  onClose,
  selectedLLM,
  onSelect,
  availableProviders,
}: LLMSelectorModalProps) {
  const [searchQuery, setSearchQuery] = useState("");

  if (!isOpen) return null;

  const handleClose = () => {
    setSearchQuery("");
    onClose();
  };

  const handleSelect = (model: LLMModel) => {
    onSelect(model);
    setSearchQuery("");
  };

  const filteredProviders = availableProviders
    .map((provider) => ({
      ...provider,
      models: provider.models.filter(
        (model) =>
          model.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
          provider.name.toLowerCase().includes(searchQuery.toLowerCase())
      ),
    }))
    .filter((provider) => provider.models.length > 0);

  return (
    <div className="fixed inset-0 z-[60] flex items-start justify-center pt-16 bg-black/50">
      <div className="bg-background border border-border rounded-xl w-full max-w-2xl max-h-[80vh] flex flex-col shadow-2xl">
        {/* Modal Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-border">
          <div className="flex items-center gap-3">
            <button
              onClick={handleClose}
              className="flex items-center justify-center w-8 h-8 rounded-md hover:bg-muted transition-colors cursor-pointer"
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
            <h2 className="text-base font-semibold">Select LLM</h2>
          </div>
          <button
            onClick={handleClose}
            className="flex items-center justify-center w-8 h-8 rounded-md hover:bg-muted transition-colors cursor-pointer"
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
                d="M6 18L18 6M6 6l12 12"
              />
            </svg>
          </button>
        </div>

        {/* Search Input */}
        <div className="px-4 py-3 border-b border-border">
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search LLM"
            className="w-full h-10 px-4 rounded-md text-base border border-border bg-muted/30 text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-accent focus:border-transparent"
            autoFocus
          />
        </div>

        {/* Models List */}
        <div className="flex-1 overflow-y-auto">
          {filteredProviders.length === 0 ? (
            <div className="p-8 text-center text-sm text-muted-foreground">
              No models found
            </div>
          ) : (
            filteredProviders.map((provider) => (
              <div key={provider.name} className="py-2">
                <h3 className="px-4 py-2 text-sm font-medium text-muted-foreground">
                  {provider.name}
                </h3>
                {provider.models.map((model) => (
                  <button
                    key={model.id}
                    onClick={() => handleSelect(model)}
                    className={`w-full px-4 py-3 flex items-center hover:bg-muted/50 transition-colors cursor-pointer ${
                      selectedLLM?.id === model.id ? "bg-muted/50" : ""
                    }`}
                  >
                    <span className="text-base font-medium text-foreground">
                      {model.name}
                    </span>
                  </button>
                ))}
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
