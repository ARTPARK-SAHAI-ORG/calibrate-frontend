"use client";

import React, { useState } from "react";
import { signOut } from "next-auth/react";
import type { LLMModel } from "./agent-tabs/constants/providers";
import { LLMSelectorModal } from "./agent-tabs/LLMSelectorModal";
import { useOpenRouterModels, useAccessToken } from "@/hooks";
import { overEvalLimit } from "@/lib/evalLimit";
import { getDefaultHeaders } from "@/lib/api";
import { BenchmarkResultsDialog } from "./BenchmarkResultsDialog";
import {
  CloseIcon,
  ChevronDownIcon,
  TrashIcon,
  PlusIcon,
  PlayIcon,
} from "@/components/icons";
import { Button, ConfirmDialog } from "@/components/ui";
import { useHideFloatingButton } from "@/components/AppLayout";
import {
  VerifyRequestPreviewDialog,
  type MessageRow,
} from "@/components/VerifyRequestPreviewDialog";

type TestData = {
  uuid: string;
  name: string;
  description: string;
  type: "response" | "tool_call" | "conversation" | "general";
  config: Record<string, any>;
  created_at: string;
  updated_at: string;
};

type ModelVerificationStatus =
  "unverified" | "verifying" | "verified" | "failed";

type BenchmarkDialogProps = {
  isOpen: boolean;
  onClose: () => void;
  agentUuid: string;
  /** A general agent is probed with one input, not a conversation. */
  agentNature?: "conversation" | "general";
  agentName: string;
  /** The tests to compare the models on. Empty means every test linked to the
   *  agent: the backend runs them all when it is sent no uuids, so comparing
   *  every test does not need the list. */
  tests: TestData[];
  /** How many tests an empty `tests` stands for, for the progress numbers. */
  totalTests?: number;
  onBenchmarkCreated?: (taskId: string) => void;
  agentType?: "agent" | "connection";
  benchmarkModelsVerified?: Record<
    string,
    { verified: boolean; verified_at: string; error: string | null }
  >;
  benchmarkProvider?: string;
};

type ModelVerifications = Record<
  string,
  { verified: boolean; verified_at: string; error: string | null }
>;

/** The saved model checks worth showing on a fresh open: the ones that passed.
 *  A past failure is not carried into a new window. */
function keepVerified(saved?: ModelVerifications): ModelVerifications {
  if (!saved) return {};
  const verified: ModelVerifications = {};
  for (const [id, entry] of Object.entries(saved)) {
    if (entry.verified) verified[id] = entry;
  }
  return verified;
}

