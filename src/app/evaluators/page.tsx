"use client";

import React, { Suspense, useState, useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { signOut } from "next-auth/react";
import {
  useAccessToken,
  useOpenRouterModels,
  findModelInProviders,
} from "@/hooks";
import { AppLayout, useHideFloatingButton } from "@/components/AppLayout";
import { DeleteConfirmationDialog } from "@/components/DeleteConfirmationDialog";
import {
  EVALUATOR_TYPE_LABELS,
  EVALUATOR_TYPE_TOOLTIPS,
  EvaluatorTypePill,
  OutputTypePill,
  type EvaluatorType,
} from "@/components/EvaluatorPills";
import { LLMSelectorModal } from "@/components/agent-tabs/LLMSelectorModal";
import type { LLMModel } from "@/components/agent-tabs/constants/providers";
import { useSidebarState } from "@/lib/sidebar";

type MetricData = {
  uuid: string;
  name: string;
  description: string;
  created_at: string;
  updated_at: string;
  owner_user_id?: string | null;
  data_type?: "text" | "audio";
  kind?: "single" | "side_by_side";
  output_type?: "binary" | "rating";
  evaluator_type?: EvaluatorType;
};

type EvaluatorTab = "default" | "mine";

const EVALUATOR_TYPE_TO_DATA_TYPE: Record<EvaluatorType, "text" | "audio"> = {
  tts: "audio",
  stt: "audio",
  llm: "text",
  simulation: "text",
};

const EVALUATOR_TYPE_OPTIONS: {
  value: EvaluatorType;
  title: string;
  description: string;
}[] = [
  {
    value: "tts",
    title: "Text to Speech (TTS)",
    description:
      "Evaluate the quality of generated audio (e.g. naturalness, pronunciation, clarity)",
  },
  {
    value: "stt",
    title: "Speech to Text",
    description: "Evaluate the transcription quality against a reference text",
  },
  {
    value: "llm",
    title: "LLM response",
    description:
      "Given a conversation history, evaluate the agent's next response",
  },
  {
    value: "simulation",
    title: "Simulation",
    description:
      "Evaluate the agent's performance in an entire conversation history",
  },
];

// Extracts unique `{{var_name}}` placeholders from a system prompt, preserving
// the order in which they first appear. Only valid identifier names are
// recognized — `{{ }}`, `{{ my var }}`, etc. are ignored.
function extractVariableNames(prompt: string): string[] {
  const regex = /\{\{\s*([a-zA-Z_][a-zA-Z0-9_]*)\s*\}\}/g;
  const seen = new Set<string>();
  const result: string[] = [];
  let match: RegExpExecArray | null;
  while ((match = regex.exec(prompt)) !== null) {
    const name = match[1];
    if (!seen.has(name)) {
      seen.add(name);
      result.push(name);
    }
  }
  return result;
}

const JUDGE_PROVIDER_SLUGS = [
  "openai",
  "anthropic",
  "google",
  "meta-llama",
  "mistralai",
  "x-ai",
  "qwen",
  "moonshotai",
];

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
  // Used to resolve a judge model id (returned by `/evaluators/default-prompt`)
  // into a full `LLMModel` with display name + modalities so the prefilled
  // chip and the LLM selector modal show the right label.
  const { providers: llmProviders } = useOpenRouterModels();
  const [sidebarOpen, setSidebarOpen] = useSidebarState();
  const [searchQuery, setSearchQuery] = useState("");
  const [purposeFilter, setPurposeFilter] = useState<EvaluatorType | "all">(
    "all",
  );
  const [outputTypeFilter, setOutputTypeFilter] = useState<
    "binary" | "rating" | "all"
  >("all");
  const [addMetricSidebarOpen, setAddMetricSidebarOpen] = useState(false);
  const [metrics, setMetrics] = useState<MetricData[]>([]);
  const [metricsLoading, setMetricsLoading] = useState(true);
  // Active tab is mirrored to the URL via `?tab=default|mine` so it survives
  // page reloads and is restored when the user clicks back from a detail page.
  const [activeTab, setActiveTab] = useState<EvaluatorTab>(() => {
    const t = searchParams.get("tab");
    return t === "mine" ? "mine" : "default";
  });

  // Keep state in sync if the URL changes (e.g. back/forward navigation).
  useEffect(() => {
    const t = searchParams.get("tab");
    const next: EvaluatorTab = t === "mine" ? "mine" : "default";
    setActiveTab((prev) => (prev === next ? prev : next));
  }, [searchParams]);

  // Update both state and URL together so the tab survives reloads and
  // back-navigation from `/evaluators/[uuid]`. `replace` avoids polluting
  // history with one entry per tab toggle.
  const changeActiveTab = (tab: EvaluatorTab) => {
    setActiveTab(tab);
    router.replace(`/evaluators?tab=${tab}`);
  };

  // Hide the floating "Talk to Us" button when the add/edit metric sidebar is open
  useHideFloatingButton(addMetricSidebarOpen);

  // Set page title
  useEffect(() => {
    document.title = "Evaluators | Calibrate";
  }, []);
  const [metricsError, setMetricsError] = useState<string | null>(null);
  const [isCreating, setIsCreating] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);
  const [editingMetricUuid, setEditingMetricUuid] = useState<string | null>(
    null,
  );
  const [isLoadingMetric, setIsLoadingMetric] = useState(false);
  const [validationAttempted, setValidationAttempted] = useState(false);

  // Form fields
  const [metricName, setMetricName] = useState("");
  const [metricDescription, setMetricDescription] = useState("");

  // Use case picker (shown before opening the create sidebar)
  const [useCasePickerOpen, setUseCasePickerOpen] = useState(false);

  // New-evaluator setup picker state (only used in create flow)
  const [newEvaluatorType, setNewEvaluatorType] =
    useState<EvaluatorType | null>(null);
  const [newEvaluatorJudgeModel, setNewEvaluatorJudgeModel] =
    useState<LLMModel | null>(null);
  const [newEvaluatorSystemPrompt, setNewEvaluatorSystemPrompt] = useState("");
  // Per-variable description (`VariableSpec.description`) keyed by variable
  // name. Stays populated for variables the user removes from the prompt so
  // re-adding the same `{{name}}` later restores the description.
  const [newEvaluatorVariableDescriptions, setNewEvaluatorVariableDescriptions] =
    useState<Record<string, string>>({});
  const [llmModalOpen, setLlmModalOpen] = useState(false);
  const [newEvaluatorOutputType, setNewEvaluatorOutputType] = useState<
    "binary" | "rating"
  >("binary");
  const [newEvaluatorScale, setNewEvaluatorScale] = useState<
    { value: number; name: string; description: string }[]
  >([
    { value: 1, name: "", description: "" },
    { value: 2, name: "", description: "" },
    { value: 3, name: "", description: "" },
  ]);

  // Delete confirmation state
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [metricToDelete, setMetricToDelete] = useState<MetricData | null>(null);
  const [isMetricDeleting, setIsMetricDeleting] = useState(false);

  // Duplicate dialog state
  const [duplicateDialogOpen, setDuplicateDialogOpen] = useState(false);
  const [metricToDuplicate, setMetricToDuplicate] = useState<MetricData | null>(
    null,
  );

  // Fetch metrics from backend
  useEffect(() => {
    const fetchMetrics = async () => {
      if (!backendAccessToken) return;

      try {
        setMetricsLoading(true);
        setMetricsError(null);
        const backendUrl = process.env.NEXT_PUBLIC_BACKEND_URL;
        if (!backendUrl) {
          throw new Error("BACKEND_URL environment variable is not set");
        }

        const response = await fetch(
          `${backendUrl}/evaluators?include_defaults=true`,
          {
            method: "GET",
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
          throw new Error("Failed to fetch evaluators");
        }

        const data: MetricData[] = await response.json();
        setMetrics(data);
      } catch (err) {
        console.error("Error fetching evaluators:", err);
        setMetricsError(
          err instanceof Error ? err.message : "Failed to load evaluators",
        );
      } finally {
        setMetricsLoading(false);
      }
    };

    fetchMetrics();
  }, [backendAccessToken]);

  // When `/evaluators/default-prompt` returns a `judge_model` id and the
  // OpenRouter providers haven't loaded yet, we set a stub `{ id, name: id }`
  // model so the form has *something* to validate against. Once providers
  // load, replace it with the real `LLMModel` so the chip shows the friendly
  // name and downstream modality filtering works correctly.
  useEffect(() => {
    if (!newEvaluatorJudgeModel || llmProviders.length === 0) return;
    const found = findModelInProviders(llmProviders, newEvaluatorJudgeModel.id);
    if (found && found.name !== newEvaluatorJudgeModel.name) {
      setNewEvaluatorJudgeModel(found);
    }
  }, [llmProviders, newEvaluatorJudgeModel]);

  // Prefill the create-evaluator form with the canonical default prompt for
  // the chosen use case. Triggered by `UseCasePickerDialog.onSelect` whenever
  // the user picks a *different* purpose than what's currently in state — so
  // re-opening the picker and re-selecting the same purpose preserves any
  // edits the user has made.
  const prefillDefaultPrompt = async (purpose: EvaluatorType) => {
    try {
      const backendUrl = process.env.NEXT_PUBLIC_BACKEND_URL;
      if (!backendUrl || !backendAccessToken) return;

      const response = await fetch(
        `${backendUrl}/evaluators/default-prompt?purpose=${purpose}`,
        {
          method: "GET",
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

      // On any other failure, leave the form blank — prefill is best-effort
      // and shouldn't block the create flow.
      if (!response.ok) {
        console.error(
          "Failed to fetch default prompt for purpose:",
          purpose,
          response.status,
        );
        return;
      }

      const data: {
        name: string | null;
        system_prompt: string;
        judge_model: string;
        output_type: "binary" | "rating";
        output_config: {
          scale: {
            value: number | boolean;
            name: string;
            description?: string;
            color?: string;
          }[];
        } | null;
      } = await response.json();

      // `name` is null for `purpose === "simulation"` (no seeded evaluator
      // name); the user must type their own. For all other purposes the
      // server returns a suggested slug-style name we drop straight in.
      setMetricName(data.name ?? "");
      setNewEvaluatorSystemPrompt(data.system_prompt ?? "");
      setNewEvaluatorOutputType(data.output_type);

      if (data.judge_model) {
        const found =
          llmProviders.length > 0
            ? findModelInProviders(llmProviders, data.judge_model)
            : null;
        setNewEvaluatorJudgeModel(
          found ?? { id: data.judge_model, name: data.judge_model },
        );
      }

      // Only seed the rating scale state when the purpose's default is a
      // rating evaluator; otherwise leave the existing 1/2/3 placeholder
      // rows alone so the user sees something sensible if they later flip
      // the toggle to `rating`.
      if (
        data.output_type === "rating" &&
        data.output_config?.scale &&
        data.output_config.scale.length >= 2
      ) {
        setNewEvaluatorScale(
          data.output_config.scale.map((row) => ({
            value: typeof row.value === "number" ? row.value : 0,
            name: row.name ?? "",
            description: row.description ?? "",
          })),
        );
      }
    } catch (err) {
      console.error("Error prefilling default prompt:", err);
    }
  };

  // Open delete confirmation dialog
  const openDeleteDialog = (metric: MetricData) => {
    setMetricToDelete(metric);
    setDeleteDialogOpen(true);
  };

  // Close delete confirmation dialog
  const closeDeleteDialog = () => {
    if (!isMetricDeleting) {
      setDeleteDialogOpen(false);
      setMetricToDelete(null);
    }
  };

  // Delete evaluator from backend
  const deleteMetric = async () => {
    if (!metricToDelete) return;

    try {
      setIsMetricDeleting(true);
      const backendUrl = process.env.NEXT_PUBLIC_BACKEND_URL;
      if (!backendUrl) {
        throw new Error("BACKEND_URL environment variable is not set");
      }

      const response = await fetch(
        `${backendUrl}/evaluators/${metricToDelete.uuid}`,
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
        throw new Error("Failed to delete evaluator");
      }

      // Remove the evaluator from local state
      setMetrics(
        metrics.filter((metric) => metric.uuid !== metricToDelete.uuid),
      );
      closeDeleteDialog();
    } catch (err) {
      console.error("Error deleting evaluator:", err);
    } finally {
      setIsMetricDeleting(false);
    }
  };

  // Open duplicate dialog
  const openDuplicateDialog = (metric: MetricData) => {
    setMetricToDuplicate(metric);
    setDuplicateDialogOpen(true);
  };

  // Close duplicate dialog
  const closeDuplicateDialog = () => {
    setDuplicateDialogOpen(false);
    setMetricToDuplicate(null);
  };

  // Handle metric duplicated - open edit form with duplicated metric data
  const handleMetricDuplicated = async (newMetric: MetricData) => {
    // Refetch metrics list to get updated data
    const backendUrl = process.env.NEXT_PUBLIC_BACKEND_URL;
    if (backendUrl) {
      try {
        const metricsResponse = await fetch(`${backendUrl}/metrics`, {
          method: "GET",
          headers: {
            accept: "application/json",
            "ngrok-skip-browser-warning": "true",
            Authorization: `Bearer ${backendAccessToken}`,
          },
        });

        if (metricsResponse.status === 401) {
          await signOut({ callbackUrl: "/login" });
          return;
        }

        if (metricsResponse.ok) {
          const updatedMetrics: MetricData[] = await metricsResponse.json();
          setMetrics(updatedMetrics);
        }
      } catch (err) {
        console.error("Error refetching metrics:", err);
      }
    }
    // Navigate to the new evaluator's detail page
    router.push(`/evaluators/${newMetric.uuid}`);
  };

  // Reset form fields
  const resetForm = () => {
    setMetricName("");
    setMetricDescription("");
    setEditingMetricUuid(null);
    setCreateError(null);
    setValidationAttempted(false);
    setNewEvaluatorType(null);
    setNewEvaluatorJudgeModel(null);
    setNewEvaluatorSystemPrompt("");
    setNewEvaluatorVariableDescriptions({});
    setNewEvaluatorOutputType("binary");
    setNewEvaluatorScale([
      { value: 1, name: "", description: "" },
      { value: 2, name: "", description: "" },
      { value: 3, name: "", description: "" },
    ]);
  };

  // Check if the name already exists (excluding current metric being edited)
  const isNameDuplicate = (name: string): boolean => {
    const trimmedName = name.trim().toLowerCase();
    return metrics.some(
      (m) =>
        m.name.toLowerCase() === trimmedName && m.uuid !== editingMetricUuid,
    );
  };

  // Create evaluator via POST API
  const createMetric = async () => {
    setValidationAttempted(true);
    const scaleValid =
      newEvaluatorOutputType === "binary" ||
      (newEvaluatorScale.length >= 2 &&
        newEvaluatorScale.every((row) => row.name.trim().length > 0));
    if (
      !metricName.trim() ||
      isNameDuplicate(metricName) ||
      !newEvaluatorType ||
      !newEvaluatorJudgeModel ||
      !newEvaluatorSystemPrompt.trim() ||
      !scaleValid
    ) {
      return;
    }

    try {
      setIsCreating(true);
      setCreateError(null);
      const backendUrl = process.env.NEXT_PUBLIC_BACKEND_URL;
      if (!backendUrl) {
        throw new Error("BACKEND_URL environment variable is not set");
      }

      const response = await fetch(`${backendUrl}/evaluators`, {
        method: "POST",
        headers: {
          accept: "application/json",
          "Content-Type": "application/json",
          "ngrok-skip-browser-warning": "true",
          Authorization: `Bearer ${backendAccessToken}`,
        },
        body: JSON.stringify({
          name: metricName.trim(),
          description: metricDescription.trim(),
          evaluator_type: newEvaluatorType,
          data_type: EVALUATOR_TYPE_TO_DATA_TYPE[newEvaluatorType],
          kind: "single",
          output_type: newEvaluatorOutputType,
          version: {
            judge_model: newEvaluatorJudgeModel.id,
            system_prompt: newEvaluatorSystemPrompt.trim(),
            ...(newEvaluatorType === "llm" &&
            extractVariableNames(newEvaluatorSystemPrompt).length > 0
              ? {
                  variables: extractVariableNames(newEvaluatorSystemPrompt).map(
                    (name) => {
                      const description = (
                        newEvaluatorVariableDescriptions[name] ?? ""
                      ).trim();
                      return description.length > 0
                        ? { name, description }
                        : { name };
                    },
                  ),
                }
              : {}),
            ...(newEvaluatorOutputType === "rating"
              ? {
                  output_config: {
                    scale: newEvaluatorScale.map((row) => ({
                      value: row.value,
                      name: row.name.trim(),
                      ...(row.description.trim()
                        ? { description: row.description.trim() }
                        : {}),
                    })),
                  },
                }
              : {}),
          },
        }),
      });

      if (response.status === 401) {
        await signOut({ callbackUrl: "/login" });
        return;
      }

      if (!response.ok) {
        throw new Error("Failed to create evaluator");
      }

      // Refetch the evaluators list to get the updated data
      const listResponse = await fetch(
        `${backendUrl}/evaluators?include_defaults=true`,
        {
          method: "GET",
          headers: {
            accept: "application/json",
            "ngrok-skip-browser-warning": "true",
            Authorization: `Bearer ${backendAccessToken}`,
          },
        },
      );

      if (listResponse.ok) {
        const updated: MetricData[] = await listResponse.json();
        setMetrics(updated);
      }

      // Reset form fields and close sidebar
      resetForm();
      setAddMetricSidebarOpen(false);
      changeActiveTab("mine");
    } catch (err) {
      console.error("Error creating evaluator:", err);
      setCreateError(
        err instanceof Error ? err.message : "Failed to create evaluator",
      );
    } finally {
      setIsCreating(false);
    }
  };

  // Fetch metric details by UUID and open edit sidebar
  const openEditMetric = async (uuid: string) => {
    try {
      setIsLoadingMetric(true);
      setEditingMetricUuid(uuid);
      setAddMetricSidebarOpen(true);
      setCreateError(null);

      const backendUrl = process.env.NEXT_PUBLIC_BACKEND_URL;
      if (!backendUrl) {
        throw new Error("BACKEND_URL environment variable is not set");
      }

      const response = await fetch(`${backendUrl}/metrics/${uuid}`, {
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
        throw new Error("Failed to fetch metric details");
      }

      const metricData: MetricData = await response.json();

      // Populate form fields with metric data
      setMetricName(metricData.name || "");
      setMetricDescription(metricData.description || "");
    } catch (err) {
      console.error("Error fetching metric:", err);
      setCreateError(
        err instanceof Error ? err.message : "Failed to load metric",
      );
    } finally {
      setIsLoadingMetric(false);
    }
  };

  // Update existing metric via PUT API
  const updateMetric = async () => {
    setValidationAttempted(true);
    if (!metricName.trim() || isNameDuplicate(metricName) || !editingMetricUuid)
      return;

    try {
      setIsCreating(true);
      setCreateError(null);
      const backendUrl = process.env.NEXT_PUBLIC_BACKEND_URL;
      if (!backendUrl) {
        throw new Error("BACKEND_URL environment variable is not set");
      }

      const response = await fetch(
        `${backendUrl}/metrics/${editingMetricUuid}`,
        {
          method: "PUT",
          headers: {
            accept: "application/json",
            "Content-Type": "application/json",
            "ngrok-skip-browser-warning": "true",
            Authorization: `Bearer ${backendAccessToken}`,
          },
          body: JSON.stringify({
            name: metricName.trim(),
            description: metricDescription.trim(),
          }),
        },
      );

      if (response.status === 401) {
        await signOut({ callbackUrl: "/login" });
        return;
      }

      if (!response.ok) {
        throw new Error("Failed to update metric");
      }

      // Refetch the metrics list to get the updated data
      const metricsResponse = await fetch(`${backendUrl}/metrics`, {
        method: "GET",
        headers: {
          accept: "application/json",
          "ngrok-skip-browser-warning": "true",
          Authorization: `Bearer ${backendAccessToken}`,
        },
      });

      if (metricsResponse.ok) {
        const updatedMetrics: MetricData[] = await metricsResponse.json();
        setMetrics(updatedMetrics);
      }

      // Reset and close
      resetForm();
      setAddMetricSidebarOpen(false);
    } catch (err) {
      console.error("Error updating metric:", err);
      setCreateError(
        err instanceof Error ? err.message : "Failed to update metric",
      );
    } finally {
      setIsCreating(false);
    }
  };

  // Detect `{{var}}` placeholders in the create-flow system prompt. Only LLM
  // evaluators support variables; for other types we surface a warning if the
  // user types any so the prompt doesn't silently include unsupported tokens.
  const detectedPromptVariables = extractVariableNames(
    newEvaluatorSystemPrompt,
  );
  const variablesSupported = newEvaluatorType === "llm";

  // Partition into default vs user-owned evaluators
  const defaultEvaluators = metrics.filter((m) => !m.owner_user_id);
  const myEvaluators = metrics.filter((m) => !!m.owner_user_id);

  const activeList = activeTab === "default" ? defaultEvaluators : myEvaluators;

  // Filter by search query, purpose, and output type within the active tab
  const query = searchQuery.trim().toLowerCase();
  const filteredMetrics = activeList.filter((metric) => {
    if (
      query &&
      !(
        (metric.name && metric.name.toLowerCase().includes(query)) ||
        (metric.description && metric.description.toLowerCase().includes(query))
      )
    ) {
      return false;
    }
    if (purposeFilter !== "all" && metric.evaluator_type !== purposeFilter) {
      return false;
    }
    if (outputTypeFilter !== "all" && metric.output_type !== outputTypeFilter) {
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
            onClick={() => {
              resetForm();
              setUseCasePickerOpen(true);
            }}
            className="h-9 md:h-10 px-4 rounded-md text-sm md:text-base font-medium bg-foreground text-background hover:opacity-90 transition-opacity cursor-pointer flex-shrink-0"
          >
            Add evaluator
          </button>
        </div>

        {/* Tabs */}
        <div className="flex items-center gap-4 md:gap-6 border-b border-border">
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
            <div className="relative">
              <select
                value={purposeFilter}
                onChange={(e) =>
                  setPurposeFilter(e.target.value as EvaluatorType | "all")
                }
                className="appearance-none h-9 md:h-10 pl-3 pr-9 rounded-md text-sm md:text-base border border-border bg-background dark:bg-muted text-foreground focus:outline-none focus:ring-2 focus:ring-accent focus:border-transparent cursor-pointer"
                aria-label="Filter by purpose"
              >
                <option value="all">All purposes</option>
                {EVALUATOR_TYPE_OPTIONS.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {EVALUATOR_TYPE_LABELS[opt.value]}
                  </option>
                ))}
              </select>
              <svg
                className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground"
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
            </div>
            <div className="relative">
              <select
                value={outputTypeFilter}
                onChange={(e) =>
                  setOutputTypeFilter(
                    e.target.value as "binary" | "rating" | "all",
                  )
                }
                className="appearance-none h-9 md:h-10 pl-3 pr-9 rounded-md text-sm md:text-base border border-border bg-background dark:bg-muted text-foreground focus:outline-none focus:ring-2 focus:ring-accent focus:border-transparent cursor-pointer"
                aria-label="Filter by output type"
              >
                <option value="all">All outputs</option>
                <option value="binary">Binary</option>
                <option value="rating">Rating</option>
              </select>
              <svg
                className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground"
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
            </div>
          </div>
        </div>

        {/* Metrics List / Loading / Error / Empty State */}
        {metricsLoading ? (
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
        ) : metricsError ? (
          <div className="border border-border rounded-xl p-8 md:p-12 flex flex-col items-center justify-center bg-muted/20">
            <p className="text-sm md:text-base text-red-500 mb-2">
              {metricsError}
            </p>
            <button
              onClick={() => window.location.reload()}
              className="text-sm md:text-base text-muted-foreground hover:text-foreground transition-colors cursor-pointer"
            >
              Retry
            </button>
          </div>
        ) : filteredMetrics.length === 0 ? (
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
                  onClick={() => {
                    resetForm();
                    setUseCasePickerOpen(true);
                  }}
                  className="h-9 md:h-10 px-4 rounded-md text-sm md:text-base font-medium border border-border bg-background hover:bg-muted/50 transition-colors cursor-pointer"
                >
                  Add evaluator
                </button>
              )}
          </div>
        ) : (
          <div className="space-y-3">
            {filteredMetrics.map((metric) => {
              const isDefault = !metric.owner_user_id;
              return (
                <div
                  key={metric.uuid}
                  onClick={() => router.push(`/evaluators/${metric.uuid}`)}
                  className="border border-border rounded-xl bg-background dark:bg-muted px-4 py-4 md:px-5 md:py-4 transition-colors cursor-pointer hover:bg-muted/20 dark:hover:bg-accent"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <h3 className="text-base md:text-lg font-semibold text-foreground">
                          {metric.name}
                        </h3>
                        {metric.evaluator_type && (
                          <EvaluatorTypePill
                            evaluatorType={metric.evaluator_type}
                          />
                        )}
                        {metric.output_type && (
                          <OutputTypePill outputType={metric.output_type} />
                        )}
                      </div>
                      {metric.description && (
                        <p className="text-sm text-muted-foreground mt-2 leading-relaxed">
                          {metric.description}
                        </p>
                      )}
                    </div>
                    <div className="flex items-center gap-1 flex-shrink-0">
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          openDuplicateDialog(metric);
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
                            openDeleteDialog(metric);
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

      {/* Add/Edit Metric Sidebar */}
      {addMetricSidebarOpen && (
        <div className="fixed inset-0 z-50 flex justify-end">
          {/* Backdrop */}
          <div
            className="absolute inset-0 bg-black/50 backdrop-blur-sm"
            onClick={() => {
              resetForm();
              setAddMetricSidebarOpen(false);
            }}
          />
          {/* Sidebar */}
          <div className="relative w-full md:max-w-xl bg-background md:border-l border-border flex flex-col h-full shadow-2xl">
            {/* Header */}
            <div className="flex items-center justify-between px-4 md:px-6 py-3 md:py-4 border-b border-border">
              <div className="flex items-center gap-3">
                <svg
                  className="w-5 h-5 text-muted-foreground"
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
                <h2 className="text-base md:text-lg font-semibold">
                  {editingMetricUuid ? "Edit evaluator" : "Add evaluator"}
                </h2>
              </div>
              <button
                onClick={() => {
                  resetForm();
                  setAddMetricSidebarOpen(false);
                }}
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
            <div className="flex-1 overflow-y-auto p-4 md:p-6 flex flex-col gap-4 md:gap-6">
              {isLoadingMetric ? (
                <div className="flex items-center justify-center py-12">
                  <svg
                    className="w-6 h-6 animate-spin"
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
              ) : (
                <>
                  {/* Name */}
                  <div>
                    <label className="block text-xs md:text-sm font-medium mb-2">
                      Name <span className="text-red-500">*</span>
                    </label>
                    <input
                      type="text"
                      value={metricName}
                      placeholder="e.g., Follows Refund Policy"
                      onChange={(e) => setMetricName(e.target.value)}
                      className={`w-full h-9 md:h-10 px-3 md:px-4 rounded-md text-sm md:text-base border bg-background dark:bg-muted text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-accent focus:border-transparent ${
                        validationAttempted &&
                        (!metricName.trim() || isNameDuplicate(metricName))
                          ? "border-red-500"
                          : "border-border"
                      }`}
                    />
                    {validationAttempted && isNameDuplicate(metricName) && (
                      <p className="text-xs md:text-sm text-red-500 mt-1">
                        An evaluator with this name already exists
                      </p>
                    )}
                  </div>

                  {/* Description */}
                  <div>
                    <label className="block text-xs md:text-sm font-medium mb-2">
                      Description
                    </label>
                    <textarea
                      value={metricDescription}
                      onChange={(e) => setMetricDescription(e.target.value)}
                      placeholder="One-line summary shown in the list"
                      className="w-full px-3 md:px-4 py-2 rounded-md text-sm md:text-base border border-border bg-background dark:bg-muted text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-accent focus:border-transparent resize-none min-h-[72px]"
                    />
                  </div>

                  {/* Use case (read-only — chosen in the use case picker) */}
                  {newEvaluatorType && !editingMetricUuid && (
                    <div>
                      <label className="block text-xs md:text-sm font-medium mb-2">
                        Use case
                      </label>
                      <div className="flex items-center justify-between gap-3 px-3 md:px-4 h-9 md:h-10 rounded-md border border-border bg-muted/40 dark:bg-muted">
                        <span className="text-sm md:text-base text-foreground">
                          {EVALUATOR_TYPE_LABELS[newEvaluatorType]}
                        </span>
                        <button
                          type="button"
                          onClick={() => {
                            setAddMetricSidebarOpen(false);
                            setUseCasePickerOpen(true);
                          }}
                          className="text-xs md:text-sm text-muted-foreground hover:text-foreground transition-colors cursor-pointer"
                        >
                          Change
                        </button>
                      </div>
                      <p className="text-xs md:text-sm text-muted-foreground mt-2">
                        {EVALUATOR_TYPE_TOOLTIPS[newEvaluatorType]}
                      </p>
                    </div>
                  )}

                  {/* Output type (binary vs rating) */}
                  <div>
                    <label className="block text-xs md:text-sm font-medium mb-2">
                      Output type <span className="text-red-500">*</span>
                    </label>
                    <div className="inline-flex rounded-md border border-border p-1">
                      {(["binary", "rating"] as const).map((t) => {
                        const active = newEvaluatorOutputType === t;
                        return (
                          <button
                            key={t}
                            type="button"
                            onClick={() => setNewEvaluatorOutputType(t)}
                            className={`h-8 md:h-9 px-4 md:px-5 rounded-md text-sm md:text-base font-medium transition-colors cursor-pointer capitalize ${
                              active
                                ? "bg-foreground text-background"
                                : "text-muted-foreground hover:text-foreground"
                            }`}
                          >
                            {t}
                          </button>
                        );
                      })}
                    </div>
                    <p className="text-xs md:text-sm text-muted-foreground mt-2">
                      {newEvaluatorOutputType === "binary"
                        ? "Returns a pass/fail judgement for each evaluation."
                        : "Returns a score on a custom rating scale you define below."}
                    </p>
                  </div>

                  {/* Rating scale builder */}
                  {newEvaluatorOutputType === "rating" && (
                    <div>
                      <label className="block text-xs md:text-sm font-medium mb-1">
                        Rating scale <span className="text-red-500">*</span>
                      </label>
                      <p className="text-xs md:text-sm text-muted-foreground mb-2">
                        Add at least two rows. Label is required; the
                        description is optional rubric text fed to the judge.
                      </p>
                      <div className="space-y-2">
                        {newEvaluatorScale.map((row, idx) => {
                          const missingLabel =
                            validationAttempted && !row.name.trim();
                          return (
                            <div
                              key={idx}
                              className="border border-border rounded-md p-2 md:p-3 bg-muted/10 dark:bg-muted"
                            >
                              <div className="flex items-center gap-2">
                                <input
                                  type="number"
                                  value={row.value}
                                  onChange={(e) => {
                                    const next = [...newEvaluatorScale];
                                    next[idx] = {
                                      ...next[idx],
                                      value: Number(e.target.value),
                                    };
                                    setNewEvaluatorScale(next);
                                  }}
                                  className="w-20 h-9 md:h-10 px-2 rounded-md text-sm md:text-base border border-border bg-background dark:bg-accent text-foreground focus:outline-none focus:ring-2 focus:ring-accent focus:border-transparent text-center"
                                />
                                <input
                                  type="text"
                                  value={row.name}
                                  onChange={(e) => {
                                    const next = [...newEvaluatorScale];
                                    next[idx] = {
                                      ...next[idx],
                                      name: e.target.value,
                                    };
                                    setNewEvaluatorScale(next);
                                  }}
                                  placeholder={
                                    ["Bad", "Average", "Good"][idx] ?? "Label"
                                  }
                                  className={`flex-1 h-9 md:h-10 px-3 rounded-md text-sm md:text-base border bg-background dark:bg-accent text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-accent focus:border-transparent ${
                                    missingLabel
                                      ? "border-red-500"
                                      : "border-border"
                                  }`}
                                />
                                <button
                                  type="button"
                                  onClick={() => {
                                    if (newEvaluatorScale.length <= 2) return;
                                    setNewEvaluatorScale(
                                      newEvaluatorScale.filter(
                                        (_, i) => i !== idx,
                                      ),
                                    );
                                  }}
                                  disabled={newEvaluatorScale.length <= 2}
                                  title={
                                    newEvaluatorScale.length <= 2
                                      ? "At least two rows are required"
                                      : "Remove row"
                                  }
                                  className="w-9 h-9 md:w-10 md:h-10 flex items-center justify-center rounded-md text-muted-foreground hover:text-red-500 hover:bg-red-500/10 transition-colors cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:bg-transparent disabled:hover:text-muted-foreground"
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
                                      d="M6 18L18 6M6 6l12 12"
                                    />
                                  </svg>
                                </button>
                              </div>
                              <textarea
                                value={row.description}
                                onChange={(e) => {
                                  const next = [...newEvaluatorScale];
                                  next[idx] = {
                                    ...next[idx],
                                    description: e.target.value,
                                  };
                                  setNewEvaluatorScale(next);
                                }}
                                placeholder="(optional) description for the response to receive this rating; a detailed rubric helps the LLM judge evaluate more reliably"
                                rows={2}
                                className="mt-2 w-full px-3 py-2 rounded-md text-sm border border-border bg-background dark:bg-accent text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-accent focus:border-transparent resize-none"
                              />
                            </div>
                          );
                        })}
                      </div>
                      <button
                        type="button"
                        onClick={() => {
                          const maxVal = newEvaluatorScale.reduce(
                            (m, r) => Math.max(m, r.value),
                            0,
                          );
                          setNewEvaluatorScale([
                            ...newEvaluatorScale,
                            { value: maxVal + 1, name: "", description: "" },
                          ]);
                        }}
                        className="mt-2 h-9 md:h-10 px-3 rounded-md text-sm md:text-base font-medium border border-dashed border-border bg-background dark:bg-muted hover:bg-muted/30 dark:hover:bg-accent text-muted-foreground hover:text-foreground transition-colors cursor-pointer inline-flex items-center gap-1.5"
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
                            d="M12 4v16m8-8H4"
                          />
                        </svg>
                        Add row
                      </button>
                    </div>
                  )}

                  {/* Judge model */}
                  <div>
                    <label className="block text-xs md:text-sm font-medium mb-2">
                      Judge model <span className="text-red-500">*</span>
                    </label>
                    <button
                      type="button"
                      onClick={() => setLlmModalOpen(true)}
                      className={`w-full h-9 md:h-10 px-3 md:px-4 rounded-md text-sm md:text-base border bg-background dark:bg-muted hover:bg-muted/50 dark:hover:bg-accent flex items-center justify-between cursor-pointer transition-colors ${
                        validationAttempted && !newEvaluatorJudgeModel
                          ? "border-red-500"
                          : "border-border"
                      }`}
                    >
                      <span
                        className={
                          newEvaluatorJudgeModel
                            ? "text-foreground"
                            : "text-muted-foreground"
                        }
                      >
                        {newEvaluatorJudgeModel
                          ? newEvaluatorJudgeModel.name
                          : "Select judge model"}
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
                  </div>

                  {/* Judge prompt */}
                  <div className="flex flex-col">
                    <label className="block text-xs md:text-sm font-medium mb-2">
                      Judge prompt <span className="text-red-500">*</span>
                    </label>
                    {variablesSupported && (
                      <p className="text-xs md:text-sm text-muted-foreground mb-2 leading-relaxed">
                        You can build reusable prompts by adding{" "}
                        <code className="font-mono px-1 py-0.5 rounded bg-muted text-foreground">
                          {`{{ variable }}`}
                        </code>{" "}
                        placeholders so the same evaluator can be applied to
                        multiple LLM tests while customising the value for each
                        test
                      </p>
                    )}
                    {/* Variables (LLM only) — auto-detected from {{...}} in
                        the prompt; rendered above the textarea so the user
                        sees the detected variables without having to scroll. */}
                    {variablesSupported &&
                      detectedPromptVariables.length > 0 && (
                        <div className="space-y-2 mb-3">
                          <div className="text-[11px] uppercase tracking-wide text-muted-foreground">
                            Variables
                          </div>
                          <div className="flex items-start gap-2 rounded-md border border-blue-500/20 bg-blue-500/5 p-3 text-xs md:text-sm text-muted-foreground">
                            <svg
                              className="w-4 h-4 mt-0.5 flex-shrink-0 text-blue-600 dark:text-blue-400"
                              fill="none"
                              viewBox="0 0 24 24"
                              stroke="currentColor"
                              strokeWidth={1.75}
                            >
                              <path
                                strokeLinecap="round"
                                strokeLinejoin="round"
                                d="M11.25 11.25l.041-.02a.75.75 0 011.063.852l-.708 2.836a.75.75 0 001.063.853l.041-.021M21 12a9 9 0 11-18 0 9 9 0 0118 0zm-9-3.75h.008v.008H12V8.25z"
                              />
                            </svg>
                            <span>
                              When this evaluator is added to an LLM test, the
                              user will fill in a value for each variable. The
                              short description below each variable is the hint
                              they&apos;ll see at that point.
                            </span>
                          </div>
                          <div className="border border-border rounded-md overflow-hidden">
                            {detectedPromptVariables.map((name, i) => (
                              <div
                                key={name}
                                className={`p-3 md:p-4 bg-background dark:bg-muted flex flex-col md:flex-row md:items-start gap-2 md:gap-3 ${
                                  i > 0 ? "border-t border-border" : ""
                                }`}
                              >
                                <code className="self-start inline-flex items-center px-2 py-0.5 rounded-md text-sm font-mono font-semibold bg-blue-500/10 text-blue-700 dark:text-blue-300 md:flex-shrink-0 md:mt-1.5">
                                  {`{{${name}}}`}
                                </code>
                                <input
                                  type="text"
                                  value={
                                    newEvaluatorVariableDescriptions[name] ??
                                    ""
                                  }
                                  onChange={(e) =>
                                    setNewEvaluatorVariableDescriptions(
                                      (prev) => ({
                                        ...prev,
                                        [name]: e.target.value,
                                      }),
                                    )
                                  }
                                  placeholder="Short description shown when filling this variable in tests (optional)"
                                  className="flex-1 px-3 py-2 rounded-md text-sm bg-background dark:bg-muted text-foreground placeholder:text-muted-foreground border border-border focus:outline-none focus:ring-2 focus:ring-accent"
                                />
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                    <textarea
                      value={newEvaluatorSystemPrompt}
                      onChange={(e) =>
                        setNewEvaluatorSystemPrompt(e.target.value)
                      }
                      placeholder={
                        variablesSupported
                          ? "Describe how the judge should grade a response. Use {{variable}} to mark values you'll fill in per test."
                          : "Describe how the judge should grade a response"
                      }
                      className={`w-full px-4 py-3 rounded-md text-sm md:text-base border bg-background dark:bg-muted text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-accent focus:border-transparent resize-none h-[280px] md:h-[320px] ${
                        validationAttempted && !newEvaluatorSystemPrompt.trim()
                          ? "border-red-500"
                          : "border-border"
                      }`}
                    />
                  </div>

                  {/* Variables warning for non-LLM types — backend will treat them as literal text */}
                  {!variablesSupported &&
                    newEvaluatorType &&
                    detectedPromptVariables.length > 0 && (
                      <div className="flex items-start gap-2 rounded-md border border-amber-500/30 bg-amber-500/10 p-3 text-xs md:text-sm text-amber-700 dark:text-amber-300">
                        <svg
                          className="w-4 h-4 mt-0.5 flex-shrink-0"
                          fill="none"
                          viewBox="0 0 24 24"
                          stroke="currentColor"
                          strokeWidth={1.75}
                        >
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z"
                          />
                        </svg>
                        <span>
                          Variables are not supported for{" "}
                          {EVALUATOR_TYPE_LABELS[newEvaluatorType]} evaluators.
                          The <code className="font-mono">{`{{...}}`}</code>{" "}
                          placeholders in your prompt will be treated as literal
                          text by the evaluator
                        </span>
                      </div>
                    )}

                  {/* Spacer between textarea and footer */}
                  <div className="h-4 md:h-6 shrink-0" aria-hidden="true" />
                </>
              )}
            </div>

            {/* Footer */}
            <div className="px-6 py-4 border-t border-border space-y-3">
              {createError && (
                <p className="text-sm text-red-500">{createError}</p>
              )}
              <div className="flex items-center justify-end gap-3">
                <button
                  onClick={() => {
                    resetForm();
                    setAddMetricSidebarOpen(false);
                  }}
                  disabled={isCreating || isLoadingMetric}
                  className="h-10 px-4 rounded-md text-base font-medium border border-border bg-background dark:bg-muted hover:bg-muted/50 dark:hover:bg-accent transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  Cancel
                </button>
                <button
                  onClick={editingMetricUuid ? updateMetric : createMetric}
                  disabled={isCreating || isLoadingMetric}
                  className="h-10 px-4 rounded-md text-base font-medium bg-foreground text-background hover:opacity-90 transition-opacity cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
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
                      {editingMetricUuid ? "Saving..." : "Creating..."}
                    </>
                  ) : editingMetricUuid ? (
                    "Save"
                  ) : (
                    "Create evaluator"
                  )}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* LLM judge model selector */}
      <LLMSelectorModal
        isOpen={llmModalOpen}
        onClose={() => setLlmModalOpen(false)}
        selectedLLM={newEvaluatorJudgeModel}
        onSelect={setNewEvaluatorJudgeModel}
        allowedProviderSlugs={JUDGE_PROVIDER_SLUGS}
        requiredInputModality={newEvaluatorType === "tts" ? "audio" : "text"}
      />

      {/* Use case picker — shown before opening the create sidebar */}
      {useCasePickerOpen && (
        <UseCasePickerDialog
          initialValue={newEvaluatorType}
          onCancel={() => {
            setUseCasePickerOpen(false);
            if (!addMetricSidebarOpen) {
              resetForm();
            }
          }}
          onSelect={(value) => {
            const prevType = newEvaluatorType;
            setNewEvaluatorType(value);
            setUseCasePickerOpen(false);
            setAddMetricSidebarOpen(true);
            // Only reset judge model + prefill when the purpose actually
            // changes. Re-selecting the same purpose via the "Change" link
            // should preserve whatever the user has already typed.
            if (prevType !== value) {
              setNewEvaluatorJudgeModel(null);
              prefillDefaultPrompt(value);
            }
          }}
        />
      )}

      {/* Duplicate Metric Dialog */}
      {duplicateDialogOpen && metricToDuplicate && (
        <DuplicateMetricDialog
          originalMetric={metricToDuplicate}
          existingMetrics={metrics}
          onClose={closeDuplicateDialog}
          onDuplicated={handleMetricDuplicated}
          backendAccessToken={backendAccessToken ?? undefined}
        />
      )}

      {/* Delete Confirmation Dialog */}
      <DeleteConfirmationDialog
        isOpen={deleteDialogOpen}
        onClose={closeDeleteDialog}
        onConfirm={deleteMetric}
        title="Delete evaluator"
        message={`Are you sure you want to delete "${metricToDelete?.name}"?`}
        confirmText="Delete"
        isDeleting={isMetricDeleting}
      />
    </AppLayout>
  );
}

function DuplicateMetricDialog({
  originalMetric,
  existingMetrics,
  onClose,
  onDuplicated,
  backendAccessToken,
}: {
  originalMetric: MetricData;
  existingMetrics: MetricData[];
  onClose: () => void;
  onDuplicated: (metric: MetricData) => void;
  backendAccessToken?: string;
}) {
  // Hide the floating "Talk to Us" button when this dialog is rendered
  useHideFloatingButton(true);

  const [metricName, setMetricName] = useState(
    `Copy of ${originalMetric.name}`,
  );
  const [isDuplicating, setIsDuplicating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const maxLength = 50;

  // Check if the name already exists
  const isNameDuplicate = (name: string): boolean => {
    const trimmedName = name.trim().toLowerCase();
    return existingMetrics.some((m) => m.name.toLowerCase() === trimmedName);
  };

  const handleDuplicate = async () => {
    if (!metricName.trim() || isNameDuplicate(metricName)) return;

    try {
      setIsDuplicating(true);
      setError(null);
      const backendUrl = process.env.NEXT_PUBLIC_BACKEND_URL;
      if (!backendUrl) {
        throw new Error("BACKEND_URL environment variable is not set");
      }

      // Call the duplicate endpoint
      const response = await fetch(
        `${backendUrl}/metrics/${originalMetric.uuid}/duplicate`,
        {
          method: "POST",
          headers: {
            accept: "application/json",
            "Content-Type": "application/json",
            "ngrok-skip-browser-warning": "true",
            Authorization: `Bearer ${backendAccessToken}`,
          },
          body: JSON.stringify({
            name: metricName.trim(),
          }),
        },
      );

      if (response.status === 401) {
        await signOut({ callbackUrl: "/login" });
        return;
      }

      if (!response.ok) {
        throw new Error("Failed to duplicate metric");
      }

      const data = await response.json();
      const newMetric: MetricData = {
        uuid: data.uuid,
        name: metricName.trim(),
        description: data.description || originalMetric.description,
        created_at: data.created_at || new Date().toISOString(),
        updated_at: data.updated_at || new Date().toISOString(),
      };

      onDuplicated(newMetric);
      onClose();
    } catch (err) {
      console.error("Error duplicating metric:", err);
      setError(
        err instanceof Error ? err.message : "Failed to duplicate metric",
      );
    } finally {
      setIsDuplicating(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="bg-background border border-border rounded-xl p-8 max-w-lg w-full mx-4 shadow-lg"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="mb-4 md:mb-6">
          <h2 className="text-xl md:text-2xl font-semibold tracking-tight mb-1">
            Duplicate metric
          </h2>
          <p className="text-muted-foreground text-sm md:text-[15px]">
            Choose a name for the duplicated metric
          </p>
        </div>

        {/* Metric Name Input */}
        <div className="mb-6">
          <label className="block text-[13px] font-medium text-foreground mb-2">
            Metric Name <span className="text-red-500">*</span>
          </label>
          <div className="relative">
            <input
              type="text"
              value={metricName}
              onChange={(e) => {
                if (e.target.value.length <= maxLength) {
                  setMetricName(e.target.value);
                  setError(null);
                }
              }}
              placeholder="Enter metric name"
              className={`w-full h-10 px-3 pr-16 rounded-md text-[13px] border bg-background dark:bg-muted text-foreground focus:outline-none focus:ring-2 focus:ring-accent focus:border-transparent ${
                metricName.trim() && isNameDuplicate(metricName)
                  ? "border-red-500"
                  : "border-border"
              }`}
              maxLength={maxLength}
            />
            <div className="absolute inset-y-0 right-0 flex items-center pr-3 pointer-events-none">
              <span className="text-[12px] text-muted-foreground">
                {metricName.length}/{maxLength}
              </span>
            </div>
          </div>
          {metricName.trim() && isNameDuplicate(metricName) && (
            <p className="text-sm text-red-500 mt-1">
              A metric with this name already exists
            </p>
          )}
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
            disabled={
              !metricName.trim() || isDuplicating || isNameDuplicate(metricName)
            }
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

function UseCasePickerDialog({
  initialValue,
  onCancel,
  onSelect,
}: {
  initialValue: EvaluatorType | null;
  onCancel: () => void;
  onSelect: (value: EvaluatorType) => void;
}) {
  useHideFloatingButton(true);
  const [selected, setSelected] = useState<EvaluatorType | null>(initialValue);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4"
      onClick={onCancel}
    >
      <div
        className="bg-background border border-border rounded-xl w-full max-w-2xl shadow-2xl flex flex-col max-h-[90vh]"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-start justify-between gap-3 px-5 md:px-6 py-4 border-b border-border">
          <div>
            <h2 className="text-base md:text-lg font-semibold text-foreground">
              What is this evaluator for?
            </h2>
            <p className="text-xs md:text-sm text-muted-foreground mt-1">
              Pick the use case so we can configure the right judge model and
              inputs.
            </p>
          </div>
          <button
            onClick={onCancel}
            className="flex items-center justify-center w-8 h-8 rounded-md hover:bg-muted transition-colors cursor-pointer flex-shrink-0"
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

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-4 md:p-6">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {EVALUATOR_TYPE_OPTIONS.map((opt) => {
              const active = selected === opt.value;
              return (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => setSelected(opt.value)}
                  className={`flex flex-col items-start text-left p-4 rounded-md border transition-colors cursor-pointer ${
                    active
                      ? "border-foreground bg-muted/40 dark:bg-accent"
                      : "border-border bg-background dark:bg-muted hover:bg-muted/40 dark:hover:bg-accent"
                  }`}
                >
                  <div className="text-sm md:text-base font-medium text-foreground">
                    {opt.title}
                  </div>
                  <div className="text-xs md:text-sm text-muted-foreground mt-1 leading-relaxed">
                    {opt.description}
                  </div>
                </button>
              );
            })}
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-2 md:gap-3 px-5 md:px-6 py-4 border-t border-border">
          <button
            onClick={onCancel}
            className="h-9 md:h-10 px-4 rounded-md text-sm md:text-base font-medium border border-border bg-background dark:bg-muted hover:bg-muted/50 dark:hover:bg-accent transition-colors cursor-pointer"
          >
            Cancel
          </button>
          <button
            onClick={() => {
              if (selected) onSelect(selected);
            }}
            disabled={!selected}
            className="h-9 md:h-10 px-4 rounded-md text-sm md:text-base font-medium bg-foreground text-background hover:opacity-90 transition-opacity cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
          >
            Continue
          </button>
        </div>
      </div>
    </div>
  );
}
