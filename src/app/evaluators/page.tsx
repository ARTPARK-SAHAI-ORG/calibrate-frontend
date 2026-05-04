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
  EvaluatorTypePill,
  OutputTypePill,
  type EvaluatorType,
} from "@/components/EvaluatorPills";
import { LLMSelectorModal } from "@/components/agent-tabs/LLMSelectorModal";
import type { LLMModel } from "@/components/agent-tabs/constants/providers";
import { CreateEvaluatorSidebar } from "@/components/evaluators/CreateEvaluatorSidebar";
import { UseCasePickerDialog } from "@/components/evaluators/UseCasePickerDialog";
import { extractVariableNames } from "@/lib/evaluatorVariables";
import { useSidebarState } from "@/lib/sidebar";

type EvaluatorData = {
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

async function getEvaluatorErrorMessage(
  response: Response,
  fallback: string,
): Promise<string> {
  const contentType = response.headers.get("content-type");
  if (contentType?.includes("application/json")) {
    const data = await response.json().catch(() => null);
    if (data && typeof data.detail === "string") return data.detail;
  }

  const text = await response.text().catch(() => "");
  return text || fallback;
}

function isEvaluatorNameConflict(response: Response, message: string): boolean {
  return response.status === 409 && message === "Evaluator name already exists";
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
  const [addEvaluatorSidebarOpen, setAddEvaluatorSidebarOpen] = useState(false);
  const [evaluators, setEvaluators] = useState<EvaluatorData[]>([]);
  const [evaluatorsLoading, setEvaluatorsLoading] = useState(true);
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

  // Hide the floating "Talk to Us" button when the add evaluator sidebar is open
  useHideFloatingButton(addEvaluatorSidebarOpen);

  // Set page title
  useEffect(() => {
    document.title = "Evaluators | Calibrate";
  }, []);
  const [evaluatorsError, setEvaluatorsError] = useState<string | null>(null);
  const [isCreating, setIsCreating] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);
  const [createNameError, setCreateNameError] = useState<string | null>(null);
  const [validationAttempted, setValidationAttempted] = useState(false);

  // Form fields
  const [evaluatorName, setEvaluatorName] = useState("");
  const [evaluatorDescription, setEvaluatorDescription] = useState("");

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
  const [
    newEvaluatorVariableDescriptions,
    setNewEvaluatorVariableDescriptions,
  ] = useState<Record<string, string>>({});
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
  const [evaluatorToDelete, setEvaluatorToDelete] =
    useState<EvaluatorData | null>(null);
  const [isEvaluatorDeleting, setIsEvaluatorDeleting] = useState(false);

  // Duplicate dialog state
  const [duplicateDialogOpen, setDuplicateDialogOpen] = useState(false);
  const [evaluatorToDuplicate, setEvaluatorToDuplicate] =
    useState<EvaluatorData | null>(null);

  // Fetch evaluators from backend
  useEffect(() => {
    const fetchEvaluators = async () => {
      if (!backendAccessToken) return;

      try {
        setEvaluatorsLoading(true);
        setEvaluatorsError(null);
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

        const data: EvaluatorData[] = await response.json();
        setEvaluators(data);
      } catch (err) {
        console.error("Error fetching evaluators:", err);
        setEvaluatorsError(
          err instanceof Error ? err.message : "Failed to load evaluators",
        );
      } finally {
        setEvaluatorsLoading(false);
      }
    };

    fetchEvaluators();
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
      setEvaluatorName(data.name ?? "");
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
    if (!evaluatorToDelete) return;

    try {
      setIsEvaluatorDeleting(true);
      const backendUrl = process.env.NEXT_PUBLIC_BACKEND_URL;
      if (!backendUrl) {
        throw new Error("BACKEND_URL environment variable is not set");
      }

      const response = await fetch(
        `${backendUrl}/evaluators/${evaluatorToDelete.uuid}`,
        {
          method: "DELETE",
          headers: {
            accept: "application/json",
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
      setEvaluators(
        evaluators.filter((evaluator) => evaluator.uuid !== evaluatorToDelete.uuid),
      );
      closeDeleteDialog();
    } catch (err) {
      console.error("Error deleting evaluator:", err);
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

  // Handle evaluator duplicated - open detail page with duplicated evaluator data
  const handleEvaluatorDuplicated = async (newEvaluator: EvaluatorData) => {
    // Refetch evaluators list to get updated data
    const backendUrl = process.env.NEXT_PUBLIC_BACKEND_URL;
    if (backendUrl) {
      try {
        const evaluatorsResponse = await fetch(
          `${backendUrl}/evaluators?include_defaults=true`,
          {
          method: "GET",
          headers: {
            accept: "application/json",
            Authorization: `Bearer ${backendAccessToken}`,
          },
          },
        );

        if (evaluatorsResponse.status === 401) {
          await signOut({ callbackUrl: "/login" });
          return;
        }

        if (evaluatorsResponse.ok) {
          const updatedEvaluators: EvaluatorData[] =
            await evaluatorsResponse.json();
          setEvaluators(updatedEvaluators);
        }
      } catch (err) {
        console.error("Error refetching evaluators:", err);
      }
    }
    // Navigate to the new evaluator's detail page
    router.push(`/evaluators/${newEvaluator.uuid}`);
  };

  // Reset form fields
  const resetForm = () => {
    setEvaluatorName("");
    setEvaluatorDescription("");
    setCreateError(null);
    setCreateNameError(null);
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

  // Check if the name already exists in the visible evaluator namespace.
  const isNameDuplicate = (name: string): boolean => {
    const trimmedName = name.trim().toLowerCase();
    return evaluators.some((e) => e.name.toLowerCase() === trimmedName);
  };

  // Create evaluator via POST API
  const createEvaluator = async () => {
    setValidationAttempted(true);
    const scaleValid =
      newEvaluatorOutputType === "binary" ||
      (newEvaluatorScale.length >= 2 &&
        newEvaluatorScale.every((row) => row.name.trim().length > 0));
    const detectedVars = extractVariableNames(newEvaluatorSystemPrompt);
    const variableDescriptionsValid =
      newEvaluatorType !== "llm" ||
      detectedVars.every(
        (name) =>
          (newEvaluatorVariableDescriptions[name] ?? "").trim().length > 0,
      );
    if (
      !evaluatorName.trim() ||
      isNameDuplicate(evaluatorName) ||
      !newEvaluatorType ||
      !newEvaluatorJudgeModel ||
      !newEvaluatorSystemPrompt.trim() ||
      !scaleValid ||
      !variableDescriptionsValid
    ) {
      return;
    }

    try {
      setIsCreating(true);
      setCreateError(null);
      setCreateNameError(null);
      const backendUrl = process.env.NEXT_PUBLIC_BACKEND_URL;
      if (!backendUrl) {
        throw new Error("BACKEND_URL environment variable is not set");
      }

      const response = await fetch(`${backendUrl}/evaluators`, {
        method: "POST",
        headers: {
          accept: "application/json",
          "Content-Type": "application/json",
          Authorization: `Bearer ${backendAccessToken}`,
        },
        body: JSON.stringify({
          name: evaluatorName.trim(),
          description: evaluatorDescription.trim(),
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
        const message = await getEvaluatorErrorMessage(
          response,
          "Failed to create evaluator",
        );
        if (isEvaluatorNameConflict(response, message)) {
          setCreateNameError(message);
          return;
        }
        throw new Error(message);
      }

      // Refetch the evaluators list to get the updated data
      const listResponse = await fetch(
        `${backendUrl}/evaluators?include_defaults=true`,
        {
          method: "GET",
          headers: {
            accept: "application/json",
            Authorization: `Bearer ${backendAccessToken}`,
          },
        },
      );

      if (listResponse.ok) {
        const updated: EvaluatorData[] = await listResponse.json();
        setEvaluators(updated);
      }

      // Reset form fields and close sidebar
      resetForm();
      setAddEvaluatorSidebarOpen(false);
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

  // Detect `{{var}}` placeholders in the create-flow system prompt. Only LLM
  // evaluators support variables; for other types we surface a warning if the
  // user types any so the prompt doesn't silently include unsupported tokens.
  const detectedPromptVariables = extractVariableNames(
    newEvaluatorSystemPrompt,
  );
  const variablesSupported = newEvaluatorType === "llm";

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
            {filteredEvaluators.map((evaluator) => {
              const isDefault = !evaluator.owner_user_id;
              return (
                <div
                  key={evaluator.uuid}
                  onClick={() => router.push(`/evaluators/${evaluator.uuid}`)}
                  className="border border-border rounded-xl bg-background dark:bg-muted px-4 py-4 md:px-5 md:py-4 transition-colors cursor-pointer hover:bg-muted/20 dark:hover:bg-accent"
                >
                  <div className="flex items-start justify-between gap-3">
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
                    <div className="flex items-center gap-1 flex-shrink-0">
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

      <CreateEvaluatorSidebar
        isOpen={addEvaluatorSidebarOpen}
        evaluatorName={evaluatorName}
        evaluatorDescription={evaluatorDescription}
        evaluatorType={newEvaluatorType}
        evaluatorOutputType={newEvaluatorOutputType}
        evaluatorScale={newEvaluatorScale}
        judgeModel={newEvaluatorJudgeModel}
        systemPrompt={newEvaluatorSystemPrompt}
        detectedPromptVariables={detectedPromptVariables}
        variableDescriptions={newEvaluatorVariableDescriptions}
        variablesSupported={variablesSupported}
        validationAttempted={validationAttempted}
        createNameError={createNameError}
        createError={createError}
        isCreating={isCreating}
        isNameDuplicate={isNameDuplicate}
        onClose={() => {
          resetForm();
          setAddEvaluatorSidebarOpen(false);
        }}
        onOpenUseCasePicker={() => {
          setAddEvaluatorSidebarOpen(false);
          setUseCasePickerOpen(true);
        }}
        onOpenModelPicker={() => setLlmModalOpen(true)}
        onCreate={createEvaluator}
        setEvaluatorName={setEvaluatorName}
        setEvaluatorDescription={setEvaluatorDescription}
        setEvaluatorOutputType={setNewEvaluatorOutputType}
        setEvaluatorScale={setNewEvaluatorScale}
        setSystemPrompt={setNewEvaluatorSystemPrompt}
        setVariableDescriptions={setNewEvaluatorVariableDescriptions}
        setCreateNameError={setCreateNameError}
      />

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
          options={EVALUATOR_TYPE_OPTIONS}
          onCancel={() => {
            setUseCasePickerOpen(false);
            if (!addEvaluatorSidebarOpen) {
              resetForm();
            }
          }}
          onSelect={(value) => {
            const prevType = newEvaluatorType;
            setNewEvaluatorType(value);
            setUseCasePickerOpen(false);
            setAddEvaluatorSidebarOpen(true);
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

function DuplicateEvaluatorDialog({
  originalEvaluator,
  existingEvaluators,
  onClose,
  onDuplicated,
  backendAccessToken,
}: {
  originalEvaluator: EvaluatorData;
  existingEvaluators: EvaluatorData[];
  onClose: () => void;
  onDuplicated: (evaluator: EvaluatorData) => void;
  backendAccessToken?: string;
}) {
  // Hide the floating "Talk to Us" button when this dialog is rendered
  useHideFloatingButton(true);

  const [evaluatorName, setEvaluatorName] = useState(
    `Copy of ${originalEvaluator.name}`,
  );
  const [isDuplicating, setIsDuplicating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [nameError, setNameError] = useState<string | null>(null);
  const maxLength = 50;

  // Check if the name already exists
  const isNameDuplicate = (name: string): boolean => {
    const trimmedName = name.trim().toLowerCase();
    return existingEvaluators.some((e) => e.name.toLowerCase() === trimmedName);
  };

  const handleDuplicate = async () => {
    if (!evaluatorName.trim() || isNameDuplicate(evaluatorName)) return;

    try {
      setIsDuplicating(true);
      setError(null);
      setNameError(null);
      const backendUrl = process.env.NEXT_PUBLIC_BACKEND_URL;
      if (!backendUrl) {
        throw new Error("BACKEND_URL environment variable is not set");
      }

      // Call the duplicate endpoint
      const response = await fetch(
        `${backendUrl}/evaluators/${originalEvaluator.uuid}/duplicate`,
        {
          method: "POST",
          headers: {
            accept: "application/json",
            "Content-Type": "application/json",
            Authorization: `Bearer ${backendAccessToken}`,
          },
          body: JSON.stringify({
            name: evaluatorName.trim(),
          }),
        },
      );

      if (response.status === 401) {
        await signOut({ callbackUrl: "/login" });
        return;
      }

      if (!response.ok) {
        const message = await getEvaluatorErrorMessage(
          response,
          "Failed to duplicate evaluator",
        );
        if (isEvaluatorNameConflict(response, message)) {
          setNameError(message);
          return;
        }
        throw new Error(message);
      }

      const data = await response.json();
      const newEvaluator: EvaluatorData = {
        uuid: data.uuid,
        name: evaluatorName.trim(),
        description: data.description || originalEvaluator.description,
        created_at: data.created_at || new Date().toISOString(),
        updated_at: data.updated_at || new Date().toISOString(),
      };

      onDuplicated(newEvaluator);
      onClose();
    } catch (err) {
      console.error("Error duplicating evaluator:", err);
      setError(
        err instanceof Error ? err.message : "Failed to duplicate evaluator",
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
            Duplicate evaluator
          </h2>
          <p className="text-muted-foreground text-sm md:text-[15px]">
            Choose a name for the duplicated evaluator
          </p>
        </div>

        {/* Evaluator Name Input */}
        <div className="mb-6">
          <label className="block text-[13px] font-medium text-foreground mb-2">
            Evaluator Name <span className="text-red-500">*</span>
          </label>
          <div className="relative">
            <input
              type="text"
              value={evaluatorName}
              onChange={(e) => {
                if (e.target.value.length <= maxLength) {
                  setEvaluatorName(e.target.value);
                  setError(null);
                  setNameError(null);
                }
              }}
              placeholder="Enter evaluator name"
              className={`w-full h-10 px-3 pr-16 rounded-md text-[13px] border bg-background dark:bg-muted text-foreground focus:outline-none focus:ring-2 focus:ring-accent focus:border-transparent ${
                (evaluatorName.trim() && isNameDuplicate(evaluatorName)) ||
                nameError
                  ? "border-red-500"
                  : "border-border"
              }`}
              maxLength={maxLength}
            />
            <div className="absolute inset-y-0 right-0 flex items-center pr-3 pointer-events-none">
              <span className="text-[12px] text-muted-foreground">
                {evaluatorName.length}/{maxLength}
              </span>
            </div>
          </div>
          {evaluatorName.trim() && isNameDuplicate(evaluatorName) && (
            <p className="text-sm text-red-500 mt-1">
              An evaluator with this name already exists
            </p>
          )}
          {nameError && (
            <p className="text-sm text-red-500 mt-1">{nameError}</p>
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
              !evaluatorName.trim() ||
              isDuplicating ||
              isNameDuplicate(evaluatorName)
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

