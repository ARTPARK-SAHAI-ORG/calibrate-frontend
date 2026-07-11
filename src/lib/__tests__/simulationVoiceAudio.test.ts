import {
  audioUrlsUseLegacyPerRoleTurnIndexing,
  getVoiceSimulationAudioLayout,
  getVoiceSimulationAudioUrlForEntry,
  type VoiceAudioTranscriptEntry,
} from "@/lib/simulationVoiceAudio";

describe("audioUrlsUseLegacyPerRoleTurnIndexing", () => {
  it("returns false for an empty list", () => {
    expect(audioUrlsUseLegacyPerRoleTurnIndexing([])).toBe(false);
  });

  it("returns false when each turn number appears for only one role", () => {
    const urls = ["a/1_user.wav", "a/2_bot.wav", "a/3_user.wav"];
    expect(audioUrlsUseLegacyPerRoleTurnIndexing(urls)).toBe(false);
  });

  it("returns true when a turn number appears as both user and bot", () => {
    const urls = ["a/1_user.wav", "a/1_bot.wav"];
    expect(audioUrlsUseLegacyPerRoleTurnIndexing(urls)).toBe(true);
  });

  it("ignores urls that don't match the pattern", () => {
    const urls = ["a/notaturn.wav", "a/1_user.wav"];
    expect(audioUrlsUseLegacyPerRoleTurnIndexing(urls)).toBe(false);
  });

  it("is case-insensitive on role", () => {
    const urls = ["a/1_USER.wav", "a/1_BOT.wav"];
    expect(audioUrlsUseLegacyPerRoleTurnIndexing(urls)).toBe(true);
  });
});

describe("getVoiceSimulationAudioLayout", () => {
  it("returns unified when audioUrls is undefined or empty", () => {
    expect(getVoiceSimulationAudioLayout(undefined)).toBe("unified");
    expect(getVoiceSimulationAudioLayout([])).toBe("unified");
  });

  it("returns legacy when urls collide per turn", () => {
    expect(getVoiceSimulationAudioLayout(["a/1_user.wav", "a/1_bot.wav"])).toBe(
      "legacy",
    );
  });

  it("returns unified when urls don't collide", () => {
    expect(getVoiceSimulationAudioLayout(["a/1_user.wav", "a/2_bot.wav"])).toBe(
      "unified",
    );
  });
});

describe("getVoiceSimulationAudioUrlForEntry", () => {
  const transcript: VoiceAudioTranscriptEntry[] = [
    { role: "user" },
    { role: "assistant" },
    { role: "user" },
    { role: "assistant", tool_calls: [{ id: "x" }] },
    { role: "tool" },
  ];

  it("returns null when audioUrls is undefined or empty", () => {
    expect(
      getVoiceSimulationAudioUrlForEntry(transcript[0], 0, undefined, transcript, "unified"),
    ).toBeNull();
    expect(
      getVoiceSimulationAudioUrlForEntry(transcript[0], 0, [], transcript, "unified"),
    ).toBeNull();
  });

  it("returns null for tool-role entries", () => {
    const urls = ["a/1_user.wav"];
    expect(
      getVoiceSimulationAudioUrlForEntry(transcript[4], 4, urls, transcript, "unified"),
    ).toBeNull();
  });

  it("returns null for entries with tool_calls", () => {
    const urls = ["a/1_bot.wav"];
    expect(
      getVoiceSimulationAudioUrlForEntry(transcript[3], 3, urls, transcript, "unified"),
    ).toBeNull();
  });

  it("matches unified layout using spoken-turn count across roles", () => {
    const urls = ["a/1_user.wav", "a/2_bot.wav", "a/3_user.wav"];
    // entryIndex 2 is the second user message; spokenTurnCount before it = 2
    // (index0 user, index1 assistant) -> pattern 3_user.wav
    expect(
      getVoiceSimulationAudioUrlForEntry(transcript[2], 2, urls, transcript, "unified"),
    ).toBe("a/3_user.wav");
  });

  it("matches legacy layout using per-role count", () => {
    const urls = ["a/1_user.wav", "a/1_bot.wav", "a/2_user.wav"];
    // entryIndex 2 is the second user; legacy userCount before it = 1 -> pattern 2_user.wav
    expect(
      getVoiceSimulationAudioUrlForEntry(transcript[2], 2, urls, transcript, "legacy"),
    ).toBe("a/2_user.wav");
  });

  it("matches assistant entries in legacy layout by per-role count", () => {
    const urls = ["a/1_user.wav", "a/1_bot.wav"];
    expect(
      getVoiceSimulationAudioUrlForEntry(transcript[1], 1, urls, transcript, "legacy"),
    ).toBe("a/1_bot.wav");
  });

  it("matches assistant entries in unified layout by spoken-turn count", () => {
    const urls = ["a/1_user.wav", "a/2_bot.wav"];
    // entryIndex 1 is the first assistant message; spokenTurnCount before it = 1
    // (index0 user) -> pattern 2_bot.wav
    expect(
      getVoiceSimulationAudioUrlForEntry(transcript[1], 1, urls, transcript, "unified"),
    ).toBe("a/2_bot.wav");
  });

  it("returns null when no url matches the computed pattern", () => {
    const urls = ["a/99_user.wav"];
    expect(
      getVoiceSimulationAudioUrlForEntry(transcript[0], 0, urls, transcript, "unified"),
    ).toBeNull();
  });

  it("returns null for a role that is neither user nor assistant", () => {
    const entry: VoiceAudioTranscriptEntry = { role: "system" };
    const urls = ["a/1_user.wav"];
    expect(
      getVoiceSimulationAudioUrlForEntry(entry, 0, urls, [entry], "unified"),
    ).toBeNull();
  });

  it("skips undefined transcript entries when counting turns", () => {
    const sparse: VoiceAudioTranscriptEntry[] = [transcript[0]];
    const urls = ["a/1_user.wav"];
    // entryIndex beyond array length: filteredTranscript[i] is undefined for i>=1
    expect(
      getVoiceSimulationAudioUrlForEntry(
        { role: "user" },
        1,
        urls,
        sparse,
        "unified",
      ),
    ).toBe(null);
  });
});
