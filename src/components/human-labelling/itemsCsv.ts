import type { ExportColumn } from "@/components/ExportResultsButton";
import type { MetadataEntry } from "@/components/ui";
import { textOf } from "@/lib/messageVersions";
import { actualToolCallsCell, toolCallsCell } from "./toolCallCells";

// Denormalized one-row-per-(item × linked evaluator) view from
// /annotation-tasks/{uuid}/summary. `annotators[]` provides the column
// order (union of every annotator with ≥1 annotation on the task);
// each `rows[i].annotations[annotator_uuid]` is that annotator's
// latest annotation for the slot, or null when they didn't label it.
//
// Per-row evaluator metadata (name, output_type, scale_min/max,
// version_number, is_live_version) was moved to the top-level
// `evaluators[]` block. The page looks each row's evaluator up by
// `evaluator_id` (and `evaluator_version_id` for version-specific
// fields).
export type SummaryAnnotator = { uuid: string; name: string };
export type SummaryEvaluator = {
  uuid: string;
  name: string;
  description?: string | null;
  output_type: "binary" | "rating";
  evaluator_type?: string;
  data_type?: string;
  live_version_id?: string | null;
  live_version_index?: number | null;
  versions?: {
    uuid: string;
    version_number: number;
    output_config?: {
      scale?: {
        value: boolean | number | string;
        name?: string | null;
        description?: string | null;
        color?: string | null;
      }[];
    } | null;
    scale_min?: number | null;
    scale_max?: number | null;
    is_live?: boolean;
  }[];
  run_count?: number;
};
export type SummaryAnnotation = {
  value: boolean | number | null;
  reasoning?: string | null;
};
export type SummaryRow = {
  item_id: string;
  payload: Record<string, unknown> | null;
  metadata?: MetadataEntry[] | null;
  evaluator_id: string;
  evaluator_version_id?: string | null;
  evaluator_value: boolean | number | null;
  evaluator_value_name?: string | null;
  evaluator_reasoning?: string | null;
  // Aggregate agreement scores in [0, 1] for this (item, evaluator) slot.
  // human_agreement: null when <2 annotators labelled the slot.
  // evaluator_agreement: null when no evaluator run / no annotators / types incomparable.
  human_agreement: number | null;
  evaluator_agreement: number | null;
  annotations: Record<string, SummaryAnnotation | null>;
};
export type TaskSummaryResponse = {
  task_id: string;
  task_type: "stt" | "tts" | "llm" | "llm-general" | "conversation";
  evaluators: SummaryEvaluator[];
  annotators: SummaryAnnotator[];
  rows: SummaryRow[];
  /** Sparse per-(item, annotator) free-text comments — the
   * `evaluator_id IS NULL` annotation slot. Items / annotators
   * without a non-empty comment don't appear. */
  item_comments?: { [item_id: string]: { [annotator_uuid: string]: string } };
  /** Item-level pagination metadata. `total` counts items in scope
   * (narrowed by `q` / `item_id`), not row count. */
  pagination?: {
    total: number;
    limit: number;
    offset: number;
  };
};

export function sanitizeCsvName(s: string): string {
  return s.replace(/[^A-Za-z0-9_-]+/g, "_").replace(/^_+|_+$/g, "") || "unnamed";
}

