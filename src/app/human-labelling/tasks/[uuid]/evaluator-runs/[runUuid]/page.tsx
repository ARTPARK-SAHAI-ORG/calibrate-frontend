"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { AppLayout } from "@/components/AppLayout";
import { EvaluatorVerdictCard } from "@/components/EvaluatorVerdictCard";
import {
  ItemPane,
  type Item,
} from "@/components/human-labelling/AnnotationJobView";
import { useAccessToken } from "@/hooks";
import { apiClient } from "@/lib/api";
import { useSidebarState } from "@/lib/sidebar";
import {
  AgreementStatCard,
  agreementColor,
} from "@/components/human-labelling/AgreementStatCard";

type EvaluatorRunRow = {
  uuid: string;
  job_id: string;
  item_id: string;
  evaluator_id: string;
  evaluator_version_id: string;
  value: { value?: unknown; reasoning?: unknown } | null;
  status: string;
  created_at: string;
  completed_at: string | null;
  // Backend now embeds the version's scale bounds (numeric min/max for
  // rating evaluators, null for binary).
  evaluator_version?: {
    uuid?: string;
    version_number?: number;
    scale_min?: number | null;
    scale_max?: number | null;
  } | null;
  evaluator?: {
    uuid?: string;
    name?: string;
    description?: string | null;
    output_type?: string;
  } | null;
};

/** Embedded on GET …/evaluator-runs/{job_uuid} only; join `uuid` ↔ `runs[].item_id`. */
type EvaluatorRunItemSnapshot = {
  uuid: string;
  payload: unknown;
};

type HumanAnnotationValue = {
  value?: unknown;
  reasoning?: unknown;
} | null;

type HumanAnnotation = {
  annotation_id: string;
  annotator_id: string;
  annotator_name: string | null;
  job_id: string;
  value: HumanAnnotationValue;
  /** Convenience copy of `value.reasoning`; null when not provided. */
  reasoning?: string | null;
  updated_at: string;
};

type HumanAgreementEvaluatorSummary = {
  evaluator_id: string;
  evaluator_version_id: string | null;
  agreement: number | null;
  pair_count: number;
  item_count: number;
};

type HumanAgreementItemEvaluator = {
  evaluator_id: string;
  agreement: number | null;
  pair_count: number;
  human_annotations: HumanAnnotation[];
  /** Inter-annotator agreement for this slot; optional — computed client-side when absent. */
  human_agreement?: number | null;
  /** Evaluator vs human labels; optional — computed client-side when absent. */
  evaluator_agreement?: number | null;
};

type HumanAgreementItem = {
  item_id: string;
  annotator_count: number;
  evaluators: HumanAgreementItemEvaluator[];
};

type HumanAgreement = {
  evaluators: HumanAgreementEvaluatorSummary[];
  items: HumanAgreementItem[];
};

type EvaluatorRunJob = {
  uuid: string;
  task_id: string;
  status: "queued" | "in_progress" | "completed" | "failed";
  details: {
    evaluators?: {
      evaluator_id: string;
      evaluator_version_id?: string;
      name?: string;
    }[];
    item_count?: number;
    s3_prefix?: string;
    item_ids?: string[];
  } | null;
  error: string | null;
  created_at: string;
  updated_at: string;
  completed_at: string | null;
  runs: EvaluatorRunRow[];
  /** Snapshot payloads for this job; preferred over live task items (survives soft-delete). */
  items?: EvaluatorRunItemSnapshot[];
  /** Human annotation overlap and per-(item,evaluator) values; populated opportunistically. */
  human_agreement?: HumanAgreement;
};

type LabellingTaskFull = {
  uuid: string;
  name: string;
  type: "llm" | "stt" | "tts" | "simulation";
  description?: string | null;
  evaluators?: { uuid: string; name: string }[];
  items?: Item[];
};

/** Prefer job/run payload names; fallback to linked task evaluators (often present before runs finish). */
function evaluatorDisplayName(
  ev: { evaluator_id: string; name?: string },
  nameByEvaluatorId: Record<string, string>,
  runRow?: EvaluatorRunRow | null,
): string {
  for (const candidate of [
    ev.name,
    runRow?.evaluator?.name,
    nameByEvaluatorId[ev.evaluator_id],
  ]) {
    if (typeof candidate === "string" && candidate.trim().length > 0) {
      return candidate.trim();
    }
  }
  return ev.evaluator_id.slice(0, 8);
}

function snapshotToItem(snap: EvaluatorRunItemSnapshot, taskId: string): Item {
  return {
    id: 0,
    uuid: snap.uuid,
    task_id: taskId,
    payload: snap.payload,
    created_at: "",
    deleted_at: null,
  };
}

/**
 * Order snapshots for the run UI: explicit `details.item_ids`, else first-seen
 * `runs[].item_id`, else API order, with `item_count` cap when applicable.
 */
function orderedSnapshotsForRun(
  job: EvaluatorRunJob,
): EvaluatorRunItemSnapshot[] {
  const snaps = job.items ?? [];
  if (snaps.length === 0) return [];
  const byUuid = new Map(snaps.map((s) => [s.uuid, s]));
  const seen = new Set<string>();
  const out: EvaluatorRunItemSnapshot[] = [];

  const pushIds = (ids: string[]) => {
    for (const id of ids) {
      if (!id || seen.has(id)) continue;
      seen.add(id);
      const s = byUuid.get(id);
      out.push(s ?? { uuid: id, payload: {} });
    }
  };

  const subset = job.details?.item_ids;
  if (subset && subset.length > 0) {
    pushIds(subset);
  } else {
    const fromRuns: string[] = [];
    const runSeen = new Set<string>();
    for (const r of job.runs ?? []) {
      if (!r.item_id || runSeen.has(r.item_id)) continue;
      runSeen.add(r.item_id);
      fromRuns.push(r.item_id);
    }
    if (fromRuns.length > 0) pushIds(fromRuns);
  }

  for (const s of snaps) {
    if (!seen.has(s.uuid)) {
      seen.add(s.uuid);
      out.push(s);
    }
  }

  const cap = job.details?.item_count;
  if (typeof cap === "number" && cap >= 0 && cap < out.length) {
    return out.slice(0, cap);
  }
  return out;
}

