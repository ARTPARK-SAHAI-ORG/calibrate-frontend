"use client";

import { Suspense, useCallback, useEffect, useMemo, useState } from "react";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { signOut } from "next-auth/react";
import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { useAccessToken } from "@/hooks";
import { AppLayout } from "@/components/AppLayout";
import { useSidebarState } from "@/lib/sidebar";
import {
  DefaultPill,
  EvaluatorTypePill,
  OutputTypePill,
  type EvaluatorType,
} from "@/components/EvaluatorPills";
import { LLMSelectorModal } from "@/components/agent-tabs/LLMSelectorModal";
import type { LLMModel } from "@/components/agent-tabs/constants/providers";
import { RatingScaleEditor } from "@/components/evaluators/RatingScaleEditor";
import { VersionCard } from "@/components/evaluators/VersionCard";
import { extractVariableNames } from "@/lib/evaluatorVariables";
import { SingleSelectPicker } from "@/components/SingleSelectPicker";

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

type ScaleEntry = {
  value: boolean | number | string;
  name: string;
  description?: string;
  color?: string;
};

type OutputConfig = {
  scale: ScaleEntry[];
};

type EvaluatorVariable = {
  name: string;
  description?: string;
  default?: string;
};

type EvaluatorVersion = {
  uuid: string;
  version_number: number;
  judge_model: string;
  system_prompt: string;
  output_config: OutputConfig | null;
  variables: EvaluatorVariable[] | null;
  created_at: string;
};

type EvaluatorDetail = {
  uuid: string;
  name: string;
  description: string;
  data_type: "text" | "audio";
  kind: "single" | "side_by_side";
  output_type: "binary" | "rating";
  owner_user_id: string | null;
  slug: string | null;
  live_version_id: string | null;
  live_version: EvaluatorVersion | null;
  versions?: EvaluatorVersion[];
  evaluator_type?: EvaluatorType;
};

type TrendSeriesPoint = {
  bucket_start: string;
  bucket_end: string;
  agreement: number | null;
  pair_count: number;
};

type TrendVersion = {
  version_id: string;
  version_number: number;
  is_live: boolean;
  current: number | null;
  pair_count: number;
  series: TrendSeriesPoint[];
};

type TrendTask = {
  task_id: string;
  task_name: string;
  current: number | null;
  pair_count: number;
  series: TrendSeriesPoint[];
};

type EvaluatorTrendResponse = {
  evaluator_id: string;
  evaluator_name: string;
  bucket: string;
  days: number;
  filters: { task_id: string | null; version_id: string | null };
  overall: { current: number | null; pair_count: number; series: TrendSeriesPoint[] };
  versions: TrendVersion[];
  tasks: TrendTask[];
};

type EvaluatorPageTab = "prompts" | "agreement";

export default function EvaluatorDetailPage() {
  return (
    <Suspense fallback={null}>
      <EvaluatorDetailPageInner />
    </Suspense>
  );
}

