"use client";

import React, { useEffect, useRef, useState } from "react";
import { signOut } from "next-auth/react";
import { loginPathAfterSignOut } from "@/lib/postLoginRedirect";
import type { LLMModel } from "./agent-tabs/constants/providers";
import { LLMSelectorModal } from "./agent-tabs/LLMSelectorModal";
import { RunModelsChoice } from "./workspace/RunModelsChoice";
import { toast } from "sonner";
import {
  useOpenRouterModels,
  useAccessToken,
  useActiveOrgUuid,
  useOrganizations,
} from "@/hooks";
import { workspaceRunModelsInParallel } from "@/lib/orgs";
import {
  benchmarkModelsPayload,
  benchmarkVariantId,
  describeSettings,
  duplicateModelRows,
  hasModelSettings,
  modelSettingsExtra,
  rowsFromModelIds,
  type BenchmarkModelSettings,
} from "@/lib/benchmarkModelSettings";
import { BenchmarkModelSettingsPanel } from "./BenchmarkModelSettingsPanel";
import { overEvalLimit } from "@/lib/evalLimit";
import { reportError } from "@/lib/reportError";
import { getDefaultHeaders } from "@/lib/api";
import { BenchmarkResultsDialog } from "./BenchmarkResultsDialog";
import type { SelectedTest } from "@/components/eval-details/SelectedTestsStrip";
import { Tooltip } from "@/components/Tooltip";
import {
  CloseIcon,
  ChevronDownIcon,
  GearIcon,
  TrashIcon,
  PlayIcon,
} from "@/components/icons";
import { Button, ConfirmDialog } from "@/components/ui";
import { useHideFloatingButton } from "@/components/AppLayout";
import {
  VerifyRequestPreviewDialog,
  type MessageRow,
} from "@/components/VerifyRequestPreviewDialog";

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
  tests: { uuid: string; name: string }[];
  /** How many tests an empty `tests` stands for, for the progress numbers. */
  totalTests?: number;
  onBenchmarkCreated?: (taskId: string) => void;
  agentType?: "agent" | "connection";
  benchmarkModelsVerified?: Record<
    string,
    { verified: boolean; verified_at: string; error: string | null }
  >;
  benchmarkProvider?: string;
  /** The models to open with, as ids (e.g. "openai/gpt-4.1"). Used when a past
   *  comparison is run again, so the reader can change the models before
   *  starting it. */
  initialModels?: string[];
  /** Whether to open with the models running at the same time. Defaults to
   *  running them together, which is what a fresh comparison does. */
  initialParallelModels?: boolean;
  /** Called when a model passes its check, so the agent page can remember it
   *  and the next comparison does not ask again before a reload. */
  onModelVerified?: (
    modelId: string,
    entry: { verified: boolean; verified_at: string; error: string | null },
  ) => void;
  /** Run the tests ticked inside the comparison window this picker opens. */
  onRunTests?: (tests: SelectedTest[]) => Promise<unknown> | void;
  /** Compare models on the tests ticked inside that window. */
  onCompareTests?: (tests: SelectedTest[]) => void;
};

type ModelVerifications = Record<
  string,
  { verified: boolean; verified_at: string; error: string | null }
>;

/** One row of the picker: the model, and the settings it is being compared
 *  under. The same model can fill two rows as long as the settings differ,
 *  which is the point of a thinking level. */
type ModelRow = { model: LLMModel; settings: BenchmarkModelSettings };

/** What this row is called in the results, and what its own badge and failure
 *  panel are keyed by in this window. Two rows of one model must not share
 *  either. A row with no settings keys on the plain model id. */
function rowKey(row: ModelRow): string {
  return benchmarkVariantId(row.model.id, row.settings);
}

/** What a passed check is SAVED against, which is the model, never the row.
 *  The backend keeps `benchmark_models_verified` keyed by model name and
 *  refuses a comparison naming a model it has no passing check for, so saving
 *  a check under a row's own id would leave the model looking unchecked and
 *  the comparison refused. */
