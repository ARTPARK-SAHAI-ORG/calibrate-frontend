"use client";

import React, { useState } from "react";
import type { LLMModel } from "./agent-tabs/constants/providers";
import { LLMSelectorModal } from "./agent-tabs/LLMSelectorModal";
import { useOpenRouterModels } from "@/hooks";
import { BenchmarkResultsDialog } from "./BenchmarkResultsDialog";
import {
  CloseIcon,
  ChevronDownIcon,
  TrashIcon,
  PlusIcon,
  PlayIcon,
} from "@/components/icons";
import { Button } from "@/components/ui";
import { useHideFloatingButton } from "@/components/AppLayout";

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
  onBenchmarkCreated?: (taskId: string) => void; // Called when a new benchmark is created
};

export function BenchmarkDialog({
  isOpen,
  onClose,
  agentUuid,
  agentName,
  tests,
  onBenchmarkCreated,
}: BenchmarkDialogProps) {
  useHideFloatingButton(isOpen);
  const { providers: llmProviders } = useOpenRouterModels();

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

  const handleGoBackFromResults = () => {
    // Go back to model selection without closing the main dialog
    // This preserves the selected models so user can try again
    setShowResults(false);
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
      <div className="bg-background rounded-xl w-full max-w-lg max-h-[80vh] flex flex-col shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4">
          <div>
            <h2 className="text-lg font-semibold text-foreground">
              Compare different models
            </h2>
            <p className="text-sm text-muted-foreground mt-0.5">
              Select up to 5 models to benchmark on the tests
            </p>
          </div>
          <button
            onClick={handleClose}
            className="flex items-center justify-center w-8 h-8 rounded-md hover:bg-muted transition-colors cursor-pointer"
          >
            <CloseIcon className="w-5 h-5" />
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
                  <ChevronDownIcon className="w-4 h-4 text-muted-foreground" />
                </button>

                {/* Remove Button */}
                {selectedModels.length > 1 && (
                  <button
                    onClick={() => handleRemoveModel(index)}
                    className="w-8 h-8 flex items-center justify-center rounded-md text-muted-foreground hover:text-red-500 hover:bg-red-500/10 transition-colors cursor-pointer"
                    title="Remove model"
                  >
                    <TrashIcon className="w-4 h-4" />
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
                <PlusIcon className="w-4 h-4" />
                Add model
              </button>
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="px-6 py-4 flex items-center justify-end gap-3">
          <Button variant="secondary" size="md" onClick={handleClose}>
            Cancel
          </Button>
          <Button
            variant="primary"
            size="md"
            onClick={handleRunBenchmark}
            disabled={!canRunBenchmark}
            className="flex items-center gap-2"
          >
            <PlayIcon className="w-4 h-4" />
            Run comparison
          </Button>
        </div>
      </div>

      {/* LLM Selector Modal - using shared component */}
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
        onGoBack={handleGoBackFromResults}
        agentUuid={agentUuid}
        agentName={agentName}
        testUuids={tests.map((t) => t.uuid)}
        testNames={tests.map((t) => t.name)}
        models={selectedModels.filter((m) => m !== null).map((m) => m!.id)}
        onBenchmarkCreated={onBenchmarkCreated}
      />
    </div>
  );
}
