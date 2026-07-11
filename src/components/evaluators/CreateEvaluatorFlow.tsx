"use client";

import { useEffect, useState } from "react";
import {
  useAccessToken,
  useOpenRouterModels,
  findModelInProviders,
} from "@/hooks";
import { reportError } from "@/lib/reportError";
import { getBackendUrl, getDefaultHeaders } from "@/lib/api";
import {
  type EvaluatorData,
  getEvaluatorErrorMessage,
  isEvaluatorNameConflict,
} from "@/lib/evaluatorApi";
import { useHideFloatingButton } from "@/components/AppLayout";
import { type EvaluatorType } from "@/components/EvaluatorPills";
import { LLMSelectorModal } from "@/components/agent-tabs/LLMSelectorModal";
import type { LLMModel } from "@/components/agent-tabs/constants/providers";
import { CreateEvaluatorSidebar } from "@/components/evaluators/CreateEvaluatorSidebar";
import {
  defaultBinaryScale,
  type BinaryScaleRow,
} from "@/components/evaluators/BinaryScaleEditor";
import { UseCasePickerDialog } from "@/components/evaluators/UseCasePickerDialog";
import { EVALUATOR_USE_CASE_OPTIONS } from "@/components/evaluators/evaluatorUseCases";
import type { EvaluatorUseCaseOption } from "@/components/evaluators/evaluatorUseCases";
import { defaultBinaryLabel } from "@/lib/binaryLabels";
import { extractVariableNames } from "@/lib/evaluatorVariables";
import {
  isReservedEvaluatorName,
  reservedEvaluatorNameError,
} from "@/lib/evaluatorNames";

// Build the output_config payload for a binary evaluator. We only send a
// `scale` when the user has actually overridden at least one label or
// description — otherwise the backend defaults (Pass/Fail-shaped) stay in
// effect.
function buildBinaryOutputConfig(rows: BinaryScaleRow[]): {
  output_config?: {
    scale: { value: boolean; name: string; description?: string }[];
  };
} {
  const hasAnyOverride = rows.some(
    (r) => r.name.trim().length > 0 || r.description.trim().length > 0,
  );
  if (!hasAnyOverride) return {};
  return {
    output_config: {
      scale: rows.map((r) => ({
        value: r.value,
        name: r.name.trim() || defaultBinaryLabel(r.value),
        ...(r.description.trim() ? { description: r.description.trim() } : {}),
      })),
    },
  };
}

const EVALUATOR_TYPE_TO_DATA_TYPE: Record<EvaluatorType, "text" | "audio"> = {
  tts: "audio",
  stt: "audio",
  llm: "text",
  "llm-general": "text",
  conversation: "text",
};

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

const initialScale = () => [
  { value: 1, name: "", description: "" },
  { value: 2, name: "", description: "" },
  { value: 3, name: "", description: "" },
];

type CreateEvaluatorFlowProps = {
  /** When true, the flow opens on the use-case picker and drives itself. */
  open: boolean;
  /** Called on cancel or after a successful create. Parent should set open=false. */
  onClose: () => void;
  /** Existing evaluators — used for duplicate-name validation. */
  existingEvaluators: Pick<EvaluatorData, "name">[];
  /** Called with the created evaluator after a successful POST. */
  onCreated: (evaluator: EvaluatorData) => void;
  /** Limit the use-case picker to these groups (e.g. conversation-only on agent detail). */
  useCaseGroups?: EvaluatorUseCaseOption["group"][];
  /** Further narrow the picker to specific evaluator types (e.g. `llm` on next-reply tests). */
  useCaseTypes?: EvaluatorType[];
};

/**
 * Self-contained "create evaluator" experience: use-case picker → prefill →
 * configuration sidebar → judge-model picker → POST /evaluators. Owns all form
 * state internally so it can be dropped into the /evaluators page or the agent
 * Evaluators tab without the parent managing ~25 fields.
 */
