"use client";
import { reportError } from "@/lib/reportError";

import React, { Suspense, useState, useEffect } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useAccessToken } from "@/hooks";
import { AppLayout } from "@/components/AppLayout";
import { DeleteConfirmationDialog } from "@/components/DeleteConfirmationDialog";
import {
  EVALUATOR_TYPE_LABELS,
  EvaluatorTypePill,
  OutputTypePill,
  type EvaluatorType,
} from "@/components/EvaluatorPills";
import { CreateEvaluatorFlow } from "@/components/evaluators/CreateEvaluatorFlow";
import { DuplicateEvaluatorDialog } from "@/components/evaluators/DuplicateEvaluatorDialog";
import {
  type EvaluatorData,
  fetchAllEvaluators,
  deleteEvaluator as deleteEvaluatorRequest,
} from "@/lib/evaluatorApi";
import { EVALUATOR_USE_CASE_OPTIONS } from "@/components/evaluators/evaluatorUseCases";
import { Select } from "@/components/ui/Select";
import { useSidebarState } from "@/lib/sidebar";

type EvaluatorTab = "default" | "mine";

export default function MetricsPage() {
  return (
    <Suspense fallback={null}>
      <MetricsPageInner />
    </Suspense>
  );
}

function MetricsPageInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const backendAccessToken = useAccessToken();
  const [sidebarOpen, setSidebarOpen] = useSidebarState();
  const [searchQuery, setSearchQuery] = useState("");
  const [purposeFilter, setPurposeFilter] = useState<EvaluatorType | "all">(
    "all",
  );
  const [outputTypeFilter, setOutputTypeFilter] = useState<
    "binary" | "rating" | "all"
  >("all");
  const [createFlowOpen, setCreateFlowOpen] = useState(false);
  const [evaluators, setEvaluators] = useState<EvaluatorData[]>([]);
  const [evaluatorsLoading, setEvaluatorsLoading] = useState(true);
  // Active tab is mirrored to the URL via `?tab=default|mine` so it survives
  // page reloads and is restored when the user clicks back from a detail page.
  const [activeTab, setActiveTab] = useState<EvaluatorTab>(() => {
    const t = searchParams.get("tab");
    return t === "default" ? "default" : "mine";
  });

  // Keep state in sync if the URL changes (e.g. back/forward navigation).
  useEffect(() => {
    const t = searchParams.get("tab");
    const next: EvaluatorTab = t === "default" ? "default" : "mine";
    setActiveTab((prev) => (prev === next ? prev : next));
  }, [searchParams]);

  // Update both state and URL together so the tab survives reloads and
  // back-navigation from `/evaluators/[uuid]`. `replace` avoids polluting
  // history with one entry per tab toggle.
  const changeActiveTab = (tab: EvaluatorTab) => {
    setActiveTab(tab);
    router.replace(`/evaluators?tab=${tab}`);
  };

  // Set page title
  useEffect(() => {
    document.title = "Evaluators | Calibrate";
  }, []);
  const [evaluatorsError, setEvaluatorsError] = useState<string | null>(null);

  // Delete confirmation state
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [evaluatorToDelete, setEvaluatorToDelete] =
    useState<EvaluatorData | null>(null);
  const [isEvaluatorDeleting, setIsEvaluatorDeleting] = useState(false);

  // Duplicate dialog state
  const [duplicateDialogOpen, setDuplicateDialogOpen] = useState(false);
  const [evaluatorToDuplicate, setEvaluatorToDuplicate] =
    useState<EvaluatorData | null>(null);

  // Fetch evaluators from backend
  const loadEvaluators = async () => {
    if (!backendAccessToken) return;
    try {
      setEvaluatorsLoading(true);
      setEvaluatorsError(null);
      setEvaluators(await fetchAllEvaluators(backendAccessToken));
    } catch (err) {
      reportError("Error fetching evaluators:", err);
      setEvaluatorsError(
        err instanceof Error ? err.message : "Failed to load evaluators",
      );
    } finally {
      setEvaluatorsLoading(false);
    }
  };

  useEffect(() => {
    loadEvaluators();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [backendAccessToken]);

  // Open delete confirmation dialog
  const openDeleteDialog = (evaluator: EvaluatorData) => {
    setEvaluatorToDelete(evaluator);
    setDeleteDialogOpen(true);
  };

  // Close delete confirmation dialog
  const closeDeleteDialog = () => {
    if (!isEvaluatorDeleting) {
      setDeleteDialogOpen(false);
      setEvaluatorToDelete(null);
    }
  };

  // Delete evaluator from backend
  const deleteEvaluator = async () => {
    if (!evaluatorToDelete || !backendAccessToken) return;
    try {
      setIsEvaluatorDeleting(true);
      await deleteEvaluatorRequest(evaluatorToDelete.uuid, backendAccessToken);
      setEvaluators((prev) =>
        prev.filter((e) => e.uuid !== evaluatorToDelete.uuid),
      );
      closeDeleteDialog();
    } catch (err) {
      reportError("Error deleting evaluator:", err);
    } finally {
      setIsEvaluatorDeleting(false);
    }
  };

  // Open duplicate dialog
  const openDuplicateDialog = (evaluator: EvaluatorData) => {
    setEvaluatorToDuplicate(evaluator);
    setDuplicateDialogOpen(true);
  };

  // Close duplicate dialog
  const closeDuplicateDialog = () => {
    setDuplicateDialogOpen(false);
    setEvaluatorToDuplicate(null);
  };

  // Handle evaluator duplicated - refetch list then open the new detail page
  const handleEvaluatorDuplicated = async (newEvaluator: EvaluatorData) => {
    await loadEvaluators();
    router.push(`/evaluators/${newEvaluator.uuid}`);
  };

  // Partition into default vs user-owned evaluators
  const defaultEvaluators = evaluators.filter((e) => !e.owner_user_id);
  const myEvaluators = evaluators.filter((e) => !!e.owner_user_id);

  const activeList = activeTab === "default" ? defaultEvaluators : myEvaluators;

  // Filter by search query, purpose, and output type within the active tab
  const query = searchQuery.trim().toLowerCase();
  const filteredEvaluators = activeList.filter((evaluator) => {
    if (
      query &&
      !(
        (evaluator.name && evaluator.name.toLowerCase().includes(query)) ||
        (evaluator.description &&
          evaluator.description.toLowerCase().includes(query))
      )
    ) {
      return false;
    }
    if (purposeFilter !== "all" && evaluator.evaluator_type !== purposeFilter) {
      return false;
    }
    if (
      outputTypeFilter !== "all" &&
      evaluator.output_type !== outputTypeFilter
    ) {
      return false;
    }
    return true;
  });

  return (
    <AppLayout
      activeItem="evaluators"
      onItemChange={(itemId) => router.push(`/${itemId}`)}
      sidebarOpen={sidebarOpen}
      onSidebarToggle={() => setSidebarOpen(!sidebarOpen)}
    >
      <div className="space-y-4 md:space-y-6 py-4 md:py-6">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
          <div>
            <h1 className="text-xl md:text-2xl font-semibold">Evaluators</h1>
            <p className="text-muted-foreground text-sm md:text-base leading-relaxed mt-1">
              Build, manage and align LLM judges to evaluate your agents
            </p>
          </div>
          <button
            onClick={() => setCreateFlowOpen(true)}
            className="h-9 md:h-10 px-4 rounded-md text-sm md:text-base font-medium bg-foreground text-background hover:opacity-90 transition-opacity cursor-pointer flex-shrink-0"
          >
            Add evaluator
          </button>
        </div>

        {/* Tabs */}
        <div className="flex items-center gap-4 md:gap-6 border-b border-border">
          <button
            onClick={() => changeActiveTab("mine")}
            className={`pb-2 text-sm md:text-base font-medium transition-colors cursor-pointer whitespace-nowrap border-b-2 -mb-px ${
              activeTab === "mine"
                ? "border-foreground text-foreground"
                : "border-transparent text-muted-foreground hover:text-foreground"
            }`}
          >
            My evaluators ({myEvaluators.length})
          </button>
          <button
            onClick={() => changeActiveTab("default")}
            className={`pb-2 text-sm md:text-base font-medium transition-colors cursor-pointer whitespace-nowrap border-b-2 -mb-px ${
              activeTab === "default"
                ? "border-foreground text-foreground"
                : "border-transparent text-muted-foreground hover:text-foreground"
            }`}
          >
            Default ({defaultEvaluators.length})
          </button>
        </div>

        {/* Search + Filters */}
        <div className="flex flex-col md:flex-row md:items-center gap-2 md:gap-3">
          <div className="relative w-full md:max-w-md">
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
              placeholder="Search evaluators"
              className="w-full h-9 md:h-10 pl-10 pr-4 rounded-md text-sm md:text-base border border-border bg-background dark:bg-muted text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-accent focus:border-transparent"
            />
          </div>
          <div className="flex items-center gap-2 md:gap-3">
            <Select
              value={purposeFilter}
              onChange={(e) =>
                setPurposeFilter(e.target.value as EvaluatorType | "all")
              }
              className="h-9 md:h-10 text-sm md:text-base dark:bg-muted cursor-pointer"
              aria-label="Filter by purpose"
            >
              <option value="all">All purposes</option>
              {EVALUATOR_USE_CASE_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {EVALUATOR_TYPE_LABELS[opt.value]}
                </option>
              ))}
            </Select>
            <Select
              value={outputTypeFilter}
              onChange={(e) =>
                setOutputTypeFilter(
                  e.target.value as "binary" | "rating" | "all",
                )
              }
              className="h-9 md:h-10 text-sm md:text-base dark:bg-muted cursor-pointer"
              aria-label="Filter by output type"
            >
              <option value="all">All outputs</option>
              <option value="binary">Binary</option>
              <option value="rating">Rating</option>
            </Select>
          </div>
        </div>

        {/* Metrics List / Loading / Error / Empty State */}
        {evaluatorsLoading ? (
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
        ) : evaluatorsError ? (
          <div className="border border-border rounded-xl p-8 md:p-12 flex flex-col items-center justify-center bg-muted/20">
            <p className="text-sm md:text-base text-red-500 mb-2">
              {evaluatorsError}
            </p>
            <button
              onClick={() => window.location.reload()}
              className="text-sm md:text-base text-muted-foreground hover:text-foreground transition-colors cursor-pointer"
            >
              Retry
            </button>
          </div>
        ) : filteredEvaluators.length === 0 ? (
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
                  d="M9 12.75L11.25 15 15 9.75M21 12c0 1.268-.63 2.39-1.593 3.068a3.745 3.745 0 01-1.043 3.296 3.745 3.745 0 01-3.296 1.043A3.745 3.745 0 0112 21c-1.268 0-2.39-.63-3.068-1.593a3.746 3.746 0 01-3.296-1.043 3.745 3.745 0 01-1.043-3.296A3.745 3.745 0 013 12c0-1.268.63-2.39 1.593-3.068a3.745 3.745 0 011.043-3.296 3.746 3.746 0 013.296-1.043A3.746 3.746 0 0112 3c1.268 0 2.39.63 3.068 1.593a3.746 3.746 0 013.296 1.043 3.746 3.746 0 011.043 3.296A3.745 3.745 0 0121 12z"
                />
              </svg>
            </div>
            <h3 className="text-base md:text-lg font-semibold text-foreground mb-1">
              No evaluators found
            </h3>
            <p className="text-sm md:text-base text-muted-foreground mb-3 md:mb-4 text-center">
              {searchQuery ||
              purposeFilter !== "all" ||
              outputTypeFilter !== "all"
                ? "No evaluators match your filters"
                : activeTab === "default"
                  ? "No default evaluators available"
                  : "You haven't created any evaluators yet"}
            </p>
            {activeTab === "mine" &&
              !searchQuery &&
              purposeFilter === "all" &&
              outputTypeFilter === "all" && (
                <button
                  onClick={() => setCreateFlowOpen(true)}
                  className="h-9 md:h-10 px-4 rounded-md text-sm md:text-base font-medium border border-border bg-background hover:bg-muted/50 transition-colors cursor-pointer"
                >
                  Add evaluator
                </button>
              )}
          </div>
        ) : (
          <div className="space-y-3">
            {filteredEvaluators.map((evaluator) => {
              const isDefault = !evaluator.owner_user_id;
              return (
                <div
                  key={evaluator.uuid}
                  className="relative border border-border rounded-xl bg-background dark:bg-muted px-4 py-4 md:px-5 md:py-4 transition-colors cursor-pointer hover:bg-muted/20 dark:hover:bg-accent"
                >
                  {/* Stretched link: covers the whole row so the card behaves
                      like a real <a> — left-click navigates, right-click /
                      cmd-click opens in a new tab. The action buttons below
                      restore pointer-events to sit above this overlay. */}
                  <Link
                    href={`/evaluators/${evaluator.uuid}`}
                    aria-label={`Open ${evaluator.name}`}
                    className="absolute inset-0 rounded-xl z-0"
                  />
                  <div className="relative z-10 pointer-events-none flex items-start justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <h3 className="text-base md:text-lg font-semibold text-foreground">
                          {evaluator.name}
                        </h3>
                        {evaluator.evaluator_type && (
                          <EvaluatorTypePill
                            evaluatorType={evaluator.evaluator_type}
                          />
                        )}
                        {evaluator.output_type && (
                          <OutputTypePill outputType={evaluator.output_type} />
                        )}
                      </div>
                      {evaluator.description && (
                        <p className="text-sm text-muted-foreground mt-2 leading-relaxed">
                          {evaluator.description}
                        </p>
                      )}
                    </div>
                    <div className="flex items-center gap-1 flex-shrink-0 pointer-events-auto">
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          openDuplicateDialog(evaluator);
                        }}
                        className="h-8 md:h-9 px-3 rounded-md text-xs md:text-sm font-medium border border-border bg-background hover:bg-muted/50 transition-colors cursor-pointer flex items-center gap-1.5"
                        title="Duplicate evaluator"
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
                      {!isDefault && (
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            openDeleteDialog(evaluator);
                          }}
                          className="w-8 h-8 md:w-9 md:h-9 flex items-center justify-center rounded-md text-muted-foreground hover:text-red-500 hover:bg-red-500/10 transition-colors cursor-pointer"
                          title="Delete evaluator"
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
                              d="M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 01-2.244 2.077H8.084a2.25 2.25 0 01-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 00-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 013.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 00-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 00-7.5 0"
                            />
                          </svg>
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Create evaluator flow (use-case picker → sidebar → judge model) */}
      <CreateEvaluatorFlow
        open={createFlowOpen}
        onClose={() => setCreateFlowOpen(false)}
        existingEvaluators={evaluators}
        onCreated={async () => {
          await loadEvaluators();
          changeActiveTab("mine");
        }}
      />

      {/* Duplicate Evaluator Dialog */}
      {duplicateDialogOpen && evaluatorToDuplicate && (
        <DuplicateEvaluatorDialog
          originalEvaluator={evaluatorToDuplicate}
          existingEvaluators={evaluators}
          onClose={closeDuplicateDialog}
          onDuplicated={handleEvaluatorDuplicated}
          backendAccessToken={backendAccessToken ?? undefined}
        />
      )}

      {/* Delete Confirmation Dialog */}
      <DeleteConfirmationDialog
        isOpen={deleteDialogOpen}
        onClose={closeDeleteDialog}
        onConfirm={deleteEvaluator}
        title="Delete evaluator"
        message={`Are you sure you want to delete "${evaluatorToDelete?.name}"?`}
        confirmText="Delete"
        isDeleting={isEvaluatorDeleting}
      />
    </AppLayout>
  );
}