function EvaluatorDetailPageInner() {
  const router = useRouter();
  const params = useParams<{ uuid: string }>();
  const uuid = params?.uuid;
  const searchParams = useSearchParams();
  const initialTab = searchParams.get("tab");
  const resolvedInitialTab: EvaluatorPageTab =
    initialTab === "agreement" ? "agreement" : "prompts";
  const backendAccessToken = useAccessToken();
  const [sidebarOpen, setSidebarOpen] = useSidebarState();

  const [evaluator, setEvaluator] = useState<EvaluatorDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [settingLiveUuid, setSettingLiveUuid] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<EvaluatorPageTab>(resolvedInitialTab);

  const handleTabChange = useCallback((tab: EvaluatorPageTab) => {
    setActiveTab(tab);
    window.history.replaceState(null, "", `?tab=${tab}`);
  }, []);
  const [trend, setTrend] = useState<EvaluatorTrendResponse | null>(null);
  const [trendLoading, setTrendLoading] = useState(false);
  const [trendError, setTrendError] = useState<string | null>(null);
  /** False until the first trend request for this evaluator finishes (avoids empty placeholder flash). */
  const [trendFetchCompleted, setTrendFetchCompleted] = useState(false);
  const [trendTaskId, setTrendTaskId] = useState<string>("all");
  // Full task list from the unfiltered fetch — kept stable so the picker
  // always shows all options regardless of which task is currently selected.
  const [trendAllTasks, setTrendAllTasks] = useState<TrendTask[]>([]);

  // Edit dialog state
  const [editOpen, setEditOpen] = useState(false);
  const [editName, setEditName] = useState("");
  const [editDescription, setEditDescription] = useState("");
  const [editSaving, setEditSaving] = useState(false);
  const [editError, setEditError] = useState<string | null>(null);
  const [editNameError, setEditNameError] = useState<string | null>(null);

  // New version dialog state
  const [newVersionOpen, setNewVersionOpen] = useState(false);
  const [newVersionJudgeModel, setNewVersionJudgeModel] =
    useState<LLMModel | null>(null);
  const [newVersionSystemPrompt, setNewVersionSystemPrompt] = useState("");
  const [newVersionScale, setNewVersionScale] = useState<
    { value: number | string; name: string; description: string }[]
  >([]);
  const [newVersionLlmModalOpen, setNewVersionLlmModalOpen] = useState(false);
  const [newVersionSaving, setNewVersionSaving] = useState(false);
  const [newVersionError, setNewVersionError] = useState<string | null>(null);
  const [newVersionValidated, setNewVersionValidated] = useState(false);
  const [newVersionChangelog, setNewVersionChangelog] = useState("");
  const [newVersionMarkLive, setNewVersionMarkLive] = useState(true);
  // Editable per-variable descriptions for the new version (keyed by variable
  // name). Variable names are pinned to the live version's variable set —
  // descriptions can be updated, but new placeholders the user types in the
  // prompt do NOT extend this map (they're flagged as literal text via the
  // existing amber callout).
  const [newVersionVariableDescriptions, setNewVersionVariableDescriptions] =
    useState<Record<string, string>>({});

  useEffect(() => {
    if (!evaluator?.name) return;
    document.title = `${evaluator.name} | Calibrate`;
  }, [evaluator?.name]);

  useEffect(() => {
    setTrendFetchCompleted(false);
    setTrend(null);
    setTrendAllTasks([]);
  }, [uuid]);

  useEffect(() => {
    const fetchEvaluator = async () => {
      if (!backendAccessToken || !uuid) return;
      try {
        setLoading(true);
        setError(null);
        const backendUrl = process.env.NEXT_PUBLIC_BACKEND_URL;
        if (!backendUrl) throw new Error("BACKEND_URL is not set");

        const res = await fetch(`${backendUrl}/evaluators/${uuid}`, {
          headers: {
            accept: "application/json",
            Authorization: `Bearer ${backendAccessToken}`,
          },
        });

        if (res.status === 401) {
          await signOut({ callbackUrl: "/login" });
          return;
        }
        if (res.status === 404) {
          throw new Error("Evaluator not found");
        }
        if (!res.ok) throw new Error("Failed to fetch evaluator");

        const data: EvaluatorDetail = await res.json();
        setEvaluator(data);
      } catch (err) {
        console.error("Error fetching evaluator:", err);
        setError(
          err instanceof Error ? err.message : "Failed to load evaluator",
        );
      } finally {
        setLoading(false);
      }
    };

    fetchEvaluator();
  }, [backendAccessToken, uuid]);

  const isDefault = !evaluator?.owner_user_id;

  const versions = useMemo(() => {
    if (!evaluator) return [] as EvaluatorVersion[];
    const all = evaluator.versions?.length
      ? [...evaluator.versions]
      : evaluator.live_version
        ? [evaluator.live_version]
        : [];
    const sorted = all.sort((a, b) => b.version_number - a.version_number);
    // Default evaluators always show only the most recent version of the prompt.
    if (!evaluator.owner_user_id) {
      return sorted.slice(0, 1);
    }
    return sorted;
  }, [evaluator]);

  const setVersionLive = async (versionUuid: string) => {
    if (!backendAccessToken || !uuid) return;
    try {
      setSettingLiveUuid(versionUuid);
      const backendUrl = process.env.NEXT_PUBLIC_BACKEND_URL;
      if (!backendUrl) throw new Error("BACKEND_URL is not set");
      const res = await fetch(
        `${backendUrl}/evaluators/${uuid}/versions/live`,
        {
          method: "POST",
          headers: {
            accept: "application/json",
            "Content-Type": "application/json",
            Authorization: `Bearer ${backendAccessToken}`,
          },
          body: JSON.stringify({ version_uuid: versionUuid }),
        },
      );
      if (res.status === 401) {
        await signOut({ callbackUrl: "/login" });
        return;
      }
      if (!res.ok) throw new Error("Failed to set live version");
      // Refresh evaluator to pick up new live_version_id
      const refreshed = await fetch(`${backendUrl}/evaluators/${uuid}`, {
        headers: {
          accept: "application/json",
          Authorization: `Bearer ${backendAccessToken}`,
        },
      });
      if (refreshed.ok) {
        const data: EvaluatorDetail = await refreshed.json();
        setEvaluator(data);
      }
    } catch (err) {
      console.error("Error setting live version:", err);
    } finally {
      setSettingLiveUuid(null);
    }
  };

  const openEditDialog = () => {
    if (!evaluator) return;
    setEditName(evaluator.name ?? "");
    setEditDescription(evaluator.description ?? "");
    setEditError(null);
    setEditNameError(null);
    setEditOpen(true);
  };

  const saveEvaluator = async () => {
    if (!backendAccessToken || !uuid) return;
    if (!editName.trim()) {
      setEditError("Name is required");
      return;
    }
    try {
      setEditSaving(true);
      setEditError(null);
      setEditNameError(null);
      const backendUrl = process.env.NEXT_PUBLIC_BACKEND_URL;
      if (!backendUrl) throw new Error("BACKEND_URL is not set");

      const res = await fetch(`${backendUrl}/evaluators/${uuid}`, {
        method: "PUT",
        headers: {
          accept: "application/json",
          "Content-Type": "application/json",
          Authorization: `Bearer ${backendAccessToken}`,
        },
        body: JSON.stringify({
          name: editName.trim(),
          description: editDescription.trim(),
        }),
      });
      if (res.status === 401) {
        await signOut({ callbackUrl: "/login" });
        return;
      }
      if (!res.ok) {
        const message = await getEvaluatorErrorMessage(
          res,
          "Failed to save evaluator",
        );
        if (isEvaluatorNameConflict(res, message)) {
          setEditNameError(message);
          return;
        }
        throw new Error(message);
      }
      const data: EvaluatorDetail = await res.json();
      setEvaluator((prev) =>
        prev ? { ...prev, ...data, versions: prev.versions } : data,
      );
      setEditOpen(false);
    } catch (err) {
      console.error("Error saving evaluator:", err);
      setEditError(
        err instanceof Error ? err.message : "Failed to save evaluator",
      );
    } finally {
      setEditSaving(false);
    }
  };

  const openNewVersionDialog = () => {
    if (!evaluator) return;
    const live = evaluator.live_version;
    setNewVersionJudgeModel(
      live?.judge_model
        ? { id: live.judge_model, name: live.judge_model }
        : null,
    );
    setNewVersionSystemPrompt(live?.system_prompt ?? "");
    if (evaluator.output_type === "rating") {
      const seeded = live?.output_config?.scale?.length
        ? live.output_config.scale.map((e) => ({
            value: typeof e.value === "boolean" ? (e.value ? 1 : 0) : e.value,
            name: e.name ?? "",
            description: e.description ?? "",
          }))
        : [
            { value: 1, name: "", description: "" },
            { value: 2, name: "", description: "" },
            { value: 3, name: "", description: "" },
          ];
      setNewVersionScale(seeded);
    } else {
      setNewVersionScale([]);
    }
    setNewVersionError(null);
    setNewVersionValidated(false);
    setNewVersionChangelog("");
    setNewVersionMarkLive(true);
    // Seed variable descriptions from the live version so users start from
    // what's already there and only edit what they want to change.
    const seededDescriptions: Record<string, string> = {};
    for (const v of live?.variables ?? []) {
      seededDescriptions[v.name] = v.description ?? "";
    }
    setNewVersionVariableDescriptions(seededDescriptions);
    setNewVersionOpen(true);
  };

  const createNewVersion = async () => {
    if (!backendAccessToken || !uuid || !evaluator) return;
    setNewVersionValidated(true);
    const scaleValid =
      evaluator.output_type === "binary" ||
      (newVersionScale.length >= 2 &&
        newVersionScale.every((r) => r.name.trim().length > 0));
    const existingVariables = evaluator.live_version?.variables ?? [];
    const variableDescriptionsValid =
      evaluator.evaluator_type !== "llm" ||
      existingVariables.every(
        (v) =>
          (newVersionVariableDescriptions[v.name] ?? v.description ?? "").trim()
            .length > 0,
      );
    if (
      !newVersionJudgeModel ||
      !newVersionSystemPrompt.trim() ||
      !scaleValid ||
      !variableDescriptionsValid
    ) {
      return;
    }
    try {
      setNewVersionSaving(true);
      setNewVersionError(null);
      const backendUrl = process.env.NEXT_PUBLIC_BACKEND_URL;
      if (!backendUrl) throw new Error("BACKEND_URL is not set");

      const body: Record<string, unknown> = {
        judge_model: newVersionJudgeModel.id,
        system_prompt: newVersionSystemPrompt.trim(),
        make_live: newVersionMarkLive,
      };
      if (newVersionChangelog.trim()) {
        body.changelog = newVersionChangelog.trim();
      }
      if (evaluator.output_type === "rating") {
        body.output_config = {
          scale: newVersionScale.map((row) => ({
            value: row.value,
            name: row.name.trim(),
            ...(row.description.trim()
              ? { description: row.description.trim() }
              : {}),
          })),
        };
      }
      // Variable name set is pinned to the live version (we don't allow add /
      // rename / remove on a new version — see the amber callout in the UI).
      // We forward the existing names with their (possibly edited)
      // descriptions and preserve `default`. Only LLM evaluators can carry
      // variables; for other types we omit the field entirely.
      if (evaluator.evaluator_type === "llm") {
        const existing = evaluator.live_version?.variables ?? [];
        if (existing.length > 0) {
          body.variables = existing.map((v) => {
            const description = (
              newVersionVariableDescriptions[v.name] ??
              v.description ??
              ""
            ).trim();
            const out: {
              name: string;
              description?: string;
              default?: string;
            } = { name: v.name };
            if (description.length > 0) out.description = description;
            if (typeof v.default === "string" && v.default.length > 0) {
              out.default = v.default;
            }
            return out;
          });
        }
      }

      const res = await fetch(`${backendUrl}/evaluators/${uuid}/versions`, {
        method: "POST",
        headers: {
          accept: "application/json",
          "Content-Type": "application/json",
          Authorization: `Bearer ${backendAccessToken}`,
        },
        body: JSON.stringify(body),
      });
      if (res.status === 401) {
        await signOut({ callbackUrl: "/login" });
        return;
      }
      if (!res.ok) {
        const text = await res.text().catch(() => "");
        throw new Error(text || "Failed to create version");
      }
      // Refresh evaluator so the new version appears with the selected live state
      const refreshed = await fetch(`${backendUrl}/evaluators/${uuid}`, {
        headers: {
          accept: "application/json",
          Authorization: `Bearer ${backendAccessToken}`,
        },
      });
      if (refreshed.ok) {
        const data: EvaluatorDetail = await refreshed.json();
        setEvaluator(data);
      }
      setNewVersionOpen(false);
    } catch (err) {
      console.error("Error creating version:", err);
      setNewVersionError(
        err instanceof Error ? err.message : "Failed to create version",
      );
    } finally {
      setNewVersionSaving(false);
    }
  };

  const fetchTrend = useCallback(async () => {
    if (!backendAccessToken || !uuid) return;
    setTrendLoading(true);
    setTrendError(null);
    try {
      const backendUrl = process.env.NEXT_PUBLIC_BACKEND_URL;
      if (!backendUrl) throw new Error("BACKEND_URL is not set");
      const params = new URLSearchParams({ bucket: "week", days: "90" });
      if (trendTaskId !== "all") params.set("task_id", trendTaskId);
      const res = await fetch(
        `${backendUrl}/annotation-agreement/evaluator/${uuid}/trend?${params}`,
        {
          headers: {
            accept: "application/json",
            Authorization: `Bearer ${backendAccessToken}`,
          },
        },
      );
      if (res.status === 401) {
        await signOut({ callbackUrl: "/login" });
        return;
      }
      if (!res.ok) throw new Error("Failed to fetch agreement trend");
      const data: EvaluatorTrendResponse = await res.json();
      setTrend(data);
      if (trendTaskId === "all") {
        setTrendAllTasks(data.tasks ?? []);
      }
    } catch (err) {
      setTrendError(
        err instanceof Error ? err.message : "Failed to load agreement trend",
      );
    } finally {
      setTrendLoading(false);
      setTrendFetchCompleted(true);
    }
  }, [backendAccessToken, uuid, trendTaskId]);

  useEffect(() => {
    if (activeTab === "agreement") {
      fetchTrend();
    }
  }, [activeTab, fetchTrend]);

  const formatDateTime = (iso: string): string => {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return iso;
    return d.toLocaleString();
  };

  return (
    <AppLayout
      activeItem="evaluators"
      onItemChange={(itemId) => router.push(`/${itemId}`)}
      sidebarOpen={sidebarOpen}
      onSidebarToggle={() => setSidebarOpen(!sidebarOpen)}
    >
      <div className="space-y-4 md:space-y-6 py-4 md:py-6">
        {/* Back */}
        <button
          onClick={() => router.back()}
          className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors cursor-pointer"
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
              d="M15 19l-7-7 7-7"
            />
          </svg>
          Back to evaluators
        </button>

        {loading ? (
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
        ) : error || !evaluator ? (
          <div className="border border-border rounded-xl p-8 md:p-12 flex flex-col items-center justify-center bg-muted/20">
            <p className="text-sm md:text-base text-red-500 mb-2">
              {error ?? "Evaluator not found"}
            </p>
            <button
              onClick={() => router.back()}
              className="text-sm md:text-base text-muted-foreground hover:text-foreground transition-colors cursor-pointer"
            >
              Back to evaluators
            </button>
          </div>
        ) : (
          <>
            {/* Header */}
            <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2 flex-wrap">
                  <h1 className="text-xl md:text-2xl font-semibold text-foreground">
                    {evaluator.name}
                  </h1>
                  {isDefault && <DefaultPill />}
                </div>
                <div className="flex items-center gap-2 flex-wrap mt-2">
                  {evaluator.evaluator_type && (
                    <EvaluatorTypePill
                      evaluatorType={evaluator.evaluator_type}
                    />
                  )}
                  <OutputTypePill outputType={evaluator.output_type} />
                </div>
                {evaluator.description && (
                  <p className="text-muted-foreground text-sm md:text-base leading-relaxed mt-2">
                    {evaluator.description}
                  </p>
                )}
              </div>
              {!isDefault && (
                <div className="flex items-center gap-2 flex-shrink-0">
                  <button
                    className="h-9 md:h-10 px-4 rounded-md text-sm md:text-base font-medium border border-border bg-background hover:bg-muted/50 transition-colors cursor-pointer inline-flex items-center gap-1.5"
                    onClick={openEditDialog}
                  >
                    <svg
                      className="w-4 h-4"
                      fill="none"
                      viewBox="0 0 24 24"
                      stroke="currentColor"
                      strokeWidth={1.75}
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        d="M16.862 4.487l1.687-1.688a1.875 1.875 0 112.652 2.652L10.582 16.07a4.5 4.5 0 01-1.897 1.13l-2.685.8.8-2.685a4.5 4.5 0 011.13-1.897L16.862 4.487zm0 0L19.5 7.125"
                      />
                    </svg>
                    Edit
                  </button>
                  <button
                    className="h-9 md:h-10 px-4 rounded-md text-sm md:text-base font-medium bg-foreground text-background hover:opacity-90 transition-opacity cursor-pointer inline-flex items-center gap-1.5"
                    onClick={openNewVersionDialog}
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
                    New version
                  </button>
                </div>
              )}
            </div>

            {/* Tabs */}
            <div className="flex items-center gap-4 md:gap-6 border-b border-border overflow-x-auto">
              <button
                onClick={() => handleTabChange("prompts")}
                className={`pb-2 text-sm md:text-base font-medium border-b-2 cursor-pointer whitespace-nowrap -mb-px transition-colors ${
                  activeTab === "prompts"
                    ? "border-foreground text-foreground"
                    : "border-transparent text-muted-foreground hover:text-foreground"
                }`}
              >
                {isDefault ? "Prompt" : "Prompts"}
              </button>
              <button
                onClick={() => handleTabChange("agreement")}
                className={`pb-2 text-sm md:text-base font-medium border-b-2 cursor-pointer whitespace-nowrap -mb-px transition-colors ${
                  activeTab === "agreement"
                    ? "border-foreground text-foreground"
                    : "border-transparent text-muted-foreground hover:text-foreground"
                }`}
              >
                Agreement
              </button>
            </div>

            {/* Prompts tab content */}
            {activeTab === "prompts" && (
              versions.length > 0 ? (
                <div className="space-y-3 md:space-y-4">
                  {versions.map((v) => (
                    <VersionCard
                      key={v.uuid}
                      version={v}
                      outputType={evaluator.output_type}
                      isDefault={isDefault}
                      isLive={v.uuid === evaluator.live_version_id}
                      isSettingLive={settingLiveUuid === v.uuid}
                      onSetLive={setVersionLive}
                      formatDateTime={formatDateTime}
                    />
                  ))}
                </div>
              ) : (
                <div className="border border-border rounded-xl p-8 md:p-12 flex flex-col items-center justify-center bg-muted/20">
                  <p className="text-sm md:text-base text-muted-foreground">
                    No version configured yet
                  </p>
                </div>
              )
            )}

            {/* Agreement tab content */}
            {activeTab === "agreement" && (
              <AgreementTrendTab
                trend={trend}
                trendLoading={trendLoading || !trendFetchCompleted}
                trendError={trendError}
                trendTaskId={trendTaskId}
                onSelectTask={setTrendTaskId}
                allTasks={trendAllTasks}
              />
            )}
          </>
        )}
      </div>

      {/* Edit evaluator dialog */}
      {editOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
          <div className="bg-background border border-border rounded-xl w-full max-w-md shadow-2xl flex flex-col max-h-[90vh]">
            {/* Header */}
            <div className="flex items-center justify-between px-5 md:px-6 py-4 border-b border-border">
              <h2 className="text-base md:text-lg font-semibold text-foreground">
                Edit evaluator
              </h2>
              <button
                onClick={() => {
                  if (!editSaving) setEditOpen(false);
                }}
                disabled={editSaving}
                className="flex items-center justify-center w-8 h-8 rounded-md hover:bg-muted transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
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
            <div className="flex-1 overflow-y-auto px-5 md:px-6 py-4 md:py-5 space-y-4">
              <div>
                <label className="block text-xs md:text-sm font-medium mb-2">
                  Name <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  value={editName}
                  onChange={(e) => {
                    setEditName(e.target.value);
                    setEditNameError(null);
                  }}
                  placeholder="Evaluator name"
                  className={`w-full h-9 md:h-10 px-3 md:px-4 rounded-md text-sm md:text-base border bg-background text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-accent focus:border-transparent ${
                    (!editName.trim() && editError) || editNameError
                      ? "border-red-500"
                      : "border-border"
                  }`}
                />
                {editNameError && (
                  <p className="text-xs md:text-sm text-red-500 mt-1">
                    {editNameError}
                  </p>
                )}
              </div>
              <div>
                <label className="block text-xs md:text-sm font-medium mb-2">
                  Description
                </label>
                <textarea
                  value={editDescription}
                  onChange={(e) => setEditDescription(e.target.value)}
                  placeholder="One-line summary shown in the list"
                  rows={3}
                  className="w-full px-3 md:px-4 py-2 rounded-md text-sm md:text-base border border-border bg-background text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-accent focus:border-transparent resize-none"
                />
              </div>
              {editError && <p className="text-sm text-red-500">{editError}</p>}
            </div>

            {/* Footer */}
            <div className="flex items-center justify-end gap-2 md:gap-3 px-5 md:px-6 py-4 border-t border-border">
              <button
                onClick={() => {
                  if (!editSaving) setEditOpen(false);
                }}
                disabled={editSaving}
                className="h-9 md:h-10 px-4 rounded-md text-sm md:text-base font-medium border border-border bg-background hover:bg-muted/50 transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Cancel
              </button>
              <button
                onClick={saveEvaluator}
                disabled={editSaving}
                className="h-9 md:h-10 px-4 rounded-md text-sm md:text-base font-medium bg-foreground text-background hover:opacity-90 transition-opacity cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
              >
                {editSaving && (
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
                )}
                {editSaving ? "Saving..." : "Save"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* New version dialog */}
      {newVersionOpen && evaluator && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
          <div
            className="bg-background border border-border rounded-xl w-full max-w-5xl shadow-2xl flex flex-col max-h-[90vh]"
          >
            {/* Header */}
            <div className="flex items-center justify-between px-5 md:px-6 py-4 border-b border-border">
              <h2 className="text-base md:text-lg font-semibold text-foreground">
                New version
              </h2>
              <button
                onClick={() => {
                  if (!newVersionSaving) setNewVersionOpen(false);
                }}
                disabled={newVersionSaving}
                className="flex items-center justify-center w-8 h-8 rounded-md hover:bg-muted transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
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
            <div className="flex-1 overflow-y-auto px-5 md:px-6 py-4 md:py-5 space-y-4 md:space-y-5">
              <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1.15fr)_minmax(320px,0.85fr)] gap-4 md:gap-6">
                {/* Left column — Prompt */}
                <div>
                  <label className="block text-xs md:text-sm font-medium mb-2">
                    Judge prompt <span className="text-red-500">*</span>
                  </label>
                  <textarea
                    value={newVersionSystemPrompt}
                    onChange={(e) =>
                      setNewVersionSystemPrompt(e.target.value)
                    }
                    placeholder={
                      evaluator.evaluator_type === "llm"
                        ? "Describe how the judge should grade a response. Reference existing variables with {{name}}."
                        : "Describe how the judge should grade a response"
                    }
                    className={`w-full px-4 py-3 rounded-md text-sm md:text-base border bg-background dark:bg-muted text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-accent focus:border-transparent resize-none h-[360px] lg:h-[560px] ${
                      newVersionValidated && !newVersionSystemPrompt.trim()
                        ? "border-red-500"
                        : "border-border"
                    }`}
                  />
                </div>

                {/* Right column — Version settings */}
                <div className="space-y-4 md:space-y-5">
                  <div>
                    <label className="block text-xs md:text-sm font-medium mb-2">
                      Summary of change{" "}
                      <span className="font-normal text-muted-foreground">
                        (optional)
                      </span>
                    </label>
                    <input
                      type="text"
                      value={newVersionChangelog}
                      onChange={(e) => setNewVersionChangelog(e.target.value)}
                      placeholder="Briefly describe what changed in this version"
                      className="w-full h-9 md:h-10 px-3 md:px-4 rounded-md text-sm md:text-base border border-border bg-background dark:bg-muted text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-accent focus:border-transparent"
                    />
                  </div>

                  <label className="flex items-center gap-3 rounded-md border border-emerald-500/30 bg-emerald-500/10 dark:border-emerald-400/30 dark:bg-emerald-500/15 px-3 md:px-4 py-3 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={newVersionMarkLive}
                      onChange={(e) => setNewVersionMarkLive(e.target.checked)}
                      disabled={newVersionSaving}
                      className="h-4 w-4 shrink-0 rounded border-emerald-500/50 accent-emerald-600 cursor-pointer disabled:cursor-not-allowed"
                    />
                    <span className="flex flex-col gap-0.5 min-w-0">
                      <span className="text-sm md:text-base font-medium text-emerald-700 dark:text-emerald-300">
                        Mark the new version as the live version
                      </span>
                      <span className="text-xs md:text-sm text-emerald-700/75 dark:text-emerald-300/75">
                        New tests will use this prompt version after it is created
                      </span>
                    </span>
                  </label>

                  <div>
                    <label className="block text-xs md:text-sm font-medium mb-2">
                      Judge model <span className="text-red-500">*</span>
                    </label>
                    <button
                      type="button"
                      onClick={() => setNewVersionLlmModalOpen(true)}
                      className={`w-full h-9 md:h-10 px-3 md:px-4 rounded-md text-sm md:text-base border bg-background dark:bg-muted hover:bg-muted/50 dark:hover:bg-accent flex items-center justify-between cursor-pointer transition-colors ${
                        newVersionValidated && !newVersionJudgeModel
                          ? "border-red-500"
                          : "border-border"
                      }`}
                    >
                      <span
                        className={
                          newVersionJudgeModel
                            ? "text-foreground"
                            : "text-muted-foreground"
                        }
                      >
                        {newVersionJudgeModel
                          ? newVersionJudgeModel.name
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

                  {evaluator.output_type === "rating" && (
                    <RatingScaleEditor
                      rows={newVersionScale}
                      onChange={setNewVersionScale}
                      validationAttempted={newVersionValidated}
                      description="At least two rows. Description is optional rubric text sent to the judge."
                      descriptionPlaceholder="Description (optional) - criteria for this level, shown to the judge"
                    />
                  )}

                  {(() => {
                    const existingVariables =
                      evaluator.live_version?.variables ?? [];
                    const detected = extractVariableNames(
                      newVersionSystemPrompt,
                    );
                    const existingNames = new Set(
                      existingVariables.map((v) => v.name),
                    );
                    const newNames = detected.filter(
                      (name) => !existingNames.has(name),
                    );
                    const isLLM = evaluator.evaluator_type === "llm";

                    if (isLLM && existingVariables.length > 0) {
                      return (
                        <div className="space-y-2">
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
                              Variable names cannot be added, renamed, or
                              removed on a new version, but you can update each
                              variable&apos;s description below
                            </span>
                          </div>
                          <div className="border border-border rounded-md overflow-hidden">
                            {existingVariables.map((variable, i) => {
                              const missingDescription =
                                newVersionValidated &&
                                !(
                                  newVersionVariableDescriptions[
                                    variable.name
                                  ] ?? ""
                                ).trim();
                              return (
                                <div
                                  key={variable.name}
                                  className={`p-3 md:p-4 bg-background dark:bg-muted flex flex-col md:flex-row md:items-start gap-2 md:gap-3 ${
                                    i > 0 ? "border-t border-border" : ""
                                  }`}
                                >
                                  <code className="self-start inline-flex items-center px-2 py-0.5 rounded-md text-sm font-mono font-semibold bg-blue-500/10 text-blue-700 dark:text-blue-300 md:flex-shrink-0 md:mt-1.5">
                                    {`{{${variable.name}}}`}
                                  </code>
                                  <input
                                    type="text"
                                    value={
                                      newVersionVariableDescriptions[
                                        variable.name
                                      ] ?? ""
                                    }
                                    onChange={(e) =>
                                      setNewVersionVariableDescriptions(
                                        (prev) => ({
                                          ...prev,
                                          [variable.name]: e.target.value,
                                        }),
                                      )
                                    }
                                    placeholder="Short description explaining the purpose of the variable"
                                    className={`flex-1 px-3 py-2 rounded-md text-sm bg-background dark:bg-muted text-foreground placeholder:text-muted-foreground border focus:outline-none focus:ring-2 focus:ring-accent ${
                                      missingDescription
                                        ? "border-red-500"
                                        : "border-border"
                                    }`}
                                  />
                                </div>
                              );
                            })}
                          </div>
                          {newNames.length > 0 && (
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
                                New variables cannot be added to an existing
                                evaluator. The placeholder
                                {newNames.length === 1 ? " " : "s "}
                                {newNames.map((name, i) => (
                                  <span key={name}>
                                    <code className="font-mono">{`{{${name}}}`}</code>
                                    {i < newNames.length - 1 ? ", " : ""}
                                  </span>
                                ))}{" "}
                                will be treated as literal text by the evaluator
                              </span>
                            </div>
                          )}
                        </div>
                      );
                    }

                    // No existing variables, but user typed {{...}} — same gating
                    // applies (variables can only be defined at create time).
                    if (isLLM && newNames.length > 0) {
                      return (
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
                            Variables can only be defined when the evaluator is
                            first created. The
                            {newNames.length === 1 ? " " : " "}
                            <code className="font-mono">{`{{...}}`}</code>{" "}
                            placeholder
                            {newNames.length === 1 ? "" : "s"} in your prompt
                            will be treated as literal text by the evaluator
                          </span>
                        </div>
                      );
                    }

                    // Non-LLM evaluator types don't support variables at all.
                    if (
                      !isLLM &&
                      detected.length > 0 &&
                      evaluator.evaluator_type
                    ) {
                      return (
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
                            Variables are not supported for this evaluator type.
                            The <code className="font-mono">{`{{...}}`}</code>{" "}
                            placeholders in your prompt will be treated as
                            literal text by the evaluator
                          </span>
                        </div>
                      );
                    }

                    return null;
                  })()}
                </div>
              </div>

              {newVersionError && (
                <p className="text-sm text-red-500">{newVersionError}</p>
              )}
            </div>

            {/* Footer */}
            <div className="flex items-center justify-end gap-2 md:gap-3 px-5 md:px-6 py-4 border-t border-border">
              <button
                onClick={() => {
                  if (!newVersionSaving) setNewVersionOpen(false);
                }}
                disabled={newVersionSaving}
                className="h-9 md:h-10 px-4 rounded-md text-sm md:text-base font-medium border border-border bg-background dark:bg-muted hover:bg-muted/50 dark:hover:bg-accent transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Cancel
              </button>
              <button
                onClick={createNewVersion}
                disabled={newVersionSaving}
                className="h-9 md:h-10 px-4 rounded-md text-sm md:text-base font-medium bg-foreground text-background hover:opacity-90 transition-opacity cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
              >
                {newVersionSaving && (
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
                )}
                {newVersionSaving
                  ? newVersionMarkLive
                    ? "Creating and marking live..."
                    : "Creating..."
                  : newVersionMarkLive
                    ? "Create and mark live"
                    : "Create version"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* LLM judge model selector for new version */}
      {evaluator && (
        <LLMSelectorModal
          isOpen={newVersionLlmModalOpen}
          onClose={() => setNewVersionLlmModalOpen(false)}
          selectedLLM={newVersionJudgeModel}
          onSelect={setNewVersionJudgeModel}
          allowedProviderSlugs={JUDGE_PROVIDER_SLUGS}
          requiredInputModality={
            evaluator.evaluator_type
              ? evaluator.evaluator_type === "tts"
                ? "audio"
                : "text"
              : evaluator.data_type === "audio"
                ? "audio"
                : "text"
          }
        />
      )}
    </AppLayout>
  );
}

function averageSeriesAgreement(series: TrendSeriesPoint[]): number | null {
  const values = series
    .map((p) => p.agreement)
    .filter((v): v is number => v != null);
  if (values.length === 0) return null;
  return values.reduce((a, b) => a + b, 0) / values.length;
}

function VersionAxisTick({
  x,
  y,
  payload,
  liveLabels,
}: {
  x?: number;
  y?: number;
  payload?: { value: string };
  liveLabels: Set<string>;
}) {
  const cx = x ?? 0;
  const cy = y ?? 0;
  const label = payload?.value ?? "";
  const isLive = liveLabels.has(label);
  return (
    <g transform={`translate(${cx},${cy})`}>
      <text
        x={0}
        y={0}
        dy={12}
        textAnchor="middle"
        fontSize={11}
        fill="currentColor"
      >
        {label}
      </text>
      {isLive && (
        <>
          <rect
            x={-17}
            y={18}
            width={34}
            height={14}
            rx={3}
            className="fill-green-500/10"
          />
          <text
            x={0}
            y={29}
            textAnchor="middle"
            fontSize={9}
            fontWeight={600}
            className="fill-green-600 dark:fill-green-400"
          >
            Live
          </text>
        </>
      )}
    </g>
  );
}

function AgreementTrendTab({
  trend,
  trendLoading,
  trendError,
  trendTaskId,
  onSelectTask,
  allTasks,
}: {
  trend: EvaluatorTrendResponse | null;
  trendLoading: boolean;
  trendError: string | null;
  trendTaskId: string;
  onSelectTask: (id: string) => void;
  allTasks: TrendTask[];
}) {
  const { chartData, liveLabels } = useMemo(() => {
    if (!trend?.versions?.length) return { chartData: [], liveLabels: new Set<string>() };
    const sorted = [...trend.versions].sort((a, b) => a.version_number - b.version_number);
    const liveSet = new Set(sorted.filter((v) => v.is_live).map((v) => `v${v.version_number}`));
    return {
      chartData: sorted.map((v) => ({
        version: `v${v.version_number}`,
        agreement: (() => {
          const avg = averageSeriesAgreement(v.series);
          return avg == null ? null : Math.round(avg * 100);
        })(),
      })),
      liveLabels: liveSet,
    };
  }, [trend]);

  const hasData =
    chartData.length > 0 && chartData.some((p) => p.agreement != null);

  type TaskOption = { id: string; name: string };
  const ALL_TASKS_OPTION: TaskOption = { id: "all", name: "All tasks" };
  const taskPickerItems: TaskOption[] = [
    ALL_TASKS_OPTION,
    ...allTasks.map((t) => ({ id: t.task_id, name: t.task_name })),
  ];

  return (
    <div className="space-y-4 md:space-y-6">
      {!trendLoading && (
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div>
            <h2 className="text-sm font-semibold">Agreement trend</h2>
            <p className="text-xs text-muted-foreground">
              How closely this evaluator aligns with human annotators across
              versions
            </p>
          </div>
          {allTasks.length > 0 && <SingleSelectPicker
            items={taskPickerItems}
            selectedId={trendTaskId}
            onSelect={(item) => onSelectTask(item.id)}
            getId={(item) => item.id}
            renderTrigger={(item) => (
              <span className="text-sm truncate">
                {item?.name ?? "All tasks"}
              </span>
            )}
            renderOption={(item, isSelected) => (
              <span
                className={`text-sm truncate ${isSelected ? "font-medium" : ""}`}
              >
                {item.name}
              </span>
            )}
            matchesSearch={(item, q) =>
              item.name.toLowerCase().includes(q.toLowerCase())
            }
            className="w-48"
          />}
        </div>
      )}

      {trendError && (
        <div className="rounded-md border border-border bg-muted/20 p-4 text-sm text-red-500">
          {trendError}
        </div>
      )}

      {trendLoading ? (
        <div className="flex items-center justify-center gap-2 py-12 text-sm text-muted-foreground">
          <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
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
          Loading agreement
        </div>
      ) : trendError ? null : !hasData ? (
        <div className="border border-border rounded-xl p-8 md:p-12 flex flex-col items-center justify-center bg-muted/20 text-center">
          <svg
            className="w-7 h-7 text-muted-foreground mb-3"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={1.5}
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M3 13.125C3 12.504 3.504 12 4.125 12h2.25c.621 0 1.125.504 1.125 1.125v6.75C7.5 20.496 6.996 21 6.375 21h-2.25A1.125 1.125 0 013 19.875v-6.75zM9.75 8.625c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125v11.25c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V8.625zM16.5 4.125c0-.621.504-1.125 1.125-1.125h2.25C20.496 3 21 3.504 21 4.125v15.75c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V4.125z"
            />
          </svg>
          <p className="text-sm font-medium text-foreground">
            No agreement data yet
          </p>
          <p className="text-xs text-muted-foreground mt-1.5 max-w-sm">
            Agreement trend will appear here once this evaluator has been run on
            items that annotators have also labelled
          </p>
        </div>
      ) : (
        <div className="border border-border rounded-xl p-4 md:p-6">
          <div className="w-full h-64 md:h-72">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={chartData}>
                <CartesianGrid
                  strokeDasharray="3 3"
                  stroke="rgba(125,125,125,0.15)"
                />
                <XAxis
                  dataKey="version"
                  padding={{ left: 40, right: 40 }}
                  tick={(props) => (
                    <VersionAxisTick {...props} liveLabels={liveLabels} />
                  )}
                  height={44}
                />
                <YAxis domain={[0, 100]} fontSize={11} unit="%" />
                <Tooltip
                  contentStyle={{
                    background: "var(--background, #fff)",
                    border: "1px solid rgba(125,125,125,0.2)",
                    borderRadius: 8,
                    fontSize: 12,
                  }}
                  formatter={(value) =>
                    value == null ? "—" : `${value}%`
                  }
                />
                <Line
                  type="monotone"
                  dataKey="agreement"
                  name="Agreement"
                  stroke="#3b82f6"
                  strokeWidth={2}
                  dot={{ r: 4 }}
                  connectNulls={false}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}
    </div>
  );
}