export function CreateEvaluatorFlow({
  open,
  onClose,
  existingEvaluators,
  onCreated,
  useCaseGroups,
  useCaseTypes,
}: CreateEvaluatorFlowProps) {
  const backendAccessToken = useAccessToken();
  const { providers: llmProviders } = useOpenRouterModels();

  useHideFloatingButton(open);

  const [useCasePickerOpen, setUseCasePickerOpen] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [llmModalOpen, setLlmModalOpen] = useState(false);

  const [isCreating, setIsCreating] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);
  const [createNameError, setCreateNameError] = useState<string | null>(null);
  const [validationAttempted, setValidationAttempted] = useState(false);

  const [evaluatorName, setEvaluatorName] = useState("");
  const [evaluatorDescription, setEvaluatorDescription] = useState("");
  const [newEvaluatorType, setNewEvaluatorType] =
    useState<EvaluatorType | null>(null);
  const [newEvaluatorJudgeModel, setNewEvaluatorJudgeModel] =
    useState<LLMModel | null>(null);
  const [newEvaluatorSystemPrompt, setNewEvaluatorSystemPrompt] = useState("");
  const [
    newEvaluatorVariableDescriptions,
    setNewEvaluatorVariableDescriptions,
  ] = useState<Record<string, string>>({});
  const [newEvaluatorOutputType, setNewEvaluatorOutputType] = useState<
    "binary" | "rating"
  >("binary");
  const [newEvaluatorScale, setNewEvaluatorScale] = useState<
    { value: number; name: string; description: string }[]
  >(initialScale());
  const [newEvaluatorBinaryScale, setNewEvaluatorBinaryScale] =
    useState<BinaryScaleRow[]>(defaultBinaryScale());

  // Reset all form state and (re)open the use-case picker whenever the flow is
  // toggled open; tear everything down when it closes.
  useEffect(() => {
    if (open) {
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
      setNewEvaluatorScale(initialScale());
      setNewEvaluatorBinaryScale(defaultBinaryScale());
      setUseCasePickerOpen(true);
      setSidebarOpen(false);
    } else {
      setUseCasePickerOpen(false);
      setSidebarOpen(false);
      setLlmModalOpen(false);
    }
  }, [open]);

  // Once OpenRouter providers load, upgrade a stub `{ id, name: id }` judge
  // model (seeded from the default-prompt response) to the full LLMModel.
  useEffect(() => {
    if (!newEvaluatorJudgeModel || llmProviders.length === 0) return;
    const found = findModelInProviders(llmProviders, newEvaluatorJudgeModel.id);
    if (found && found.name !== newEvaluatorJudgeModel.name) {
      setNewEvaluatorJudgeModel(found);
    }
  }, [llmProviders, newEvaluatorJudgeModel]);

  const isNameDuplicate = (name: string): boolean => {
    const trimmedName = name.trim().toLowerCase();
    return existingEvaluators.some(
      (e) => e.name.toLowerCase() === trimmedName,
    );
  };

  // Prefill the form with the canonical default prompt for the chosen use case.
  const prefillDefaultPrompt = async (purpose: EvaluatorType) => {
    try {
      if (!backendAccessToken) return;
      const response = await fetch(
        `${getBackendUrl()}/evaluators/default-prompt?purpose=${purpose}`,
        { method: "GET", headers: getDefaultHeaders(backendAccessToken) },
      );

      // Prefill is best-effort — leave the form blank on any failure.
      if (!response.ok) return;

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
      reportError("Error prefilling default prompt:", err);
    }
  };

  const createEvaluator = async () => {
    setValidationAttempted(true);
    if (isReservedEvaluatorName(evaluatorName)) {
      setCreateNameError(reservedEvaluatorNameError(evaluatorName));
      return;
    }
    const scaleValid =
      newEvaluatorOutputType === "binary" ||
      (newEvaluatorScale.length >= 2 &&
        newEvaluatorScale.every((row) => row.name.trim().length > 0));
    const detectedVars = extractVariableNames(newEvaluatorSystemPrompt);
    const variableDescriptionsValid =
      (newEvaluatorType !== "llm" && newEvaluatorType !== "llm-general") ||
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

      const response = await fetch(`${getBackendUrl()}/evaluators`, {
        method: "POST",
        headers: {
          ...getDefaultHeaders(backendAccessToken),
          "Content-Type": "application/json",
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
            ...((newEvaluatorType === "llm" ||
              newEvaluatorType === "llm-general") &&
            detectedVars.length > 0
              ? {
                  variables: detectedVars.map((name) => {
                    const description = (
                      newEvaluatorVariableDescriptions[name] ?? ""
                    ).trim();
                    return description.length > 0
                      ? { name, description }
                      : { name };
                  }),
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
              : buildBinaryOutputConfig(newEvaluatorBinaryScale)),
          },
        }),
      });

      if (response.status === 401) return; // interceptor handles sign-out

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

      const created = await response.json().catch(() => ({}));
      const now = new Date().toISOString();
      const createdEvaluator: EvaluatorData = {
        uuid: created.uuid,
        name: created.name ?? evaluatorName.trim(),
        description: created.description ?? evaluatorDescription.trim(),
        created_at: created.created_at ?? now,
        updated_at: created.updated_at ?? now,
        owner_user_id: created.owner_user_id ?? "self",
        data_type:
          created.data_type ?? EVALUATOR_TYPE_TO_DATA_TYPE[newEvaluatorType],
        kind: created.kind ?? "single",
        output_type: created.output_type ?? newEvaluatorOutputType,
        evaluator_type: created.evaluator_type ?? newEvaluatorType,
      };

      onCreated(createdEvaluator);
      onClose();
    } catch (err) {
      reportError("Error creating evaluator:", err);
      setCreateError(
        err instanceof Error ? err.message : "Failed to create evaluator",
      );
    } finally {
      setIsCreating(false);
    }
  };

  const detectedPromptVariables = extractVariableNames(newEvaluatorSystemPrompt);
  const variablesSupported =
    newEvaluatorType === "llm" || newEvaluatorType === "llm-general";
  const useCaseOptions = (() => {
    let options = useCaseGroups
      ? EVALUATOR_USE_CASE_OPTIONS.filter((option) =>
          useCaseGroups.includes(option.group),
        )
      : EVALUATOR_USE_CASE_OPTIONS;
    if (useCaseTypes && useCaseTypes.length > 0) {
      const allowed = new Set(useCaseTypes);
      options = options.filter((option) => allowed.has(option.value));
    }
    return options;
  })();

  if (!open) return null;

  return (
    <>
      <CreateEvaluatorSidebar
        isOpen={sidebarOpen}
        evaluatorName={evaluatorName}
        evaluatorDescription={evaluatorDescription}
        evaluatorType={newEvaluatorType}
        evaluatorOutputType={newEvaluatorOutputType}
        evaluatorScale={newEvaluatorScale}
        evaluatorBinaryScale={newEvaluatorBinaryScale}
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
        onClose={onClose}
        onOpenUseCasePicker={() => {
          setSidebarOpen(false);
          setUseCasePickerOpen(true);
        }}
        onOpenModelPicker={() => setLlmModalOpen(true)}
        onCreate={createEvaluator}
        setEvaluatorName={setEvaluatorName}
        setEvaluatorDescription={setEvaluatorDescription}
        setEvaluatorOutputType={setNewEvaluatorOutputType}
        setEvaluatorScale={setNewEvaluatorScale}
        setEvaluatorBinaryScale={setNewEvaluatorBinaryScale}
        setSystemPrompt={setNewEvaluatorSystemPrompt}
        setVariableDescriptions={setNewEvaluatorVariableDescriptions}
        setCreateNameError={setCreateNameError}
      />

      <LLMSelectorModal
        isOpen={llmModalOpen}
        onClose={() => setLlmModalOpen(false)}
        selectedLLM={newEvaluatorJudgeModel}
        onSelect={setNewEvaluatorJudgeModel}
        allowedProviderSlugs={JUDGE_PROVIDER_SLUGS}
        requiredInputModality={newEvaluatorType === "tts" ? "audio" : "text"}
      />

      {useCasePickerOpen && (
        <UseCasePickerDialog
          initialValue={newEvaluatorType}
          options={useCaseOptions}
          onCancel={() => {
            setUseCasePickerOpen(false);
            // Cancelling the picker with no sidebar behind it closes the flow.
            if (!sidebarOpen) onClose();
          }}
          onSelect={(value) => {
            const prevType = newEvaluatorType;
            setNewEvaluatorType(value);
            setUseCasePickerOpen(false);
            setSidebarOpen(true);
            if (prevType !== value) {
              setNewEvaluatorJudgeModel(null);
              prefillDefaultPrompt(value);
            }
          }}
        />
      )}
    </>
  );
}