export function buildItemsCsv(
  items: { uuid: string; payload: unknown }[],
  taskSummary: TaskSummaryResponse | null,
  taskType: string | undefined,
): { columns: ExportColumn[]; rows: Record<string, unknown>[] } {
  const evaluators = taskSummary?.evaluators ?? [];
  const annotators = taskSummary?.annotators ?? [];

  // Each (item, evaluator, version) tuple gets its own row in the
  // summary response — keying without version_id would let later
  // versions silently overwrite earlier ones in the export.
  const rowByItemEvalVersion = new Map<string, SummaryRow>();
  const versionsByEval = new Map<string, Set<string | null>>();
  for (const row of taskSummary?.rows ?? []) {
    const vid = row.evaluator_version_id ?? null;
    rowByItemEvalVersion.set(
      `${row.item_id}::${row.evaluator_id}::${vid ?? "live"}`,
      row,
    );
    if (!versionsByEval.has(row.evaluator_id)) {
      versionsByEval.set(row.evaluator_id, new Set());
    }
    versionsByEval.get(row.evaluator_id)!.add(vid);
  }

  const versionNumberById = new Map<string, number>();
  for (const ev of evaluators) {
    for (const v of ev.versions ?? []) {
      versionNumberById.set(v.uuid, v.version_number);
    }
  }

  // For each evaluator, the list of version_ids (sorted by version_number
  // ascending) that actually appear in the summary rows. Evaluators with
  // no run data still get one entry (null → "live") so annotator columns
  // are emitted even when the evaluator hasn't run yet.
  const versionsForEvaluator = (ev: SummaryEvaluator): (string | null)[] => {
    const set = versionsByEval.get(ev.uuid);
    if (!set || set.size === 0) return [null];
    return [...set].sort((a, b) => {
      const an: number = (a ? versionNumberById.get(a) : undefined) ?? -Infinity;
      const bn: number = (b ? versionNumberById.get(b) : undefined) ?? -Infinity;
      return an - bn;
    });
  };

  const columns: ExportColumn[] = [{ key: "name", header: "name" }];
  if (taskType !== "stt" && taskType !== "tts") {
    columns.push({ key: "description", header: "description" });
  }
  if (taskType === "conversation") {
    columns.push({
      key: "conversation_history",
      header: "conversation_history",
    });
  } else if (taskType === "stt") {
    columns.push({
      key: "reference_transcript",
      header: "reference_transcript",
    });
    columns.push({
      key: "predicted_transcript",
      header: "predicted_transcript",
    });
  } else if (taskType === "tts") {
    columns.push({ key: "text", header: "text" });
    columns.push({ key: "audio_path", header: "audio_path" });
  } else if (taskType === "llm") {
    columns.push({
      key: "conversation_history",
      header: "conversation_history",
    });
    columns.push({ key: "agent_response", header: "agent_response" });
  } else if (taskType === "llm-general") {
    columns.push({ key: "input", header: "input" });
    columns.push({ key: "output", header: "output" });
  }
  if (taskType === "llm" || taskType === "llm-general") {
    columns.push({ key: "actual_tool_calls", header: "actual_tool_calls" });
    columns.push({ key: "expected_tool_calls", header: "expected_tool_calls" });
  }

  for (const ev of evaluators) {
    const evName = sanitizeCsvName(ev.name);
    // Annotator columns are emitted once per (annotator × evaluator) —
    // a human's label of an item against an evaluator doesn't depend on
    // which version of the evaluator ran.
    for (const ann of annotators) {
      const annName = sanitizeCsvName(ann.name);
      const base = `${annName}_${evName}`;
      columns.push({
        key: `ann_${ann.uuid}_${ev.uuid}_value`,
        header: `${base}/value`,
      });
      columns.push({
        key: `ann_${ann.uuid}_${ev.uuid}_reasoning`,
        header: `${base}/reasoning`,
      });
    }
    for (const vid of versionsForEvaluator(ev)) {
      const versionNumber = vid ? versionNumberById.get(vid) : undefined;
      const verStr = versionNumber != null ? `v${versionNumber}` : "live";
      columns.push({
        key: `ev_${ev.uuid}_${vid ?? "live"}_value`,
        header: `evaluator_${evName}_${verStr}/value`,
      });
      columns.push({
        key: `ev_${ev.uuid}_${vid ?? "live"}_reasoning`,
        header: `evaluator_${evName}_${verStr}/reasoning`,
      });
    }
  }

  // Item-level free-text comments — one column per annotator, not tied
  // to any evaluator (`evaluator_id IS NULL` slot). Placed after all
  // evaluator/annotator columns so the per-evaluator block stays
  // contiguous and downstream consumers don't have to special-case
  // mid-stream comment columns.
  for (const ann of annotators) {
    const annName = sanitizeCsvName(ann.name);
    columns.push({
      key: `ann_${ann.uuid}_comment`,
      header: `${annName}/comment`,
    });
  }

  const rows = items.map((item) => {
    const p = (item.payload ?? {}) as Record<string, unknown>;
    const out: Record<string, unknown> = {
      name: typeof p.name === "string" ? p.name : "",
    };
    if (taskType !== "stt" && taskType !== "tts") {
      out.description = typeof p.description === "string" ? p.description : "";
    }
    if (taskType === "conversation") {
      out.conversation_history = Array.isArray(p.transcript)
        ? JSON.stringify(p.transcript)
        : "";
    } else if (taskType === "stt") {
      out.reference_transcript =
        typeof p.reference_transcript === "string"
          ? p.reference_transcript
          : "";
      out.predicted_transcript =
        typeof p.predicted_transcript === "string"
          ? p.predicted_transcript
          : "";
    } else if (taskType === "tts") {
      out.text = typeof p.text === "string" ? p.text : "";
      out.audio_path = typeof p.audio_path === "string" ? p.audio_path : "";
    } else if (taskType === "llm") {
      out.conversation_history = Array.isArray(p.chat_history)
        ? JSON.stringify(p.chat_history)
        : "";
      out.agent_response = textOf(p.agent_response);
    } else if (taskType === "llm-general") {
      out.input = textOf(p.input);
      out.output = textOf(p.output);
    }
    if (taskType === "llm" || taskType === "llm-general") {
      out.actual_tool_calls = actualToolCallsCell(p);
      out.expected_tool_calls = toolCallsCell(p.expected_tool_calls);
    }

    for (const ev of evaluators) {
      const versionIds = versionsForEvaluator(ev);
      // Annotations don't vary by version; take whichever version's row
      // we find first that has a non-null annotation for each annotator.
      const annotationSourceByAnn = new Map<string, SummaryAnnotation>();
      for (const vid of versionIds) {
        const row = rowByItemEvalVersion.get(
          `${item.uuid}::${ev.uuid}::${vid ?? "live"}`,
        );
        if (!row) continue;
        for (const ann of annotators) {
          if (annotationSourceByAnn.has(ann.uuid)) continue;
          const a = row.annotations?.[ann.uuid];
          if (a && a.value !== null && a.value !== undefined) {
            annotationSourceByAnn.set(ann.uuid, a);
          }
        }
      }
      for (const ann of annotators) {
        const a = annotationSourceByAnn.get(ann.uuid) ?? null;
        out[`ann_${ann.uuid}_${ev.uuid}_value`] =
          a && a.value !== null && a.value !== undefined ? a.value : "";
        out[`ann_${ann.uuid}_${ev.uuid}_reasoning`] = a?.reasoning ?? "";
      }
      for (const vid of versionIds) {
        const row = rowByItemEvalVersion.get(
          `${item.uuid}::${ev.uuid}::${vid ?? "live"}`,
        );
        out[`ev_${ev.uuid}_${vid ?? "live"}_value`] =
          row?.evaluator_value_name ??
          (row?.evaluator_value !== null && row?.evaluator_value !== undefined
            ? row.evaluator_value
            : "");
        out[`ev_${ev.uuid}_${vid ?? "live"}_reasoning`] =
          row?.evaluator_reasoning ?? "";
      }
    }
    const commentsForItem = taskSummary?.item_comments?.[item.uuid];
    for (const ann of annotators) {
      out[`ann_${ann.uuid}_comment`] = commentsForItem?.[ann.uuid] ?? "";
    }
    return out;
  });

  return { columns, rows };
}

// Mirrors the backend's select-all rule: a case-insensitive substring of
// `payload.name`, so the kinds counted here are the items the action reaches.
export function selectedTaskItems<
  T extends { uuid: string; payload: unknown },
>(items: T[], pick: { q: string } | { ids: Set<string> }): T[] {
  if ("ids" in pick) return items.filter((it) => pick.ids.has(it.uuid));
  const needle = pick.q.trim().toLowerCase();
  if (!needle) return items;
  return items.filter((it) => {
    const name = (it.payload as { name?: unknown } | null)?.name;
    return typeof name === "string" && name.toLowerCase().includes(needle);
  });
}