function parseApiError(err: unknown, fallback: string): string {
  if (!(err instanceof Error)) return fallback;
  const m = err.message.match(/Request failed: \d+ - (.+)$/);
  if (m) {
    try {
      const parsed = JSON.parse(m[1]);
      if (parsed && typeof parsed.detail === "string") return parsed.detail;
    } catch {
      // ignore
    }
    return m[1];
  }
  return err.message || fallback;
}

function statusPillClass(status: EvaluatorRunJob["status"]): string {
  switch (status) {
    case "completed":
      return "border-green-200 bg-green-100 text-green-700 dark:border-green-500/30 dark:bg-green-500/20 dark:text-green-400";
    case "failed":
      return "border-red-200 bg-red-100 text-red-700 dark:border-red-500/30 dark:bg-red-500/20 dark:text-red-400";
    case "in_progress":
      return "border-yellow-200 bg-yellow-100 text-yellow-700 dark:border-yellow-500/30 dark:bg-yellow-500/20 dark:text-yellow-400";
    default:
      return "border-gray-200 bg-gray-100 text-gray-700 dark:border-gray-500/30 dark:bg-gray-500/20 dark:text-gray-300";
  }
}

function formatAgreement(value: number | null | undefined): string {
  if (value == null) return "—";
  return `${(value * 100).toFixed(1)}%`;
}

function runOutputType(run: EvaluatorRunRow | undefined): "binary" | "rating" {
  const v = run?.value?.value;
  if (typeof v === "boolean") return "binary";
  if (typeof v === "number") return "rating";
  if (run?.evaluator?.output_type === "rating") return "rating";
  return "binary";
}

function valuesComparable(
  a: unknown,
  b: unknown,
  outputType: "binary" | "rating",
): boolean {
  if (outputType === "binary") {
    return typeof a === "boolean" && typeof b === "boolean";
  }
  return typeof a === "number" && typeof b === "number" && Number.isFinite(a) && Number.isFinite(b);
}

function valuesMatchOutput(
  a: unknown,
  b: unknown,
  outputType: "binary" | "rating",
): boolean {
  if (!valuesComparable(a, b, outputType)) return false;
  return a === b;
}

/** Pairwise inter-annotator agreement among labelled values (same notion as task summary when API omits `human_agreement`). */
function computeInterAnnotatorAgreement(
  annotations: HumanAnnotation[],
  outputType: "binary" | "rating",
): number | null {
  const vals = annotations
    .map((x) => x.value?.value)
    .filter(
      (v) =>
        typeof v === "boolean" || (typeof v === "number" && Number.isFinite(v)),
    );
  if (vals.length < 2) return null;
  let agree = 0;
  let total = 0;
  for (let i = 0; i < vals.length; i++) {
    for (let j = i + 1; j < vals.length; j++) {
      if (!valuesComparable(vals[i], vals[j], outputType)) continue;
      total++;
      if (valuesMatchOutput(vals[i], vals[j], outputType)) agree++;
    }
  }
  return total > 0 ? agree / total : null;
}

/** Share of human labels that match the evaluator output (when API omits `evaluator_agreement`). */
function computeEvaluatorHumanAgreement(
  annotations: HumanAnnotation[],
  machineVal: unknown,
  outputType: "binary" | "rating",
): number | null {
  let comparable = 0;
  let aligned = 0;
  for (const a of annotations) {
    const h = a.value?.value;
    if (!valuesComparable(h, machineVal, outputType)) continue;
    comparable++;
    if (valuesMatchOutput(h, machineVal, outputType)) aligned++;
  }
  return comparable > 0 ? aligned / comparable : null;
}

/** Row included in spreadsheet export when humans labelled this slot and `agreement` (evaluator ↔ human consensus) is below 100%. */
function isBelowFullEvaluatorAgreement(
  evHumanData: HumanAgreementItemEvaluator | undefined,
): boolean {
  if (!evHumanData || evHumanData.human_annotations.length === 0)
    return false;
  const ag = evHumanData.agreement;
  return typeof ag === "number" && ag < 1;
}

function agreementExportCell(
  fromApi: number | null | undefined,
  computed: number | null,
): string {
  if (fromApi !== undefined) return formatAgreement(fromApi);
  return formatAgreement(computed);
}

/** Read `payload.evaluator_variables[evaluatorId] -> { var: value }`. */
function extractEvaluatorVariables(
  payload: unknown,
): Record<string, Record<string, string>> {
  if (!payload || typeof payload !== "object") return {};
  const ev = (payload as Record<string, unknown>).evaluator_variables;
  if (!ev || typeof ev !== "object") return {};
  const out: Record<string, Record<string, string>> = {};
  for (const [evId, raw] of Object.entries(ev as Record<string, unknown>)) {
    if (!raw || typeof raw !== "object") continue;
    const flat: Record<string, string> = {};
    for (const [k, v] of Object.entries(raw as Record<string, unknown>)) {
      if (typeof v === "string") flat[k] = v;
      else if (v != null) flat[k] = String(v);
    }
    if (Object.keys(flat).length > 0) out[evId] = flat;
  }
  return out;
}

function exportInputCols(taskType: LabellingTaskFull["type"]): string[] {
  if (taskType === "stt") return ["reference_transcript", "predicted_transcript"];
  if (taskType === "llm") return ["conversation_history", "agent_response"];
  return ["transcript"];
}

function serializeMessages(messages: unknown[]): string {
  return messages
    .map((msg) => {
      if (!msg || typeof msg !== "object") return null;
      const m = msg as Record<string, unknown>;
      const role = typeof m.role === "string" ? m.role : "unknown";
      if (Array.isArray(m.tool_calls) && m.tool_calls.length > 0) {
        const calls = m.tool_calls
          .map((tc: unknown) => {
            if (!tc || typeof tc !== "object") return "";
            const t = tc as Record<string, unknown>;
            const fn = t.function as Record<string, unknown> | undefined;
            return fn ? `${fn.name}(${fn.arguments})` : "";
          })
          .join("; ");
        return `${role} (tool_call): ${calls}`;
      }
      const content = typeof m.content === "string" ? m.content : "";
      return `${role}: ${content}`;
    })
    .filter(Boolean)
    .join("\n");
}

