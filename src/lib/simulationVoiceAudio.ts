/** Legacy: same N can appear as both N_user and N_bot. New: each N appears at most once (N_user or N_bot). */
export type VoiceSimulationAudioLayout = "legacy" | "unified";

const TURN_AUDIO_FILENAME_RE = /(\d+)_(user|bot)\.wav/gi;

export type VoiceAudioTranscriptEntry = {
  role: string;
  tool_calls?: unknown[] | null;
};

/** True if any turn number N appears as both N_user and N_bot in the URL list (legacy layout). */
export function audioUrlsUseLegacyPerRoleTurnIndexing(audioUrls: string[]): boolean {
  const byTurn = new Map<number, Set<"user" | "bot">>();
  for (const url of audioUrls) {
    const re = new RegExp(TURN_AUDIO_FILENAME_RE.source, "gi");
    let m: RegExpExecArray | null;
    while ((m = re.exec(url)) !== null) {
      const n = parseInt(m[1], 10);
      const role = m[2].toLowerCase() as "user" | "bot";
      if (!byTurn.has(n)) byTurn.set(n, new Set());
      byTurn.get(n)!.add(role);
    }
  }
  for (const roles of byTurn.values()) {
    if (roles.has("user") && roles.has("bot")) return true;
  }
  return false;
}

export function getVoiceSimulationAudioLayout(
  audioUrls: string[] | undefined,
): VoiceSimulationAudioLayout {
  if (!audioUrls?.length) return "unified";
  return audioUrlsUseLegacyPerRoleTurnIndexing(audioUrls) ? "legacy" : "unified";
}

function findUrlForPattern(audioUrls: string[], pattern: string): string | null {
  return audioUrls.find((url) => url.includes(pattern)) ?? null;
}

export function getVoiceSimulationAudioUrlForEntry(
  entry: VoiceAudioTranscriptEntry,
  entryIndex: number,
  audioUrls: string[] | undefined,
  filteredTranscript: VoiceAudioTranscriptEntry[],
  layout: VoiceSimulationAudioLayout,
): string | null {
  if (!audioUrls?.length) return null;
  if (entry.role === "tool" || entry.tool_calls) return null;

  const legacy = layout === "legacy";

  let userCount = 0;
  let assistantCount = 0;
  let spokenTurnCount = 0;

  for (let i = 0; i < entryIndex; i++) {
    const msg = filteredTranscript[i];
    if (msg?.role === "user") {
      userCount++;
      spokenTurnCount++;
    } else if (msg?.role === "assistant" && !msg.tool_calls) {
      assistantCount++;
      spokenTurnCount++;
    }
  }

  let audioPattern: string | null = null;
  if (entry.role === "user") {
    audioPattern = legacy
      ? `${userCount + 1}_user.wav`
      : `${spokenTurnCount + 1}_user.wav`;
  } else if (entry.role === "assistant") {
    audioPattern = legacy
      ? `${assistantCount + 1}_bot.wav`
      : `${spokenTurnCount + 1}_bot.wav`;
  }

  if (!audioPattern) return null;
  return findUrlForPattern(audioUrls, audioPattern);
}
