"use client";

import React, { useState } from "react";
import { signOut } from "next-auth/react";
import type { LLMModel } from "./agent-tabs/constants/providers";
import { LLMSelectorModal } from "./agent-tabs/LLMSelectorModal";
import { useOpenRouterModels, useAccessToken } from "@/hooks";
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

type ModelVerificationStatus =
  | "unverified"
  | "verifying"
  | "verified"
  | "failed";

type BenchmarkDialogProps = {
  isOpen: boolean;
  onClose: () => void;
  agentUuid: string;
  agentName: string;
  tests: TestData[];
  onBenchmarkCreated?: (taskId: string) => void;
  agentType?: "agent" | "connection";
  benchmarkModelsVerified?: Record<
    string,
    { verified: boolean; verified_at: string; error: string | null }
  >;
  benchmarkProvider?: string;
};

export function BenchmarkDialog({
  isOpen,
  onClose,
  agentUuid,
  agentName,
  tests,
  onBenchmarkCreated,
  agentType,
  benchmarkModelsVerified: initialBenchmarkModelsVerified,
  benchmarkProvider,
}: BenchmarkDialogProps) {
  useHideFloatingButton(isOpen);
  const { providers: llmProviders } = useOpenRouterModels();
  const backendAccessToken = useAccessToken();

  const [selectedModels, setSelectedModels] = useState<(LLMModel | null)[]>([
    null,
  ]);
  const [modelSelectorOpen, setModelSelectorOpen] = useState(false);
  const [editingIndex, setEditingIndex] = useState<number | null>(null);
  const [showResults, setShowResults] = useState(false);

  // Per-model verification state for agent connections
  const [expandedModelError, setExpandedModelError] = useState<string | null>(
    null,
  );
  const [modelSampleResponses, setModelSampleResponses] = useState<
    Record<string, Record<string, unknown>>
  >({});
  const [benchmarkModelsVerified, setBenchmarkModelsVerified] = useState<
    Record<
      string,
      { verified: boolean; verified_at: string; error: string | null }
    >
  >(initialBenchmarkModelsVerified || {});
  const [modelVerifyStatus, setModelVerifyStatus] = useState<
    Record<string, ModelVerificationStatus>
  >({});

  if (!isOpen) return null;

  const handleClose = () => {
    setSelectedModels([null]);
    setShowResults(false);
    setModelVerifyStatus({});
    onClose();
  };

  const verifyModel = async (
    modelId: string,
  ): Promise<{ verified: boolean; error?: string }> => {
    setModelVerifyStatus((prev) => ({ ...prev, [modelId]: "verifying" }));

    try {
      const backendUrl = process.env.NEXT_PUBLIC_BACKEND_URL;
      if (!backendUrl) throw new Error("BACKEND_URL not set");

      const response = await fetch(
        `${backendUrl}/agents/${agentUuid}/verify-connection`,
        {
          method: "POST",
          headers: {
            accept: "application/json",
            "Content-Type": "application/json",
            "ngrok-skip-browser-warning": "true",
            Authorization: `Bearer ${backendAccessToken}`,
          },
          body: JSON.stringify({ model: modelId }),
        },
      );

      if (response.status === 401) {
        await signOut({ callbackUrl: "/login" });
        return { verified: false, error: "Unauthorized" };
      }

      if (!response.ok) throw new Error("Verification request failed");

      const result = await response.json();
      const verified: boolean = result.success ?? false;
      const error: string | null = result.error ?? null;

      setBenchmarkModelsVerified((prev) => ({
        ...prev,
        [modelId]: {
          verified,
          verified_at: new Date().toISOString(),
          error,
        },
      }));
      if (result.sample_response) {
        setModelSampleResponses((prev) => ({
          ...prev,
          [modelId]: result.sample_response,
        }));
      }
      if (verified) {
        setExpandedModelError((prev) => (prev === modelId ? null : prev));
        setModelSampleResponses((prev) => {
          const next = { ...prev };
          delete next[modelId];
          return next;
        });
      }
      setModelVerifyStatus((prev) => ({
        ...prev,
        [modelId]: verified ? "verified" : "failed",
      }));
      return { verified, error: error || undefined };
    } catch (err) {
      const errMsg = err instanceof Error ? err.message : "Verification failed";
      setBenchmarkModelsVerified((prev) => ({
        ...prev,
        [modelId]: {
          verified: false,
          verified_at: new Date().toISOString(),
          error: errMsg,
        },
      }));
      setModelVerifyStatus((prev) => ({ ...prev, [modelId]: "failed" }));
      return { verified: false, error: errMsg };
    }
  };

  const handleRunBenchmark = async () => {
    if (agentType === "connection") {
      const modelsToVerify = selectedModels
        .filter((m): m is LLMModel => m !== null)
        .filter((m) => {
          const existing = benchmarkModelsVerified[m.id];
          return !existing || !existing.verified;
        });

      if (modelsToVerify.length > 0) {
        const results = await Promise.all(
          modelsToVerify.map((m) => verifyModel(m.id)),
        );
        const anyFailed = results.some((r) => !r.verified);
        if (anyFailed) return;
      }
    }

    setShowResults(true);
  };

  const handleCloseResults = () => {
    setShowResults(false);
    handleClose();
  };

  const handleGoBackFromResults = () => {
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
    selectedModels.filter((m) => m !== null).map((m) => m!.id),
  );

  // Filter providers by benchmark_provider setting, then exclude already-selected models
  const getAvailableProviders = (currentIndex: number) => {
    const currentModel = selectedModels[currentIndex];

    // When provider is not "openrouter", filter to only that provider's models
    const baseProviders =
      benchmarkProvider && benchmarkProvider !== "openrouter"
        ? llmProviders.filter((provider) =>
            provider.models.some((m) =>
              m.id.startsWith(benchmarkProvider + "/"),
            ),
          )
        : llmProviders;

    return baseProviders.map((provider) => ({
      ...provider,
      models: provider.models.filter(
        (model) =>
          (!selectedModelIds.has(model.id) ||
            (currentModel && model.id === currentModel.id)) &&
          (benchmarkProvider === "openrouter" ||
            !benchmarkProvider ||
            model.id.startsWith(benchmarkProvider + "/")),
      ),
    }));
  };

  const canRunBenchmark = selectedModels.some((m) => m !== null);
  const isVerifying = Object.values(modelVerifyStatus).some(
    (s) => s === "verifying",
  );
  const maxModels = 5;
  const canAddMore = selectedModels.length < maxModels;

  const getModelVerificationBadge = (modelId: string) => {
    if (agentType !== "connection") return null;

    const liveStatus = modelVerifyStatus[modelId];
    if (liveStatus === "verifying") {
      return (
        <span className="text-xs text-muted-foreground flex items-center gap-1">
          <svg className="w-3 h-3 animate-spin" fill="none" viewBox="0 0 24 24">
            <circle
              className="opacity-25"
              cx="12"
              cy="12"
              r="10"
              stroke="currentColor"
              strokeWidth="4"
            />
            <path
              className="opacity-75"
              fill="currentColor"
              d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
            />
          </svg>
          verifying
        </span>
      );
    }

    const existing = benchmarkModelsVerified[modelId];
    if (!existing) {
      return (
        <span className="text-xs text-muted-foreground flex items-center gap-1">
          <span className="w-1.5 h-1.5 rounded-full bg-muted-foreground/40 inline-block" />
          not checked
        </span>
      );
    }
    if (existing.verified) {
      return (
        <span className="text-xs text-green-600 flex items-center gap-1">
          <svg
            className="w-3 h-3"
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
          verified
        </span>
      );
    }
    const isExpanded = expandedModelError === modelId;
    const hasDetails = existing.error || modelSampleResponses[modelId];
    return (
      <span className="text-xs text-red-500 flex items-center gap-1.5">
        <svg
          className="w-3 h-3"
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
        failed
        {hasDetails && (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              setExpandedModelError(isExpanded ? null : modelId);
            }}
            className="w-5 h-5 flex items-center justify-center rounded text-muted-foreground hover:text-foreground transition-colors cursor-pointer"
            title="View details"
          >
            <svg
              className={`w-3 h-3 transition-transform ${isExpanded ? "rotate-180" : ""}`}
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
        )}
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            verifyModel(modelId);
          }}
          className="w-5 h-5 flex items-center justify-center rounded text-muted-foreground hover:text-foreground transition-colors cursor-pointer"
          title="Retry verification"
        >
          <svg
            className="w-3 h-3"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={2}
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0l3.181 3.183a8.25 8.25 0 0013.803-3.7M4.031 9.865a8.25 8.25 0 0113.803-3.7l3.181 3.182M20.015 4.356v4.992"
            />
          </svg>
        </button>
      </span>
    );
  };

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
              <div key={index} className="space-y-1">
                <div className="flex items-center gap-2">
                  <div className="flex-1 flex items-center gap-2">
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
                        {selectedModel
                          ? selectedModel.name
                          : "Select a model"}
                      </span>
                      <ChevronDownIcon className="w-4 h-4 text-muted-foreground" />
                    </button>
                    {/* Verification badge for connections */}
                    {selectedModel &&
                      getModelVerificationBadge(selectedModel.id)}
                  </div>

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
                {/* Expanded error details — only for failed models */}
                {selectedModel &&
                  expandedModelError === selectedModel.id &&
                  benchmarkModelsVerified[selectedModel.id] &&
                  !benchmarkModelsVerified[selectedModel.id].verified && (
                    <div className="rounded-lg border border-red-500/20 bg-red-500/5 p-2 space-y-1">
                      {benchmarkModelsVerified[selectedModel.id]?.error && (
                        <p className="text-xs text-red-400">
                          {benchmarkModelsVerified[selectedModel.id].error}
                        </p>
                      )}
                      {modelSampleResponses[selectedModel.id] && (
                        <div className="space-y-1">
                          <p className="text-xs font-medium text-muted-foreground">
                            Your agent responded with:
                          </p>
                          <pre className="text-xs bg-muted rounded-lg p-2 overflow-x-auto text-foreground max-h-32 overflow-y-auto">
                            {JSON.stringify(
                              modelSampleResponses[selectedModel.id],
                              null,
                              2,
                            )}
                          </pre>
                        </div>
                      )}
                    </div>
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
            disabled={!canRunBenchmark || isVerifying}
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