function extractPayloadInputValues(
  payload: unknown,
  taskType: LabellingTaskFull["type"],
): unknown[] {
  const p =
    payload && typeof payload === "object"
      ? (payload as Record<string, unknown>)
      : {};
  if (taskType === "stt") {
    return [
      typeof p.reference_transcript === "string" ? p.reference_transcript : "",
      typeof p.predicted_transcript === "string" ? p.predicted_transcript : "",
    ];
  }
  if (taskType === "llm") {
    const history = Array.isArray(p.chat_history)
      ? serializeMessages(p.chat_history)
      : "";
    const response =
      typeof p.agent_response === "string" ? p.agent_response : "";
    return [history, response];
  }
  // simulation
  return [Array.isArray(p.transcript) ? serializeMessages(p.transcript) : ""];
}

function annotatorDisplayName(a: {
  annotator_name: string | null;
  annotator_id: string;
}): string {
  if (a.annotator_name && a.annotator_name.trim().length > 0)
    return a.annotator_name;
  return a.annotator_id.slice(0, 8);
}

function statusLabel(status: EvaluatorRunJob["status"]): string {
  if (status === "queued") return "Queued";
  if (status === "in_progress") return "In progress";
  if (status === "completed") return "Completed";
  if (status === "failed") return "Failed";
  return status;
}

