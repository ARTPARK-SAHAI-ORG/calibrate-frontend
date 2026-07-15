import type { TtsLabellingRow } from "./AddRunToLabellingTaskDialog";

// Pure mapping from TTS evaluation provider-results to "Submit for labelling"
// rows. Kept out of the page component so the key-vs-URL contract is unit
// testable: labelling items MUST carry the audio STORAGE KEY (`audio_s3_path`),
// never the playback/download `audio_path` — the evaluator rejects playback
// URLs. A row is eligible only when it has a non-empty storage key.

type ProviderResultsLike = {
  provider: string;
  results?: Array<Record<string, unknown>> | null;
};

/**
 * The audio storage key for a row (the `audio_s3_path` field the backend
 * supplies alongside the playback `audio_path`), trimmed. Empty string when
 * absent — a bare key is accepted as-is (no `s3://` prefix is required; the
 * backend normalises both).
 */
export function ttsRowAudioKey(r: Record<string, unknown>): string {
  return typeof r.audio_s3_path === "string" ? r.audio_s3_path.trim() : "";
}

/** True when the row has a synthesized clip with a usable storage key. */
export function isTtsRowLabellingEligible(r: Record<string, unknown>): boolean {
  return ttsRowAudioKey(r) !== "";
}

/** Count of rows across all providers that are eligible to be labelled. */
export function countTtsLabellingEligible(
  providerResults: ProviderResultsLike[],
): number {
  let count = 0;
  for (const pr of providerResults) {
    for (const r of pr.results ?? []) {
      if (isTtsRowLabellingEligible(r)) count += 1;
    }
  }
  return count;
}

/**
 * Build the labelling rows for the SELECTED, eligible result rows. `selected`
 * holds `${provider}:${index}` keys (index into that provider's results, the
 * same keys the table toggles). Names include provider + index + a run-id
 * suffix so they stay unique within a task. `audio_path` carries the storage
 * key, not the playback URL.
 */
export function buildTtsLabellingRows(
  providerResults: ProviderResultsLike[],
  selected: Set<string>,
  runIdSuffix: string,
  getProviderLabel: (value: string) => string,
): TtsLabellingRow[] {
  const rows: TtsLabellingRow[] = [];
  for (const pr of providerResults) {
    const providerLabel = getProviderLabel(pr.provider);
    (pr.results ?? []).forEach((r, i) => {
      const audioKey = ttsRowAudioKey(r);
      if (audioKey === "") return;
      if (!selected.has(`${pr.provider}:${i}`)) return;
      rows.push({
        name: `${providerLabel} #${i + 1} — ${runIdSuffix}`,
        text: typeof r.text === "string" ? r.text : "",
        audio_path: audioKey,
      });
    });
  }
  return rows;
}