export function BenchmarkDialog({
  isOpen,
  onClose,
  agentUuid,
  agentNature = "conversation",
  agentName,
  tests,
  totalTests,
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
  >(() => keepVerified(initialBenchmarkModelsVerified));
  const [modelVerifyStatus, setModelVerifyStatus] = useState<
    Record<string, ModelVerificationStatus>
  >({});

  const [confirmOpen, setConfirmOpen] = useState(false);
  const [verifyDialogOpen, setVerifyDialogOpen] = useState(false);
  const [verifyMessages, setVerifyMessages] = useState<MessageRow[] | null>(
    null,
  );
  const [pendingVerifyAction, setPendingVerifyAction] = useState<
    { type: "run-comparison" } | { type: "retry-all" } | null
  >(null);

  if (!isOpen) return null;

  const handleClose = () => {
    setSelectedModels([null]);
    setShowResults(false);
    setModelVerifyStatus({});
    // A check that failed belongs to the models that were picked this time, so
    // it goes with them. Without this the next open still shows the failure
    // beside a model nobody has picked yet.
    setBenchmarkModelsVerified(keepVerified(initialBenchmarkModelsVerified));
    setModelSampleResponses({});
    setExpandedModelError(null);
    setConfirmOpen(false);
    setVerifyDialogOpen(false);
    setVerifyMessages(null);
    setPendingVerifyAction(null);
    onClose();
  };

  const verifyModel = async (
    modelId: string,
    messages?: MessageRow[],
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
            ...getDefaultHeaders(backendAccessToken),
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            model: modelId,
            ...(messages && messages.length > 0 && { messages }),
          }),
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
    setConfirmOpen(false);
    if (agentType === "connection") {
      const modelsToVerify = selectedModels
        .filter((m): m is LLMModel => m !== null)
        .filter((m) => {
          const existing = benchmarkModelsVerified[m.id];
          return !existing || !existing.verified;
        });

      if (modelsToVerify.length > 0) {
        setPendingVerifyAction({ type: "run-comparison" });
        setVerifyDialogOpen(true);
        return;
      }
    }

    setShowResults(true);
  };

  const runVerificationWithMessages = async (messages: MessageRow[]) => {
    setVerifyMessages(messages);
    const action = pendingVerifyAction;

    const modelsToVerify = selectedModels
      .filter((m): m is LLMModel => m !== null)
      .filter((m) => {
        const existing = benchmarkModelsVerified[m.id];
        return !existing || !existing.verified;
      });

    const results = await Promise.all(
      modelsToVerify.map((m) => verifyModel(m.id, messages)),
    );
    const anyFailed = results.some((r) => !r.verified);
    setVerifyDialogOpen(false);
    setPendingVerifyAction(null);
    if (!anyFailed) {
      setShowResults(true);
    }
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

  const chosenModels = selectedModels.filter((m): m is LLMModel => m !== null);
  // The same rule `handleRunBenchmark` runs on: a connection agent has to pass
  // a check with each model it has not been verified with yet, so the question
  // says so before the reader agrees to it.
  const needsVerification =
    agentType === "connection" &&
    chosenModels.some((m) => !benchmarkModelsVerified[m.id]?.verified);
  // Empty `tests` means every linked test; `totalTests` is how many that is.
  const benchmarkTestCount = tests.length > 0 ? tests.length : totalTests;
  const canRunBenchmark = chosenModels.length > 0;
  const isVerifying = Object.values(modelVerifyStatus).some(
    (s) => s === "verifying",
  );
  const hasFailedModels = selectedModels
    .filter((m): m is LLMModel => m !== null)
    .some((m) => {
      const existing = benchmarkModelsVerified[m.id];
      return existing && !existing.verified;
    });
  // The checks only have something to say once a model is picked, so a window
  // that is still empty gives the whole width to the picker.
  const showStatusColumn =
    agentType === "connection" && selectedModels.some((m) => m !== null);
  const maxModels = 5;
  const canAddMore = selectedModels.length < maxModels;

  const getModelVerificationBadge = (modelId: string) => {
    if (agentType !== "connection") return null;

    const liveStatus = modelVerifyStatus[modelId];
    if (liveStatus === "verifying") {
      return (
        <span className="text-xs text-muted-foreground flex items-center gap-1 shrink-0">
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
        <span className="text-xs text-muted-foreground flex items-center gap-1 shrink-0">
          <span className="w-1.5 h-1.5 rounded-full bg-muted-foreground/40 inline-block" />
          not checked
        </span>
      );
    }
    if (existing.verified) {
      return (
        <span className="text-xs text-green-600 flex items-center gap-1 shrink-0">
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
      <span className="text-xs text-red-500 flex items-center gap-1 shrink-0">
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
        {/* With nothing to show, the cross alone would say nothing. */}
        {!hasDetails && "failed"}
        {hasDetails && (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              setExpandedModelError(isExpanded ? null : modelId);
            }}
            aria-expanded={isExpanded}
            className="flex items-center gap-0.5 rounded-md border border-red-500/40 bg-red-500/10 px-1.5 py-0.5 text-xs font-medium text-red-600 hover:bg-red-500/20 transition-colors cursor-pointer"
          >
            See why
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
      </span>
    );
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
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
        <div className="flex-1 overflow-y-auto px-6 pb-6 pt-1 space-y-4">
          <div className="space-y-3">
            <label className="block text-sm font-medium text-foreground mb-3">
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
                        {selectedModel ? selectedModel.name : "Select a model"}
                      </span>
                      <ChevronDownIcon className="w-4 h-4 text-muted-foreground" />
                    </button>
                    {/* Verification badge for connections, once a model is
                        picked. It sits right after the picker, and is as wide
                        as the longest wording so every picker is the same size
                        and none of them stops short. */}
                    {showStatusColumn && (
                      <div className="min-w-20 shrink-0 flex items-center">
                        {selectedModel &&
                          getModelVerificationBadge(selectedModel.id)}
                      </div>
                    )}
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
          {hasFailedModels && !isVerifying && (
            <button
              onClick={() => {
                setPendingVerifyAction({ type: "retry-all" });
                setVerifyDialogOpen(true);
              }}
              className="h-9 px-4 rounded-md text-sm font-medium bg-red-500 text-white hover:bg-red-600 transition-colors cursor-pointer flex items-center gap-2"
            >
              <svg
                className="w-3.5 h-3.5"
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
              Retry failed
            </button>
          )}
          <Button
            variant="primary"
            size="md"
            onClick={async () => {
              // Every test is run once per model — check the moment the
              // reader tries to run it, before the "are you sure" step,
              // since both counts are already known here.
              if (
                await overEvalLimit(
                  backendAccessToken,
                  (benchmarkTestCount ?? 0) * chosenModels.length,
                  "tests",
                )
              ) {
                return;
              }
              setConfirmOpen(true);
            }}
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
        totalTests={tests.length > 0 ? tests.length : totalTests}
        models={selectedModels.filter((m) => m !== null).map((m) => m!.id)}
        onBenchmarkCreated={onBenchmarkCreated}
      />

      <ConfirmDialog
        isOpen={confirmOpen}
        onClose={() => setConfirmOpen(false)}
        onConfirm={handleRunBenchmark}
        title="Compare the models"
        message={`${
          needsVerification
            ? "Your agent's connection is checked with each model first. Once it works, this"
            : "This"
        } will start the comparison on ${
          benchmarkTestCount === undefined
            ? "every test linked to this agent"
            : `${benchmarkTestCount} ${benchmarkTestCount === 1 ? "test" : "tests"}`
        } with ${chosenModels.map((m) => m.name).join(", ")}. Each test calls your agent once per model, evaluates its response against the evaluation criteria and reports the metrics.`}
        confirmText="Start the comparison"
      />

      <VerifyRequestPreviewDialog
        agentNature={agentNature}
        open={verifyDialogOpen}
        onClose={() => {
          setVerifyDialogOpen(false);
          setPendingVerifyAction(null);
        }}
        onConfirm={runVerificationWithMessages}
        isVerifying={isVerifying}
      />
    </div>
  );
}