function savedCheckKey(row: ModelRow): string {
  return row.model.id;
}

/**
 * Whether this row still has to be checked before the comparison starts.
 *
 * A row carrying settings is always checked, even when the model itself passed
 * before: what is unproven is whether the agent's server accepts these extra
 * fields, and a check of the bare model says nothing about that.
 */
function rowNeedsCheck(
  row: ModelRow,
  saved: ModelVerifications,
  statusThisTime: Record<string, ModelVerificationStatus>,
): boolean {
  if (hasModelSettings(row.settings)) {
    return statusThisTime[rowKey(row)] !== "verified";
  }
  return !saved[savedCheckKey(row)]?.verified;
}

const maxModels = 5;

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
  initialModels,
  initialParallelModels,
  onModelVerified,
  onRunTests,
  onCompareTests,
}: BenchmarkDialogProps) {
  useHideFloatingButton(isOpen);
  const { providers: llmProviders } = useOpenRouterModels();
  const backendAccessToken = useAccessToken();
  const [activeOrgUuid] = useActiveOrgUuid();
  const { organizations, updateOrganization } =
    useOrganizations(backendAccessToken);
  // Undefined until the workspaces have been read, so it can be told apart
  // from someone actually choosing to run the models together.
  const workspaceDefault = workspaceRunModelsInParallel(
    organizations.find((org) => org.uuid === activeOrgUuid),
  );

  // What a comparison ran before wins; otherwise the workspace default; and
  // with neither, the models run at the same time, which is what a comparison
  // did before there was a setting.
  const openingRunOrder = initialParallelModels ?? workspaceDefault;

  const [selectedModels, setSelectedModels] = useState<ModelRow[]>([]);
  const [modelSelectorOpen, setModelSelectorOpen] = useState(false);
  /** Which row's settings panel is open, by position. Only one at a time, so
   *  the rows never move more than once. */
  const [settingsRowIndex, setSettingsRowIndex] = useState<number | null>(null);
  const [editingIndex, setEditingIndex] = useState<number | null>(null);
  const [showResults, setShowResults] = useState(false);
  // Null until the reader picks, so a workspace choice that arrives after the
  // first render still shows, and can never move a choice already made.
  const [pickedRunOrder, setPickedRunOrder] = useState<boolean | null>(null);
  const runModelsTogether = pickedRunOrder ?? openingRunOrder ?? true;
  // A workspace that has said nothing runs them together, so that is what the
  // choice on screen is measured against.
  const differsFromWorkspaceDefault =
    runModelsTogether !== (workspaceDefault ?? true);
  const [saveAsWorkspaceDefault, setSaveAsWorkspaceDefault] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);

  // Per-model verification state for agent connections
  const [expandedModelError, setExpandedModelError] = useState<string | null>(
    null,
  );
  const [modelSampleResponses, setModelSampleResponses] = useState<
    Record<string, Record<string, unknown>>
  >({});
  // Why this row's check failed, keyed by the row. The saved map below is keyed
  // by model, so reading an error out of it would paint both rows of one model
  // with a failure only one of them had.
  const [rowCheckError, setRowCheckError] = useState<
    Record<string, string | null>
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

  // `initialModels` names the models an earlier comparison ran, and the list of
  // models comes from the backend, so an id can only be turned into a model
  // once that list has arrived. It is filled in once per open: after that the
  // models on screen are the reader's own choice and are left alone.
  const filledInModels = useRef(false);
  useEffect(() => {
    if (!isOpen || filledInModels.current) return;
    if (!initialModels || initialModels.length === 0) return;
    if (llmProviders.length === 0) return;
    filledInModels.current = true;
    const byId = new Map(
      llmProviders.flatMap((p) => p.models).map((m) => [m.id, m] as const),
    );
    // The ids carry the settings the earlier comparison ran under, so a rerun
    // opens with the same thinking levels and hosts already chosen. The whole
    // id is what is deduplicated, not the model: one model twice under
    // different settings is a comparison in its own right, while the very same
    // id twice would only draw the same column twice.
    setSelectedModels(
      rowsFromModelIds(Array.from(new Set(initialModels)))
        .slice(0, maxModels)
        // A model that has since been retired is no longer in the list. It
        // still gets a row, named by its id, so the reader can see what the
        // earlier comparison used and swap it for one that still exists.
        .map(({ model, settings }) => ({
          model: byId.get(model) ?? { id: model, name: model },
          settings,
        })),
    );
  }, [isOpen, initialModels, llmProviders]);

  if (!isOpen) return null;

  const handleClose = () => {
    setSelectedModels([]);
    // Closing puts the window back to how it opened, so the next open fills in
    // from the same props again rather than starting empty.
    filledInModels.current = false;
    setShowResults(false);
    setPickedRunOrder(null);
    setSaveAsWorkspaceDefault(false);
    setSettingsOpen(false);
    setSettingsRowIndex(null);
    setModelVerifyStatus({});
    // A check that failed belongs to the models that were picked this time, so
    // it goes with them. Without this the next open still shows the failure
    // beside a model nobody has picked yet.
    setBenchmarkModelsVerified(keepVerified(initialBenchmarkModelsVerified));
    setModelSampleResponses({});
    setRowCheckError({});
    setExpandedModelError(null);
    setConfirmOpen(false);
    setVerifyDialogOpen(false);
    onClose();
  };

  /** Checks the agent's server accepts one row: the model, and the extra fields
   *  its settings add. A server that rejects an unknown field fails here, on
   *  that row, before the comparison starts. A server that quietly ignores one
   *  passes, which is why the panel says the settings only do something if the
   *  agent reads them. */
  const verifyModel = async (
    row: ModelRow,
    messages?: MessageRow[],
  ): Promise<{ verified: boolean; error?: string }> => {
    // Two keys on purpose: what this row shows is its own, what is saved
    // belongs to the model, because that is what the backend checks against.
    const rowId = rowKey(row);
    const savedId = savedCheckKey(row);
    const extra = modelSettingsExtra(row.settings);
    setModelVerifyStatus((prev) => ({ ...prev, [rowId]: "verifying" }));

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
            model: row.model.id,
            ...(messages && messages.length > 0 && { messages }),
            ...(extra && { extra }),
          }),
        },
      );

      if (response.status === 401) {
        await signOut({ callbackUrl: loginPathAfterSignOut() });
        return { verified: false, error: "Unauthorized" };
      }

      if (!response.ok) throw new Error("Verification request failed");

      const result = await response.json();
      const verified: boolean = result.success ?? false;
      const error: string | null = result.error ?? null;

      const entry = { verified, verified_at: new Date().toISOString(), error };
      setRowCheckError((prev) => ({ ...prev, [rowId]: verified ? null : error }));
      setBenchmarkModelsVerified((prev) => ({ ...prev, [savedId]: entry }));
      if (verified) onModelVerified?.(savedId, entry);
      if (result.sample_response) {
        setModelSampleResponses((prev) => ({
          ...prev,
          [rowId]: result.sample_response,
        }));
      }
      if (verified) {
        setExpandedModelError((prev) => (prev === rowId ? null : prev));
        setModelSampleResponses((prev) => {
          const next = { ...prev };
          delete next[rowId];
          return next;
        });
      }
      setModelVerifyStatus((prev) => ({
        ...prev,
        [rowId]: verified ? "verified" : "failed",
      }));
      return { verified, error: error || undefined };
    } catch (err) {
      const errMsg = err instanceof Error ? err.message : "Verification failed";
      setRowCheckError((prev) => ({ ...prev, [rowId]: errMsg }));
      setBenchmarkModelsVerified((prev) => ({
        ...prev,
        [savedId]: {
          verified: false,
          verified_at: new Date().toISOString(),
          error: errMsg,
        },
      }));
      setModelVerifyStatus((prev) => ({ ...prev, [rowId]: "failed" }));
      return { verified: false, error: errMsg };
    }
  };

  // Saving the choice for the workspace is a favour to the reader, not part of
  // the comparison, so it runs alongside it and never holds it up or stops it.
  //
  // It is called beside every `setShowResults(true)`, because that is where a
  // comparison actually starts. Calling it when Start the comparison is
  // clicked saved the workspace's choice for a comparison that then never ran:
  // on a connection agent that click only opens the connection check, which
  // the reader can still cancel.
  const saveWorkspaceDefault = () => {
    if (!saveAsWorkspaceDefault || !activeOrgUuid) return;
    if (!differsFromWorkspaceDefault) return;
    updateOrganization(activeOrgUuid, {
      settings: {
        model_benchmarking: { run_models_in_parallel: runModelsTogether },
      },
    }).catch((err) => {
      reportError("Error saving the workspace model run order:", err);
      toast.error("The workspace default was not saved.");
    });
  };

  const handleRunBenchmark = async () => {
    setConfirmOpen(false);
    if (agentType === "connection") {
      const modelsToVerify = selectedModels.filter((row) =>
        rowNeedsCheck(row, benchmarkModelsVerified, modelVerifyStatus),
      );

      if (modelsToVerify.length > 0) {
        setVerifyDialogOpen(true);
        return;
      }
    }

    saveWorkspaceDefault();
    setShowResults(true);
  };

  const runVerificationWithMessages = async (messages: MessageRow[]) => {
    const modelsToVerify = selectedModels.filter((row) =>
      rowNeedsCheck(row, benchmarkModelsVerified, modelVerifyStatus),
    );

    const results = await Promise.all(
      modelsToVerify.map((row) => verifyModel(row, messages)),
    );
    const anyFailed = results.some((r) => !r.verified);
    setVerifyDialogOpen(false);
    if (!anyFailed) {
      saveWorkspaceDefault();
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

  const handleSelectModel = (index: number, model: LLMModel) => {
    setSelectedModels((prev) => {
      const newModels = [...prev];
      // Swapping the model on an existing row keeps that row's settings, since
      // the reader chose them for the comparison, not for the model.
      newModels[index] = { model, settings: prev[index]?.settings ?? {} };
      return newModels;
    });
  };

  const handleRowSettingsChange = (
    index: number,
    settings: BenchmarkModelSettings,
  ) => {
    setSelectedModels((prev) =>
      prev.map((row, i) => (i === index ? { ...row, settings } : row)),
    );
  };

  const handleRemoveModel = (index: number) => {
    setSelectedModels((prev) => prev.filter((_, i) => i !== index));
    // The panel is open by position, so the row it belonged to is gone.
    setSettingsRowIndex(null);
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

  // Filter the model list by the agent's `benchmark_provider`. A model already
  // on another row is deliberately still offered: picking one model twice and
  // giving each row its own thinking level is the comparison this exists for.
  // Two rows asking for exactly the same thing are caught before the run
  // instead, where the reader can see why.
  const getAvailableProviders = () => {
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
          benchmarkProvider === "openrouter" ||
          !benchmarkProvider ||
          model.id.startsWith(benchmarkProvider + "/"),
      ),
    }));
  };

  const chosenModels = selectedModels;
  // The same rule `handleRunBenchmark` runs on: a connection agent has to pass
  // a check with each model it has not been verified with yet, so the question
  // says so before the reader agrees to it.
  const needsVerification =
    agentType === "connection" &&
    chosenModels.some((row) =>
      rowNeedsCheck(row, benchmarkModelsVerified, modelVerifyStatus),
    );
  // Two rows asking for the same model under the same settings would draw two
  // identical columns, which says nothing.
  const hasDuplicateRows = duplicateModelRows(
    selectedModels.map((row) => ({
      model: row.model.id,
      settings: row.settings,
    })),
  );
  // Empty `tests` means every linked test; `totalTests` is how many that is.
  const benchmarkTestCount = tests.length > 0 ? tests.length : totalTests;
  const canRunBenchmark = chosenModels.length > 0 && !hasDuplicateRows;
  const isVerifying = Object.values(modelVerifyStatus).some(
    (s) => s === "verifying",
  );
  // A failure belongs to the row that produced it, so a second row of the same
  // model under different settings is not painted as failed too.
  const hasFailedModels = selectedModels.some(
    (row) => modelVerifyStatus[rowKey(row)] === "failed",
  );
  // The checks only have something to say once a model is picked, so a window
  // that is still empty gives the whole width to the picker.
  const showStatusColumn =
    agentType === "connection" && selectedModels.length > 0;
  // The chosen models, then one blank row to pick the next in, until five
  // are chosen. Picking a model fills the blank and a new blank appears.
  const rows: (ModelRow | null)[] =
    selectedModels.length < maxModels
      ? [...selectedModels, null]
      : selectedModels;

  /**
   * How this row's check stands. It reads two maps on purpose: what happened
   * this time is the row's own, and a check that passed earlier belongs to the
   * model. A row carrying settings never claims an earlier pass, because that
   * pass says nothing about whether the agent accepts these extra fields.
   */
  const getModelVerificationBadge = (row: ModelRow) => {
    if (agentType !== "connection") return null;

    const modelId = rowKey(row);
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

    const existing = hasModelSettings(row.settings)
      ? liveStatus === "failed"
        ? { verified: false, error: rowCheckError[modelId] ?? null }
        : undefined
      : benchmarkModelsVerified[savedCheckKey(row)];
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
    const hasDetails = rowCheckError[modelId] || modelSampleResponses[modelId];
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
              // Three panels open in the same place beside the rows, so
              // opening one closes the other two.
              if (!isExpanded) {
                setSettingsOpen(false);
                setSettingsRowIndex(null);
              }
            }}
            aria-expanded={isExpanded}
            className={`rounded-md border border-red-500/40 px-1.5 py-0.5 text-xs font-medium transition-colors cursor-pointer ${
              isExpanded
                ? "bg-red-500 text-white hover:bg-red-600"
                : "bg-red-500/10 text-red-600 hover:bg-red-500/20"
            }`}
          >
            See why
          </button>
        )}
      </span>
    );
  };

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto pt-[12vh] pb-10 bg-black/50 backdrop-blur-sm">
      <div className="relative bg-background rounded-xl w-full max-w-lg flex flex-col shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4">
          <div>
            <h2 className="text-lg font-semibold text-foreground">
              Compare different models
            </h2>
            <p className="text-sm text-muted-foreground mt-0.5">
              Select up to 5 models to benchmark on{" "}
              {benchmarkTestCount === undefined
                ? "the tests"
                : benchmarkTestCount === 1
                  ? "the test"
                  : `the ${benchmarkTestCount} tests`}
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
        <div className="flex-1 px-6 pb-6 pt-1 space-y-4">
          <div className="space-y-3">
            <div className="flex items-center justify-between mb-3">
              <label className="block text-sm font-medium text-foreground">
                Select Models
              </label>
              {/* Only a connection agent has a server of its own to overload;
                  a build agent's models are called by the platform. It stays
                  behind the gear for the few who need it, and opens beside
                  the box so it covers none of the models and the box itself
                  never changes size. On a narrow screen there is no room
                  beside it, so it drops under the gear instead. */}
              {agentType === "connection" && (
                <div className="relative">
                  <Tooltip content="How to run the models" position="top">
                    <button
                      type="button"
                      onClick={() => {
                        setSettingsOpen((open) => !open);
                        // Three panels open in the same place beside the rows,
                        // so opening one closes the other two.
                        if (!settingsOpen) {
                          setExpandedModelError(null);
                          setSettingsRowIndex(null);
                        }
                      }}
                      aria-expanded={settingsOpen}
                      aria-label="How to run the models"
                      className={`w-8 h-8 flex items-center justify-center rounded-md cursor-pointer transition-colors focus:outline-none ${
                        settingsOpen
                          ? "bg-muted text-foreground"
                          : "text-muted-foreground hover:text-foreground hover:bg-muted"
                      }`}
                    >
                      <GearIcon className="w-4 h-4" />
                    </button>
                  </Tooltip>
                  {settingsOpen && (
                    <fieldset className="absolute z-10 w-72 space-y-1 rounded-xl border border-border bg-background p-4 shadow-2xl right-0 top-full mt-2 md:right-auto md:left-full md:top-0 md:mt-0 md:ml-9">
                      <legend className="sr-only">How to run the models</legend>
                      <p className="text-sm font-medium text-foreground">
                        How to run the models
                      </p>
                      <p className="text-xs text-muted-foreground">
                        Running multiple models will increase the load on your
                        agent server. Choose to run them sequentially to prevent
                        overloading it.
                      </p>
                      <div className="pt-1">
                        {/* The same two rows the workspace settings page
                            shows, so the two cannot drift apart. */}
                        <RunModelsChoice
                          value={runModelsTogether}
                          onChange={setPickedRunOrder}
                        />
                      </div>
                      {/* Only worth offering when the choice differs from what
                          the workspace already does. Otherwise it would save
                          what is saved already. */}
                      {differsFromWorkspaceDefault && (
                        <label className="mt-4 flex items-center gap-3 rounded-lg border border-blue-500/40 bg-blue-500/10 text-blue-700 dark:text-blue-300 px-3 py-2.5 cursor-pointer select-none">
                          <input
                            type="checkbox"
                            checked={saveAsWorkspaceDefault}
                            onChange={(e) =>
                              setSaveAsWorkspaceDefault(e.target.checked)
                            }
                            className="w-4 h-4 cursor-pointer accent-foreground"
                          />
                          <span className="text-sm">Save this as default</span>
                        </label>
                      )}
                    </fieldset>
                  )}
                </div>
              )}
            </div>

            {/* Model Rows */}
            {rows.map((selectedRow, index) => (
              <div key={index} className="relative space-y-1">
                <div className="flex items-center gap-2">
                  <div className="flex-1 flex items-center gap-2">
                    <button
                      onClick={() => openModelSelector(index)}
                      className={`flex-1 h-10 px-4 rounded-md text-sm border border-border flex items-center cursor-pointer transition-colors ${
                        selectedRow
                          ? "bg-muted font-medium hover:bg-muted/70"
                          : "border-dashed bg-background hover:bg-muted/50"
                      }`}
                    >
                      <span
                        className={
                          selectedRow
                            ? "text-foreground"
                            : "text-muted-foreground"
                        }
                      >
                        {selectedRow ? selectedRow.model.name : "Select a model"}
                      </span>
                      {/* What this row is being compared under, so two rows of
                          one model read apart at a glance. */}
                      {selectedRow && describeSettings(selectedRow.settings) && (
                        <span className="ml-2 text-xs font-normal text-muted-foreground truncate">
                          {describeSettings(selectedRow.settings)}
                        </span>
                      )}
                    </button>
                    {/* Verification badge for connections, once a model is
                        picked. It sits right after the picker, and is as wide
                        as the longest wording so every chosen row's picker is
                        the same size. The blank row has no badge and no
                        remove button, so its picker runs the full width. */}
                    {showStatusColumn && selectedRow && (
                      <div className="min-w-20 shrink-0 flex items-center">
                        {getModelVerificationBadge(selectedRow)}
                      </div>
                    )}
                  </div>

                  {/* How this model should be called. Only for a connection
                      agent: a build agent's models are called by the platform,
                      so there is no server of the reader's to pass them on. */}
                  {selectedRow && agentType === "connection" && (
                    <Tooltip content="Model settings" position="top">
                      <button
                        onClick={() => {
                          setSettingsRowIndex(
                            settingsRowIndex === index ? null : index,
                          );
                          // Only one panel sits beside the rows at a time.
                          setExpandedModelError(null);
                          setSettingsOpen(false);
                        }}
                        aria-label="Model settings"
                        aria-expanded={settingsRowIndex === index}
                        className={`w-8 h-8 flex items-center justify-center rounded-md transition-colors cursor-pointer ${
                          settingsRowIndex === index
                            ? "bg-muted text-foreground"
                            : "text-muted-foreground hover:text-foreground hover:bg-muted"
                        }`}
                      >
                        <GearIcon className="w-4 h-4" />
                      </button>
                    </Tooltip>
                  )}

                  {/* Remove Button */}
                  {selectedRow && (
                    <Tooltip content="Remove model" position="top">
                      <button
                        onClick={() => handleRemoveModel(index)}
                        aria-label="Remove model"
                        className="w-8 h-8 flex items-center justify-center rounded-md text-muted-foreground hover:text-red-500 hover:bg-red-500/10 transition-colors cursor-pointer"
                      >
                        <TrashIcon className="w-4 h-4" />
                      </button>
                    </Tooltip>
                  )}
                </div>

                {selectedRow && settingsRowIndex === index && (
                  <BenchmarkModelSettingsPanel
                    settings={selectedRow.settings}
                    onChange={(settings) =>
                      handleRowSettingsChange(index, settings)
                    }
                    canChooseHost={
                      !benchmarkProvider || benchmarkProvider === "openrouter"
                    }
                  />
                )}
                {/* Why the check failed. Beside the box on a wide screen, so
                    the rows never move.
                    On a narrow screen it sits under the row instead. */}
                {selectedRow &&
                  expandedModelError === rowKey(selectedRow) &&
                  modelVerifyStatus[rowKey(selectedRow)] === "failed" && (
                    <div className="rounded-lg border border-red-500/20 bg-red-500/5 p-2 space-y-1 md:absolute md:left-full md:top-0 md:ml-9 md:w-80 md:max-h-80 md:overflow-y-auto md:rounded-xl md:border-0 md:bg-background md:p-4 md:shadow-2xl">
                      {rowCheckError[rowKey(selectedRow)] && (
                        <p className="text-xs text-red-400 break-words">
                          {rowCheckError[rowKey(selectedRow)]}
                        </p>
                      )}
                      {modelSampleResponses[rowKey(selectedRow)] && (
                        <div className="space-y-1">
                          <p className="text-xs font-medium text-muted-foreground">
                            Your agent responded with:
                          </p>
                          <pre className="text-xs bg-muted rounded-lg p-2 overflow-x-auto text-foreground max-h-32 overflow-y-auto">
                            {JSON.stringify(
                              modelSampleResponses[rowKey(selectedRow)],
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
          </div>
        </div>

        {/* Two rows asking for the same model under the same settings would
            draw two identical columns, so the run is held until one changes. */}
        {hasDuplicateRows && (
          <p className="px-6 text-sm text-amber-600 dark:text-amber-500">
            Two models are set up the same way. Give one of them a different
            thinking level or host, or remove it
          </p>
        )}

        {/* Footer */}
        <div className="px-6 py-4 flex items-center justify-end gap-3">
          <Button variant="secondary" size="md" onClick={handleClose}>
            Cancel
          </Button>
          {hasFailedModels && !isVerifying && (
            <button
              onClick={() => {
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
          selectedLLM={rows[editingIndex]?.model ?? null}
          onSelect={handleModelSelected}
          availableProviders={getAvailableProviders()}
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
        models={benchmarkModelsPayload(
          selectedModels.map((row) => ({
            model: row.model.id,
            settings: row.settings,
          })),
        )}
        parallelModels={
          agentType === "connection" ? runModelsTogether : undefined
        }
        onBenchmarkCreated={onBenchmarkCreated}
        onRunTests={onRunTests}
        onCompareTests={onCompareTests}
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
        } with ${chosenModels
          .map((row) => {
            const settings = describeSettings(row.settings);
            return settings ? `${row.model.name} (${settings})` : row.model.name;
          })
          .join(", ")}. Each test calls your agent once per model, evaluates its response against the evaluation criteria and reports the metrics.`}
        confirmText="Start the comparison"
      />

      <VerifyRequestPreviewDialog
        agentNature={agentNature}
        open={verifyDialogOpen}
        onClose={() => setVerifyDialogOpen(false)}
        onConfirm={runVerificationWithMessages}
        isVerifying={isVerifying}
      />
    </div>
  );
}
