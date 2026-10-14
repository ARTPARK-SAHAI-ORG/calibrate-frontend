import type { ExportColumn } from "@/components/ExportResultsButton";
import type { ExportZipContents } from "@/components/ExportZipButton";
import { audioFileExtension } from "@/lib/audioExport";
import {
  readEvaluatorCell,
  type EvaluatorColumnLike,
} from "./EvaluatorScoreCell";
import { hasSarvamMetrics, hasSemanticWerMetric } from "./EvaluationRunDetails";
import { SARVAM_METRIC_FIELDS } from "./sarvamMetrics";

/**
 * The zip behind Export results on the speech-to-text and text-to-speech run
 * pages and their shared links. Each kind of run has one builder here, so the
 * signed-in page and the shared link cannot export different things.
 */

type ExportEvaluatorColumn = EvaluatorColumnLike & {
  label: string;
  outputType: "binary" | "rating";
};

type SpeechRun<Row> = {
  provider_results?: Array<{
    provider: string;
    metrics?: Record<string, unknown> | null;
    results?: Row[] | null;
  }> | null;
};

type SttRow = {
  id: string;
  audio_url?: string | null;
  gt: string;
  pred: string;
  [field: string]: unknown;
};

type TtsRow = {
  id: string;
  audio_path?: string | null;
  text: string;
  [field: string]: unknown;
};

/** One evaluator's score for a row as it goes in the CSV: "true" / "false"
 * for a pass-or-fail evaluator, the number for a rating, blank when missing. */
export function evaluatorCsvValue(
  row: object,
  column: ExportEvaluatorColumn,
): unknown {
  const { score, error } = readEvaluatorCell(
    row as Record<string, unknown>,
    column,
  );
  if (error || score === undefined) return "";
  if (column.outputType === "binary") {
    // Lowercase first so judges that emit "True"/"TRUE" still read as a pass,
    // the same as EvaluatorScoreCell on screen.
    const norm = score.toLowerCase();
    return norm === "true" || norm === "1" ? "true" : "false";
  }
  const n = parseFloat(score);
  return Number.isFinite(n) ? n : score;
}

function evaluatorHeaders(columns: ExportEvaluatorColumn[]): ExportColumn[] {
  return columns.map((c) => ({ key: c.key, header: c.label }));
}

function withEvaluatorValues(
  out: Record<string, unknown>,
  row: object,
  columns: ExportEvaluatorColumn[],
): Record<string, unknown> {
  for (const c of columns) out[c.key] = evaluatorCsvValue(row, c);
  return out;
}

/** Speech-to-text: one CSV row per provider and clip. Every provider
 * transcribed the same clip, so each clip goes in the zip once, named after
 * its row id. */
export function sttExportContents(
  run: SpeechRun<SttRow>,
  evaluatorColumns: ExportEvaluatorColumn[],
  providerLabel: (provider: string) => string,
): ExportZipContents {
  const semanticWer = hasSemanticWerMetric(run.provider_results);
  const sarvam = hasSarvamMetrics(run.provider_results);
  const columns: ExportColumn[] = [
    { key: "provider", header: "Provider" },
    { key: "audio_name", header: "Audio name" },
    { key: "reference_text", header: "Reference text" },
    { key: "predicted_text", header: "Predicted text" },
    { key: "wer", header: "WER" },
    { key: "cer", header: "CER" },
    ...(semanticWer ? [{ key: "semantic_wer", header: "Semantic WER" }] : []),
    ...(sarvam
      ? SARVAM_METRIC_FIELDS.map((f) => ({ key: f.csvKey, header: f.label }))
      : []),
    ...evaluatorHeaders(evaluatorColumns),
  ];
  const rows: Record<string, unknown>[] = [];
  const files = new Map<string, string>();
  for (const pr of run.provider_results ?? []) {
    for (const r of pr.results ?? []) {
      const audioName = r.audio_url
        ? `${r.id}.${audioFileExtension(r.audio_url)}`
        : "";
      if (r.audio_url) files.set(`audios/${audioName}`, r.audio_url);
      const out: Record<string, unknown> = {
        provider: providerLabel(pr.provider),
        audio_name: audioName,
        reference_text: r.gt,
        predicted_text: r.pred,
        wer: r.wer,
        cer: r.cer,
      };
      if (semanticWer) out.semantic_wer = r.semantic_wer ?? "";
      if (sarvam) {
        for (const f of SARVAM_METRIC_FIELDS) out[f.csvKey] = r[f.key] ?? "";
      }
      rows.push(withEvaluatorValues(out, r, evaluatorColumns));
    }
  }
  return {
    csv: { columns, rows },
    files: [...files].map(([path, url]) => ({ path, url })),
  };
}

/** Text-to-speech: one CSV row per provider and text, and each provider's
 * clip in the zip, named `<provider>_<row id>`. */
export function ttsExportContents(
  run: SpeechRun<TtsRow>,
  evaluatorColumns: ExportEvaluatorColumn[],
  providerLabel: (provider: string) => string,
): ExportZipContents {
  const columns: ExportColumn[] = [
    { key: "provider", header: "Provider" },
    { key: "audio_name", header: "Audio name" },
    { key: "text", header: "Text" },
    ...evaluatorHeaders(evaluatorColumns),
  ];
  const rows: Record<string, unknown>[] = [];
  const files: ExportZipContents["files"] = [];
  for (const pr of run.provider_results ?? []) {
    for (const r of pr.results ?? []) {
      const audioName = r.audio_path
        ? `${pr.provider}_${r.id}.${audioFileExtension(r.audio_path)}`
        : "";
      if (r.audio_path)
        files.push({ path: `audios/${audioName}`, url: r.audio_path });
      rows.push(
        withEvaluatorValues(
          {
            provider: providerLabel(pr.provider),
            audio_name: audioName,
            text: r.text,
          },
          r,
          evaluatorColumns,
        ),
      );
    }
  }
  return { csv: { columns, rows }, files };
}