export default function EvaluatorRunDetailPage() {
  const router = useRouter();
  const params = useParams();
  const accessToken = useAccessToken();
  const [sidebarOpen, setSidebarOpen] = useSidebarState();

  const taskUuid =
    typeof params?.uuid === "string"
      ? params.uuid
      : Array.isArray(params?.uuid)
        ? params.uuid[0]
        : "";
  const runUuid =
    typeof params?.runUuid === "string"
      ? params.runUuid
      : Array.isArray(params?.runUuid)
        ? params.runUuid[0]
        : "";

  const [job, setJob] = useState<EvaluatorRunJob | null>(null);
  const [task, setTask] = useState<LabellingTaskFull | null>(null);
  const [versionLabels, setVersionLabels] = useState<Record<string, string>>(
    {},
  );
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [filterDisagreements, setFilterDisagreements] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [exportError, setExportError] = useState<string | null>(null);
  const startTime = useRef(Date.now());

  const evaluatorNamesById = useMemo(() => {
    const m: Record<string, string> = {};
    for (const ev of task?.evaluators ?? []) {
      const n = ev.name?.trim();
      if (ev.uuid && n) m[ev.uuid] = n;
    }
    return m;
  }, [task?.evaluators]);

  useEffect(() => {
    document.title = "Evaluation run | Calibrate";
  }, []);

  const fetchJob = useCallback(async () => {
    if (!accessToken || !taskUuid || !runUuid) return null;
    try {
      const data = await apiClient<EvaluatorRunJob>(
        `/annotation-tasks/${taskUuid}/evaluator-runs/${runUuid}`,
        accessToken,
      );
      setJob(data);
      setError(null);
      setLoading(false);
      return data;
    } catch (err) {
      setError(parseApiError(err, "Failed to load run"));
      setLoading(false);
      return null;
    }
  }, [accessToken, taskUuid, runUuid]);

  // Fetch the task for type (and fallback item list when the job has no `items[]`).
  useEffect(() => {
    if (!accessToken || !taskUuid) return;
    let cancelled = false;
    (async () => {
      try {
        const data = await apiClient<LabellingTaskFull>(
          `/annotation-tasks/${taskUuid}`,
          accessToken,
        );
        if (!cancelled) setTask(data);
      } catch {
        // surfaced below
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [accessToken, taskUuid]);

  // Poll the run.
  useEffect(() => {
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | null = null;
    const tick = async () => {
      if (cancelled) return;
      const data = await fetchJob();
      if (cancelled) return;
      const isTerminal =
        data && (data.status === "completed" || data.status === "failed");
      if (!isTerminal) {
        const elapsed = Date.now() - startTime.current;
        const delay = elapsed < 30_000 ? 2500 : 5000;
        timer = setTimeout(tick, delay);
      }
    };
    tick();
    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
    };
  }, [fetchJob]);

  // Lazily fetch version labels for evaluators referenced by the run.
  // Keyed on the sorted list of evaluator IDs so the effect doesn't
  // re-fire when the run polls — `job` changes every 2.5s while the
  // job is in-progress, but the evaluator set is fixed at run creation.
  const evaluatorIdsKey = (job?.details?.evaluators ?? [])
    .map((e) => e.evaluator_id)
    .filter(Boolean)
    .slice()
    .sort()
    .join(",");
  useEffect(() => {
    if (!accessToken || !evaluatorIdsKey) return;
    const evIds = evaluatorIdsKey.split(",");
    let cancelled = false;
    (async () => {
      const merged: Record<string, string> = {};
      await Promise.all(
        evIds.map(async (evaluatorId) => {
          try {
            const versions = await apiClient<
              Array<{ uuid: string; version_number: number }>
            >(`/evaluators/${evaluatorId}/versions`, accessToken);
            for (const v of versions) {
              merged[v.uuid] = `v${v.version_number}`;
            }
          } catch {
            // ignore
          }
        }),
      );
      if (!cancelled) setVersionLabels((prev) => ({ ...prev, ...merged }));
    })();
    return () => {
      cancelled = true;
    };
  }, [accessToken, evaluatorIdsKey]);

  // Reset item index when the disagreement filter is toggled.
  useEffect(() => {
    setCurrentIndex(0);
  }, [filterDisagreements]);

  // Item previews: prefer embedded `job.items` (snapshot, survives soft-delete);
  // otherwise same ordering rules against live `task.items`.
  const itemsForRun = useMemo<Item[]>(() => {
    if (!job) return [];
    const taskId = task?.uuid ?? job.task_id;
    const embedded = job.items;
    if (embedded && embedded.length > 0) {
      return orderedSnapshotsForRun(job).map((s) => snapshotToItem(s, taskId));
    }
    if (!task?.items) return [];
    const subset = job.details?.item_ids;
    if (subset && subset.length > 0) {
      const set = new Set(subset);
      return task.items.filter((i) => set.has(i.uuid));
    }
    const fromRuns = new Set<string>();
    for (const r of job.runs ?? []) {
      if (r.item_id) fromRuns.add(r.item_id);
    }
    if (fromRuns.size > 0) {
      return task.items.filter((i) => fromRuns.has(i.uuid));
    }
    const cap = job.details?.item_count;
    if (typeof cap === "number" && cap >= 0 && cap < task.items.length) {
      return task.items.slice(0, cap);
    }
    return task.items;
  }, [job, task]);

  const hasDisagreements = useMemo(
    () =>
      !!(
        job?.human_agreement &&
        job.human_agreement.items.some((item) =>
          item.evaluators.some(
            (e) =>
              e.human_annotations.length > 0 &&
              e.agreement !== null &&
              e.agreement !== 1,
          ),
        )
      ),
    [job],
  );

  // Items that have at least one evaluator with a misaligned human annotation.
  const filteredItemsForRun = useMemo(
    () =>
      filterDisagreements
        ? itemsForRun.filter((it) => {
            const itemAgreement = job?.human_agreement?.items.find(
              (i) => i.item_id === it.uuid,
            );
            if (!itemAgreement) return false;
            return itemAgreement.evaluators.some(
              (e) => e.human_annotations.length > 0 && e.agreement !== null && e.agreement !== 1,
            );
          })
        : itemsForRun,
    [filterDisagreements, itemsForRun, job],
  );

  // Map from item UUID to its 1-based position in the full (unfiltered) list.
  const originalIndexByUuid = useMemo(
    () => new Map(itemsForRun.map((it, i) => [it.uuid, i + 1])),
    [itemsForRun],
  );

  const total = filteredItemsForRun.length;
  const safeIndex = Math.min(Math.max(currentIndex, 0), Math.max(total - 1, 0));
  const currentItem: Item | undefined = filteredItemsForRun[safeIndex];

  // Group runs by item_id for quick lookup.
  const runsByItem = useMemo(() => {
    const m: Record<string, EvaluatorRunRow[]> = {};
    for (const r of job?.runs ?? []) {
      (m[r.item_id] = m[r.item_id] ?? []).push(r);
    }
    return m;
  }, [job]);

  const itemDone = (itemId: string): boolean => {
    if (!job || job.status !== "completed") return false;
    const rs = runsByItem[itemId] ?? [];
    const evaluators = job.details?.evaluators ?? [];
    if (rs.length === 0 || evaluators.length === 0) return false;
    return evaluators.every((e) =>
      rs.some(
        (r) =>
          r.evaluator_id === e.evaluator_id &&
          (!e.evaluator_version_id ||
            r.evaluator_version_id === e.evaluator_version_id) &&
          r.status === "completed",
      ),
    );
  };

  const handleExport = useCallback(async () => {
    const exportItems = itemsForRun;
    if (!job || !task || exportItems.length === 0) return;
    setExporting(true);
    setExportError(null);
    try {
      const ExcelJS = (await import("exceljs")).default;
      const wb = new ExcelJS.Workbook();
      const evaluators = job.details?.evaluators ?? [];

      for (const ev of evaluators) {
        const evName = evaluatorDisplayName(ev, evaluatorNamesById);
        const versionLabel = ev.evaluator_version_id
          ? (versionLabels[ev.evaluator_version_id] ?? null)
          : null;
        const rawSheetName = versionLabel ? `${evName} ${versionLabel}` : evName;
        const sheetName = rawSheetName.replace(/[:\\/?*[\]]/g, "_").slice(0, 31);

        // Collect variable names across exported rows only (this sheet: agreement < 100%)
        const allVarNames = new Set<string>();
        for (const item of exportItems) {
          const haItem = job.human_agreement?.items.find(
            (i) => i.item_id === item.uuid,
          );
          const evHumanData = haItem?.evaluators.find(
            (e) => e.evaluator_id === ev.evaluator_id,
          );
          if (!isBelowFullEvaluatorAgreement(evHumanData)) continue;
          const vars = extractEvaluatorVariables(item.payload);
          for (const k of Object.keys(vars[ev.evaluator_id] ?? {})) {
            allVarNames.add(k);
          }
        }
        const varNames = Array.from(allVarNames).sort();

        // Collect all annotators (id → display name) for this evaluator
        const annotatorMap = new Map<string, string>();
        for (const haItem of job.human_agreement?.items ?? []) {
          const evData = haItem.evaluators.find(
            (e) => e.evaluator_id === ev.evaluator_id,
          );
          for (const ann of evData?.human_annotations ?? []) {
            if (!annotatorMap.has(ann.annotator_id)) {
              annotatorMap.set(
                ann.annotator_id,
                annotatorDisplayName(ann),
              );
            }
          }
        }
        const annotatorIds = Array.from(annotatorMap.keys());

        // Header
        const inputCols = exportInputCols(task.type);
        const varCols = varNames.map((v) => `${evName}/${v}`);
        const annotatorCols = annotatorIds.flatMap((id) => {
          const name = annotatorMap.get(id)!;
          return [`${name}/value`, `${name}/reasoning`];
        });
        const header = [
          ...inputCols,
          ...varCols,
          "Human agreement",
          "Evaluator agreement",
          "Evaluator/value",
          "Evaluator/reasoning",
          ...annotatorCols,
        ];

        const rows: unknown[][] = [header];

        for (const item of exportItems) {
          const haItem = job.human_agreement?.items.find(
            (i) => i.item_id === item.uuid,
          );
          const evHumanData = haItem?.evaluators.find(
            (e) => e.evaluator_id === ev.evaluator_id,
          );
          if (!isBelowFullEvaluatorAgreement(evHumanData)) continue;

          const inputValues = extractPayloadInputValues(
            item.payload,
            task.type,
          );
          const vars = extractEvaluatorVariables(item.payload);
          const evVars = vars[ev.evaluator_id] ?? {};
          const varValues = varNames.map((v) => evVars[v] ?? "");

          const run = (runsByItem[item.uuid] ?? []).find(
            (r) =>
              r.evaluator_id === ev.evaluator_id &&
              (!ev.evaluator_version_id ||
                r.evaluator_version_id === ev.evaluator_version_id),
          );
          let evValue: unknown = "";
          let evReasoning = "";
          if (run) {
            const v = run.value?.value;
            evValue = v != null ? v : "";
            const reas = run.value?.reasoning;
            evReasoning = typeof reas === "string" ? reas : "";
          }

          const outputType = runOutputType(run);
          const humanAgCell = agreementExportCell(
            evHumanData?.human_agreement,
            computeInterAnnotatorAgreement(
              evHumanData?.human_annotations ?? [],
              outputType,
            ),
          );
          const evaluatorAgCell = agreementExportCell(
            evHumanData?.evaluator_agreement,
            computeEvaluatorHumanAgreement(
              evHumanData?.human_annotations ?? [],
              run?.value?.value,
              outputType,
            ),
          );
          const annotatorValues = annotatorIds.flatMap((annotatorId) => {
            const ann = evHumanData?.human_annotations.find(
              (a) => a.annotator_id === annotatorId,
            );
            if (!ann) return ["", ""];
            const v = ann.value?.value;
            const annValue = v != null ? v : "";
            const topReasoning =
              typeof ann.reasoning === "string" ? ann.reasoning : null;
            const nestedReasoning =
              typeof ann.value?.reasoning === "string"
                ? (ann.value.reasoning as string)
                : null;
            const annReasoning = topReasoning ?? nestedReasoning ?? "";
            return [annValue, annReasoning];
          });

          rows.push([
            ...inputValues,
            ...varValues,
            humanAgCell,
            evaluatorAgCell,
            evValue,
            evReasoning,
            ...annotatorValues,
          ]);
        }

        const ws = wb.addWorksheet(sheetName);
        ws.addRows(rows);
      }

      const buffer = await wb.xlsx.writeBuffer();
      const blob = new Blob([buffer], {
        type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `evaluator-run-${job.uuid.slice(0, 8)}.xlsx`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      setExportError(err instanceof Error ? err.message : "Export failed");
    } finally {
      setExporting(false);
    }
  }, [job, task, itemsForRun, runsByItem, versionLabels, evaluatorNamesById]);

  return (
    <AppLayout
      activeItem="human-labelling"
      onItemChange={(id) => router.push(`/${id}`)}
      sidebarOpen={sidebarOpen}
      onSidebarToggle={() => setSidebarOpen(!sidebarOpen)}
    >
      <div className="py-4 md:py-6 flex flex-col gap-4" style={{ height: "calc(100dvh - 56px)" }}>
        <button
          onClick={() =>
            router.push(`/human-labelling/tasks/${taskUuid}?tab=runs`)
          }
          className="text-sm text-muted-foreground hover:text-foreground transition-colors cursor-pointer flex items-center gap-1.5"
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
          Back to evaluation runs
        </button>

        {loading && !job && (
          <div className="flex items-center justify-center gap-2 py-8 text-sm text-muted-foreground">
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
              />
              <path
                className="opacity-75"
                fill="currentColor"
                d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
              />
            </svg>
            Loading run
          </div>
        )}

        {error && (
          <div className="rounded-md border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-500">
            {error}
          </div>
        )}

        {job &&
        task &&
        (task.type === "stt" ||
          task.type === "llm" ||
          task.type === "simulation") ? (
          <>
            <div className="flex items-center justify-between gap-3 flex-wrap">
              <span
                className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium border ${statusPillClass(
                  job.status,
                )}`}
              >
                {statusLabel(job.status)}
              </span>
              {job.status === "completed" && itemsForRun.length > 0 && (
                <button
                  type="button"
                  onClick={handleExport}
                  disabled={exporting}
                  title="Download spreadsheet (XLSX)"
                  className="inline-flex items-center gap-2 h-11 px-6 rounded-md text-[14px] font-semibold bg-foreground text-background shadow-sm hover:opacity-90 transition-opacity cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {exporting ? (
                    <svg
                      className="w-4 h-4 shrink-0 animate-spin"
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
                      />
                      <path
                        className="opacity-75"
                        fill="currentColor"
                        d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                      />
                    </svg>
                  ) : (
                    <svg
                      className="w-4 h-4 shrink-0"
                      fill="none"
                      viewBox="0 0 24 24"
                      stroke="currentColor"
                      strokeWidth={2}
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"
                      />
                    </svg>
                  )}
                  {exporting ? "Exporting…" : "Export results"}
                </button>
              )}
            </div>
            {exportError && (
              <div className="rounded-md border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-500">
                Export failed: {exportError}
              </div>
            )}
            {(() => {
              const ha = job.human_agreement;
              const cardsWillRender =
                job.status === "completed" &&
                !!ha &&
                ha.evaluators.length > 0 &&
                !(
                  ha.evaluators.every((e) => e.agreement === null) &&
                  ha.items.length === 0
                );
              if (cardsWillRender) return null;
              return (
                <div className="flex items-center gap-2 flex-wrap min-w-0">
                  {(job.details?.evaluators ?? []).length === 0 ? (
                    <span className="text-sm text-muted-foreground">—</span>
                  ) : (
                    (job.details?.evaluators ?? []).map((e) => {
                      const name = evaluatorDisplayName(e, evaluatorNamesById);
                      const label = e.evaluator_version_id
                        ? versionLabels[e.evaluator_version_id]
                        : null;
                      return (
                        <Link
                          key={`${e.evaluator_id}-${e.evaluator_version_id ?? ""}`}
                          href={`/evaluators/${e.evaluator_id}`}
                          title={`Open ${name}`}
                          className="inline-flex items-center gap-1 flex-wrap px-2 py-0.5 rounded-md text-sm font-semibold border border-border bg-muted/40 text-foreground hover:bg-muted hover:border-foreground/30 transition-colors cursor-pointer shrink-0 text-left"
                        >
                          <span className="break-words whitespace-normal">
                            {name}
                          </span>
                          {label && (
                            <span className="font-mono text-[11px] text-muted-foreground">
                              {label}
                            </span>
                          )}
                        </Link>
                      );
                    })
                  )}
                </div>
              );
            })()}

            <HumanAgreementSummary
              jobStatus={job.status}
              agreement={job.human_agreement}
              evaluators={job.details?.evaluators ?? []}
              evaluatorNamesById={evaluatorNamesById}
              versionLabels={versionLabels}
            />

            <div className="border border-border rounded-xl [overflow:clip] flex flex-col flex-1 min-h-0">
              <div className="flex flex-col flex-1 min-h-0">
                {hasDisagreements && (
                  <div className="border-b border-border px-4 md:px-6 py-2.5 flex items-center justify-start">
                    <button
                      onClick={() => setFilterDisagreements((f) => !f)}
                      className={`h-8 px-3 rounded-md text-xs font-medium border transition-colors cursor-pointer ${
                        filterDisagreements
                          ? "border-red-400 bg-red-500/10 text-red-700 dark:border-red-500/50 dark:bg-red-500/20 dark:text-red-400"
                          : "border-foreground/20 bg-muted/60 text-foreground hover:bg-muted hover:border-foreground/30"
                      }`}
                    >
                      {filterDisagreements
                        ? "Showing disagreements only"
                        : "Show disagreements only"}
                    </button>
                  </div>
                )}
                <header className="border-b border-border px-4 md:px-6 py-3 flex items-center justify-center gap-2">
                  <button
                    onClick={() =>
                      setCurrentIndex(Math.max(0, currentIndex - 1))
                    }
                    disabled={currentIndex === 0 || total === 0}
                    className="h-9 px-3 rounded-md text-sm font-medium border border-border bg-background hover:bg-muted/50 transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    Previous
                  </button>
                  <span className="text-sm text-muted-foreground tabular-nums px-2">
                    Item{" "}
                    {currentItem
                      ? (originalIndexByUuid.get(currentItem.uuid) ?? safeIndex + 1)
                      : Math.min(safeIndex + 1, Math.max(total, 1))}{" "}
                    of {itemsForRun.length}
                  </span>
                  <button
                    onClick={() =>
                      setCurrentIndex(Math.min(total - 1, currentIndex + 1))
                    }
                    disabled={currentIndex >= total - 1 || total === 0}
                    className="h-9 px-3 rounded-md text-sm font-medium border border-border bg-background hover:bg-muted/50 transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    Next
                  </button>
                </header>

                <div className="flex flex-col md:flex-row flex-1 min-h-0">
                  {/* Mobile: horizontal scrolling strip */}
                  <div className="md:hidden w-full max-h-32 border-b border-border bg-muted/20 overflow-y-auto">
                    <div className="p-2 grid grid-cols-8 gap-2">
                      {filteredItemsForRun.map((it, i) => {
                        const done = itemDone(it.uuid);
                        const isCurrent = i === safeIndex;
                        const label = originalIndexByUuid.get(it.uuid) ?? i + 1;
                        return (
                          <button
                            key={it.uuid}
                            onClick={() => setCurrentIndex(i)}
                            title={`Item ${label}${done ? " (completed)" : ""}`}
                            className={`h-10 w-full rounded-md border text-sm font-medium transition-colors cursor-pointer flex items-center justify-center ${
                              isCurrent
                                ? "border-foreground bg-foreground text-background"
                                : done
                                  ? "border-blue-200 bg-blue-100 text-blue-700 dark:border-blue-500/30 dark:bg-blue-500/20 dark:text-blue-400"
                                  : "border-border bg-background text-foreground hover:bg-muted/50"
                            }`}
                          >
                            {label}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                  {/* Desktop: sidebar whose height is defined by the main pane, not its own content */}
                  <div className="hidden md:block relative w-20 flex-shrink-0 border-r border-border bg-muted/20">
                    <div className="absolute inset-0 overflow-y-auto">
                      <div className="p-3 grid grid-cols-1 gap-2">
                        {filteredItemsForRun.map((it, i) => {
                          const done = itemDone(it.uuid);
                          const isCurrent = i === safeIndex;
                          const label = originalIndexByUuid.get(it.uuid) ?? i + 1;
                          return (
                            <button
                              key={it.uuid}
                              onClick={() => setCurrentIndex(i)}
                              title={`Item ${label}${done ? " (completed)" : ""}`}
                              className={`h-10 w-full rounded-md border text-sm font-medium transition-colors cursor-pointer flex items-center justify-center ${
                                isCurrent
                                  ? "border-foreground bg-foreground text-background"
                                  : done
                                    ? "border-blue-200 bg-blue-100 text-blue-700 dark:border-blue-500/30 dark:bg-blue-500/20 dark:text-blue-400"
                                    : "border-border bg-background text-foreground hover:bg-muted/50"
                              }`}
                            >
                              {label}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  </div>

                  <main className="flex-1 flex flex-col md:flex-row min-h-0 overflow-y-auto md:overflow-hidden">
                    {!currentItem ? (
                      <div className="flex items-center justify-center h-full p-8 text-sm text-muted-foreground">
                        No items in this run.
                      </div>
                    ) : (
                      <>
                        <div className="md:flex-1 md:min-h-0 md:overflow-y-auto p-4 md:p-6 md:border-r border-border">
                          <ItemPane item={currentItem} taskType={task.type} />
                        </div>
                        <div className="md:flex-1 md:min-h-0 md:overflow-y-auto p-4 md:p-6">
                          <EvaluatorResultsPane
                            evaluators={job.details?.evaluators ?? []}
                            evaluatorNamesById={evaluatorNamesById}
                            runs={runsByItem[currentItem.uuid] ?? []}
                            versionLabels={versionLabels}
                            jobStatus={job.status}
                            humanAgreementForItem={
                              job.human_agreement?.items.find(
                                (i) => i.item_id === currentItem.uuid,
                              ) ?? null
                            }
                            evaluatorVariablesByEvaluatorId={extractEvaluatorVariables(
                              currentItem.payload,
                            )}
                            filterDisagreements={filterDisagreements}
                          />
                        </div>
                      </>
                    )}
                  </main>
                </div>
              </div>
            </div>
          </>
        ) : null}

        {job && job.status === "failed" && job.error && (
          <div className="border border-red-500/30 bg-red-500/10 rounded-xl p-4">
            <h2 className="text-sm font-semibold text-red-600 dark:text-red-400 mb-2">
              Run failed
            </h2>
            <pre className="text-xs font-mono text-red-700 dark:text-red-300 whitespace-pre-wrap break-words">
              {job.error}
            </pre>
          </div>
        )}
      </div>
    </AppLayout>
  );
}

function EvaluatorResultsPane({
  evaluators,
  evaluatorNamesById,
  runs,
  versionLabels,
  jobStatus,
  humanAgreementForItem,
  evaluatorVariablesByEvaluatorId,
  filterDisagreements,
}: {
  evaluators: {
    evaluator_id: string;
    evaluator_version_id?: string;
    name?: string;
  }[];
  evaluatorNamesById: Record<string, string>;
  runs: EvaluatorRunRow[];
  versionLabels: Record<string, string>;
  jobStatus: EvaluatorRunJob["status"];
  humanAgreementForItem: HumanAgreementItem | null;
  evaluatorVariablesByEvaluatorId: Record<string, Record<string, string>>;
  filterDisagreements: boolean;
}) {
  const [selectionByEvaluator, setSelectionByEvaluator] = useState<
    Record<string, string>
  >({});

  if (evaluators.length === 0) {
    return (
      <div className="border border-border rounded-xl p-4 text-sm text-muted-foreground">
        No evaluators in this run.
      </div>
    );
  }

  const visibleEvaluators = filterDisagreements
    ? evaluators.filter((ev) => {
        const humansForEv = humanAgreementForItem?.evaluators.find(
          (e) => e.evaluator_id === ev.evaluator_id,
        );
        return (
          !!humansForEv &&
          humansForEv.human_annotations.length > 0 &&
          humansForEv.agreement !== null &&
          humansForEv.agreement !== 1
        );
      })
    : evaluators;

  if (filterDisagreements && visibleEvaluators.length === 0) {
    return (
      <div className="border border-border rounded-xl p-4 text-sm text-muted-foreground">
        All evaluators agree with human annotations on this item.
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {visibleEvaluators.map((ev) => {
        const versionLabel = ev.evaluator_version_id
          ? versionLabels[ev.evaluator_version_id]
          : null;
        const r = runs.find(
          (x) =>
            x.evaluator_id === ev.evaluator_id &&
            (!ev.evaluator_version_id ||
              x.evaluator_version_id === ev.evaluator_version_id),
        );
        const displayName = evaluatorDisplayName(ev, evaluatorNamesById, r);
        const reasoning =
          typeof r?.value?.reasoning === "string"
            ? (r.value.reasoning as string)
            : null;

        let match: boolean | null = null;
        let score: number | null = null;
        let outputType: "binary" | "rating" = "binary";

        if (r) {
          const v = r.value?.value;
          if (typeof v === "boolean") {
            outputType = "binary";
            match = v;
          } else if (typeof v === "number") {
            outputType = "rating";
            score = v;
          }
        }

        const stillRunning =
          !r && (jobStatus === "in_progress" || jobStatus === "queued");
        if (stillRunning) {
          return (
            <div
              key={`${ev.evaluator_id}-${ev.evaluator_version_id ?? ""}`}
              className="border border-border rounded-xl p-4 space-y-2"
            >
              <div className="flex items-center gap-2 flex-wrap min-w-0">
                <h3 className="text-sm font-semibold">
                  {displayName}
                </h3>
                {versionLabel && (
                  <span className="font-mono text-[10px] px-1.5 py-0.5 rounded-md border border-border bg-muted/40 text-muted-foreground">
                    {versionLabel}
                  </span>
                )}
              </div>
              <div className="flex items-center gap-3 py-1">
                <svg
                  className="w-5 h-5 animate-spin text-muted-foreground"
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
                  />
                  <path
                    className="opacity-75"
                    fill="currentColor"
                    d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                  />
                </svg>
                <p className="text-sm text-muted-foreground">
                  Running evaluator
                </p>
              </div>
            </div>
          );
        }

        const evaluatorName = displayName;

        // Job is done (or failed) but no row exists for this item — that's
        // a real error state now that the backend always populates runs[].
        if (!r) {
          return (
            <div
              key={`${ev.evaluator_id}-${ev.evaluator_version_id ?? ""}`}
              className="border border-red-500/30 bg-red-500/5 rounded-xl p-4 space-y-1.5"
            >
              <div className="flex items-center gap-2 flex-wrap min-w-0">
                <h3 className="text-sm font-semibold">
                  {evaluatorName}
                </h3>
                {versionLabel && (
                  <span className="font-mono text-[10px] px-1.5 py-0.5 rounded-md border border-foreground/20 bg-background text-foreground">
                    {versionLabel}
                  </span>
                )}
              </div>
              <p className="text-xs text-red-600 dark:text-red-400">
                No result recorded for this item.
              </p>
            </div>
          );
        }

        const humansForEvaluator =
          humanAgreementForItem?.evaluators.find(
            (e) => e.evaluator_id === ev.evaluator_id,
          ) ?? null;
        const annotations =
          jobStatus === "completed"
            ? (humansForEvaluator?.human_annotations ?? [])
            : [];
        const hasHumans = annotations.length > 0;

        const rawSelection =
          selectionByEvaluator[ev.evaluator_id] ?? "evaluator";
        const selectedAnnotation =
          rawSelection !== "evaluator"
            ? annotations.find((a) => a.annotator_id === rawSelection)
            : undefined;
        const showHuman = !!selectedAnnotation;
        // If a stored annotator_id has no annotation on this item, fall back
        // to "evaluator" so the pill row reflects what's actually rendered.
        const selection: string =
          rawSelection === "evaluator" || selectedAnnotation
            ? rawSelection
            : "evaluator";

        const setSelection = (sel: string) =>
          setSelectionByEvaluator((prev) => ({
            ...prev,
            [ev.evaluator_id]: sel,
          }));

        const scaleMin =
          typeof r.evaluator_version?.scale_min === "number"
            ? r.evaluator_version.scale_min
            : undefined;
        const scaleMax =
          typeof r.evaluator_version?.scale_max === "number"
            ? r.evaluator_version.scale_max
            : undefined;

        let displayMatch: boolean | null = match;
        let displayScore: number | null = score;
        let displayReasoning: string | null = reasoning;

        if (showHuman && selectedAnnotation) {
          const v = selectedAnnotation.value?.value;
          displayMatch = null;
          displayScore = null;
          if (outputType === "binary" && typeof v === "boolean") {
            displayMatch = v;
          } else if (outputType === "rating" && typeof v === "number") {
            displayScore = v;
          }
          const topLevelReasoning =
            typeof selectedAnnotation.reasoning === "string"
              ? selectedAnnotation.reasoning
              : null;
          const nestedReasoning =
            typeof selectedAnnotation.value?.reasoning === "string"
              ? (selectedAnnotation.value.reasoning as string)
              : null;
          const raw = topLevelReasoning ?? nestedReasoning;
          displayReasoning = raw && raw.trim().length > 0 ? raw : null;
        }

        return (
          <div
            key={`${ev.evaluator_id}-${ev.evaluator_version_id ?? ""}`}
            className="space-y-2"
          >
            {hasHumans && (
              <div className="flex flex-wrap items-center gap-1.5">
                <AgreementGlyph
                  perfect={humansForEvaluator?.agreement === 1}
                  agreement={humansForEvaluator?.agreement ?? null}
                  pairCount={humansForEvaluator?.pair_count ?? 0}
                />
                <SourcePill
                  selected={selection === "evaluator"}
                  onClick={() => setSelection("evaluator")}
                  primaryLabel="Evaluator"
                />
                {annotations.map((a) => {
                  const aligned = isAnnotationAligned(
                    a.value?.value,
                    r.value?.value,
                    outputType,
                  );
                  return (
                    <SourcePill
                      key={a.annotation_id}
                      primaryLabel={annotatorDisplayName(a)}
                      selected={selection === a.annotator_id}
                      onClick={() => setSelection(a.annotator_id)}
                      tone={aligned ? "aligned" : "misaligned"}
                    />
                  );
                })}
              </div>
            )}
            <EvaluatorVerdictCard
              mode="read"
              name={evaluatorName}
              description={r.evaluator?.description ?? null}
              versionLabel={versionLabel}
              outputType={outputType}
              evaluatorUuid={ev.evaluator_id}
              enableLink
              variableValues={
                evaluatorVariablesByEvaluatorId[ev.evaluator_id] ?? null
              }
              match={displayMatch}
              score={displayScore}
              scaleMin={scaleMin}
              scaleMax={scaleMax}
              reasoning={displayReasoning}
            />
          </div>
        );
      })}
    </div>
  );
}

function isAnnotationAligned(
  humanVal: unknown,
  machineVal: unknown,
  outputType: "binary" | "rating",
): boolean {
  if (outputType === "binary") {
    return (
      typeof humanVal === "boolean" &&
      typeof machineVal === "boolean" &&
      humanVal === machineVal
    );
  }
  return (
    typeof humanVal === "number" &&
    typeof machineVal === "number" &&
    humanVal === machineVal
  );
}

function AgreementGlyph({
  perfect,
  agreement,
  pairCount,
}: {
  perfect: boolean;
  agreement: number | null;
  pairCount: number;
}) {
  const tooltip =
    agreement == null
      ? "No comparisons"
      : `Agreement ${formatAgreement(agreement)} · ${pairCount} comparison${pairCount === 1 ? "" : "s"}`;
  if (perfect) {
    return (
      <span
        title={tooltip}
        className="inline-flex items-center justify-center w-5 h-5 rounded-full text-green-600 dark:text-green-400"
        aria-label="Annotators agree with evaluator"
      >
        <svg
          className="w-4 h-4"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          strokeWidth={3}
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M5 13l4 4L19 7"
          />
        </svg>
      </span>
    );
  }
  return (
    <span
      title={tooltip}
      className="inline-flex items-center justify-center w-5 h-5 rounded-full text-red-600 dark:text-red-400"
      aria-label="At least one annotator disagrees with evaluator"
    >
      <svg
        className="w-4 h-4"
        fill="none"
        viewBox="0 0 24 24"
        stroke="currentColor"
        strokeWidth={3}
      >
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          d="M6 18L18 6M6 6l12 12"
        />
      </svg>
    </span>
  );
}

function SourcePill({
  primaryLabel,
  monoSuffix,
  selected,
  onClick,
  tone,
}: {
  primaryLabel: string;
  monoSuffix?: string | null;
  selected: boolean;
  onClick: () => void;
  tone?: "aligned" | "misaligned";
}) {
  let labelToneClass = "";
  if (!selected && tone === "aligned") {
    labelToneClass = "text-green-700 dark:text-green-400";
  } else if (!selected && tone === "misaligned") {
    labelToneClass = "text-red-700 dark:text-red-400";
  }
  return (
    <button
      type="button"
      onClick={onClick}
      className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-xs font-medium border transition-colors cursor-pointer ${
        selected
          ? "border-foreground bg-foreground text-background"
          : "border-border bg-muted/40 hover:bg-muted hover:border-foreground/30"
      } ${selected ? "" : "text-foreground"}`}
    >
      <span className={`truncate max-w-[160px] ${labelToneClass}`}>
        {primaryLabel}
      </span>
      {monoSuffix && (
        <span
          className={`font-mono text-[11px] ${selected ? "text-background/70" : "text-muted-foreground"}`}
        >
          {monoSuffix}
        </span>
      )}
    </button>
  );
}

function HumanAgreementSummary({
  jobStatus,
  agreement,
  evaluators,
  evaluatorNamesById,
  versionLabels,
}: {
  jobStatus: EvaluatorRunJob["status"];
  agreement: HumanAgreement | undefined;
  evaluators: {
    evaluator_id: string;
    evaluator_version_id?: string;
    name?: string;
  }[];
  evaluatorNamesById: Record<string, string>;
  versionLabels: Record<string, string>;
}) {
  if (jobStatus !== "completed") return null;
  if (!agreement || agreement.evaluators.length === 0) return null;

  const allNull = agreement.evaluators.every((e) => e.agreement === null);
  const noItems = agreement.items.length === 0;

  if (allNull && noItems) {
    return (
      <div className="rounded-xl border border-blue-200 bg-blue-50 px-4 py-3 text-sm text-blue-900 dark:border-blue-500/30 dark:bg-blue-500/10 dark:text-blue-200 flex items-start gap-2">
        <svg
          className="w-4 h-4 mt-0.5 shrink-0"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          strokeWidth={2}
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M13 16h-1v-4h-1m1-4h.01M12 2a10 10 0 100 20 10 10 0 000-20z"
          />
        </svg>
        <span>
          No human labels found on the items in this run yet. Once labelled,
          each evaluator&apos;s alignment with humans will be shown.
        </span>
      </div>
    );
  }

  const agreementById = new Map(
    agreement.evaluators.map((e) => [e.evaluator_id, e]),
  );

  return (
    <div className="space-y-2">
      <div>
        <h2 className="text-sm font-semibold">Human agreement</h2>
        <p className="text-xs text-muted-foreground max-w-2xl mt-1">
          How closely each evaluator&apos;s outputs in this run match the human
          annotations on the same items
        </p>
      </div>
      <div className="flex items-stretch gap-3 overflow-x-auto pb-1">
        {evaluators.map((ev) => {
          const row = agreementById.get(ev.evaluator_id);
          if (!row) return null;
          const name = evaluatorDisplayName(ev, evaluatorNamesById);
          const version = row.evaluator_version_id
            ? (versionLabels[row.evaluator_version_id] ?? null)
            : ev.evaluator_version_id
              ? (versionLabels[ev.evaluator_version_id] ?? null)
              : null;
          return (
            <AgreementStatCard
              key={`${ev.evaluator_id}-${ev.evaluator_version_id ?? ""}`}
              evaluatorPill={{
                href: `/evaluators/${ev.evaluator_id}`,
                name,
                versionLabel: version,
              }}
              value={
                row.agreement != null
                  ? `${Math.round(row.agreement * 100)}%`
                  : "—"
              }
              valueClassName={agreementColor(row.agreement)}
            />
          );
        })}
      </div>
    </div>
  );
}
