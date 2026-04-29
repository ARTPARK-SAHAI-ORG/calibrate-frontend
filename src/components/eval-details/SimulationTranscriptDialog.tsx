import React, { useMemo } from "react";
import type { SimulationResult } from "./SimulationResultsTable";
import { getVoiceSimulationAudioLayout, getVoiceSimulationAudioUrlForEntry } from "@/lib/simulationVoiceAudio";

type SimulationTranscriptDialogProps = {
  simulation: SimulationResult;
  runType: "text" | "voice";
  onClose: () => void;
  onAudioError?: () => void;
};

export function SimulationTranscriptDialog({ simulation, runType, onClose, onAudioError }: SimulationTranscriptDialogProps) {
  const fullTranscript = simulation.transcript ?? [];
  const voiceAudioLayout = useMemo(
    () => getVoiceSimulationAudioLayout(simulation.audio_urls),
    [simulation.audio_urls],
  );
  const filteredTranscript = fullTranscript.filter((entry) => {
    if (entry.role === "end_reason") return false;
    if (entry.role === "tool") {
      try {
        const parsed = JSON.parse(entry.content || "");
        return parsed?.type === "webhook_response";
      } catch { return false; }
    }
    return true;
  });
  const lastEntry = fullTranscript[fullTranscript.length - 1];
  const endedDueToMaxTurns = lastEntry?.role === "end_reason" && lastEntry?.content === "max_turns";

  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={onClose} />
      <div className="relative w-full md:w-[40%] md:min-w-[500px] bg-background border-l border-border flex flex-col h-full shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between px-4 md:px-6 py-4">
          <div className="flex items-center gap-3">
            <svg className="w-5 h-5 text-muted-foreground" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M8.625 12a.375.375 0 11-.75 0 .375.375 0 01.75 0zm0 0H8.25m4.125 0a.375.375 0 11-.75 0 .375.375 0 01.75 0zm0 0H12m4.125 0a.375.375 0 11-.75 0 .375.375 0 01.75 0zm0 0h-.375M21 12c0 4.556-4.03 8.25-9 8.25a9.764 9.764 0 01-2.555-.337A5.972 5.972 0 015.41 20.97a5.969 5.969 0 01-.474-.065 4.48 4.48 0 00.978-2.025c.09-.457-.133-.901-.467-1.226C3.93 16.178 3 14.189 3 12c0-4.556 4.03-8.25 9-8.25s9 3.694 9 8.25z" />
            </svg>
            <h2 className="text-base md:text-lg font-semibold">Transcript</h2>
          </div>
          <button onClick={onClose} className="flex items-center justify-center w-8 h-8 rounded-md hover:bg-muted transition-colors cursor-pointer">
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Full Conversation Audio Player */}
        {simulation.conversation_wav_url && (
          <div className="px-4 md:px-6 pb-4 border-b border-border">
            <div className="flex items-center gap-2 mb-2">
              <span className="text-sm font-medium text-foreground">Hear the full conversation</span>
            </div>
            <audio key={simulation.conversation_wav_url} controls className="w-full h-10" src={simulation.conversation_wav_url} onError={onAudioError}>
              Your browser does not support the audio element.
            </audio>
          </div>
        )}

        {/* Transcript content */}
        <div className="flex-1 overflow-y-auto p-4 md:p-6">
          <div className="space-y-4">
            {filteredTranscript.length === 0 ? (
              <div className="flex items-center justify-center py-8">
                <p className="text-sm text-muted-foreground">No transcript available yet</p>
              </div>
            ) : (
              filteredTranscript.map((entry, index) => {
                const audioUrl =
                  runType === "voice"
                    ? getVoiceSimulationAudioUrlForEntry(
                        entry,
                        index,
                        simulation.audio_urls,
                        filteredTranscript,
                        voiceAudioLayout,
                      )
                    : null;
                return (
                  <div key={index} className={`space-y-2 ${entry.role === "user" ? "flex flex-col items-end" : ""}`}>
                    {entry.role === "assistant" && (
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-medium text-foreground">
                          {entry.tool_calls ? "Agent Tool Call" : "Agent"}
                        </span>
                      </div>
                    )}

                    {audioUrl && (
                      <div className="w-full md:w-1/2">
                        <audio key={audioUrl} controls className="w-full h-8 mb-2" src={audioUrl} onError={onAudioError}>
                          Your browser does not support the audio element.
                        </audio>
                      </div>
                    )}

                    {entry.role === "user" && entry.content && (
                      <div className="w-full md:w-1/2">
                        <div className="px-4 py-3 rounded-xl text-sm text-foreground bg-muted border border-border whitespace-pre-wrap">
                          {entry.content}
                        </div>
                      </div>
                    )}

                    {entry.role === "assistant" && entry.content && !entry.tool_calls && (
                      <div className="w-full md:w-1/2">
                        <div className="px-4 py-3 rounded-xl text-sm text-foreground bg-accent border border-border whitespace-pre-wrap">
                          {entry.content}
                        </div>
                      </div>
                    )}

                    {entry.role === "assistant" && entry.tool_calls && (
                      <div className="w-full md:w-1/2">
                        {entry.tool_calls.map((toolCall: any, toolIndex: number) => {
                          let parsedArgs: Record<string, any> = {};
                          try { parsedArgs = JSON.parse(toolCall.function.arguments); } catch { parsedArgs = {}; }
                          const formatValue = (val: any): string => {
                            if (val === null) return "null";
                            if (val === undefined) return "undefined";
                            if (typeof val === "object") { try { return JSON.stringify(val, null, 2); } catch { return String(val); } }
                            return String(val);
                          };
                          return (
                            <div key={toolIndex} className="bg-muted border border-border rounded-2xl p-4 mb-2">
                              <div className="flex items-center gap-2 mb-2">
                                <svg className="w-4 h-4 text-muted-foreground" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                                  <path strokeLinecap="round" strokeLinejoin="round" d="M11.42 15.17L17.25 21A2.652 2.652 0 0021 17.25l-5.877-5.877M11.42 15.17l2.496-3.03c.317-.384.74-.626 1.208-.766M11.42 15.17l-4.655 5.653a2.548 2.548 0 11-3.586-3.586l6.837-5.63m5.108-.233c.55-.164 1.163-.188 1.743-.14a4.5 4.5 0 004.486-6.336l-3.276 3.277a3.004 3.004 0 01-2.25-2.25l3.276-3.276a4.5 4.5 0 00-6.336 4.486c.091 1.076-.071 2.264-.904 2.95l-.102.085m-1.745 1.437L5.909 7.5H4.5L2.25 3.75l1.5-1.5L7.5 4.5v1.409l4.26 4.26m-1.745 1.437l1.745-1.437m6.615 8.206L15.75 15.75M4.867 19.125h.008v.008h-.008v-.008z" />
                                </svg>
                                <span className="text-sm font-medium text-foreground">{toolCall.function.name}</span>
                              </div>
                              {Object.keys(parsedArgs).filter((k) => k !== "headers").length > 0 && (
                                <div className="space-y-3 mt-3">
                                  {Object.entries(parsedArgs).filter(([key]) => key !== "headers").map(([key, value], paramIndex) => {
                                    const displayValue = formatValue(value);
                                    const isMultiLine = displayValue.includes("\n");
                                    return (
                                      <div key={paramIndex}>
                                        <label className="block text-sm font-medium text-foreground mb-1.5">{key}</label>
                                        <div className={`px-3 py-2 bg-background border border-border rounded-lg text-sm text-muted-foreground whitespace-pre-wrap break-all ${isMultiLine ? "font-mono text-xs" : ""}`}>
                                          {displayValue}
                                        </div>
                                      </div>
                                    );
                                  })}
                                </div>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    )}

                    {entry.role === "tool" && entry.content && (() => {
                      let parsed: any = null;
                      try { parsed = JSON.parse(entry.content); } catch { return null; }
                      if (parsed?.type !== "webhook_response") return null;
                      const response = parsed.response;
                      if (!response || typeof response !== "object") return null;
                      const isError = parsed.status === "error";
                      const jsonString = JSON.stringify(response, null, 2);
                      return (
                        <div className="w-full md:w-1/2">
                          <div className="flex items-center gap-2 mb-2">
                            {isError ? (
                              <>
                                <svg className="w-4 h-4 text-red-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                                </svg>
                                <span className="text-sm font-medium text-red-500">Tool Response Error</span>
                              </>
                            ) : (
                              <span className="text-sm font-medium text-foreground">Agent Tool Response</span>
                            )}
                          </div>
                          <div className={`bg-muted rounded-2xl p-4 border ${isError ? "border-red-500" : "border-border"}`}>
                            <pre className={`text-sm font-mono whitespace-pre-wrap break-all ${isError ? "text-red-400" : "text-foreground"}`}>{jsonString}</pre>
                          </div>
                        </div>
                      );
                    })()}
                  </div>
                );
              })
            )}

            {endedDueToMaxTurns && (
              <div className="flex items-center justify-center py-4 mt-2">
                <div className="flex items-center gap-2 px-4 py-2 rounded-lg bg-yellow-500/10 border border-yellow-500/30">
                  <svg className="w-4 h-4 shrink-0 text-amber-900 dark:text-amber-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m9-.75a9 9 0 11-18 0 9 9 0 0118 0zm-9 3.75h.008v.008H12v-.008z" />
                  </svg>
                  <span className="text-sm font-medium text-foreground">Maximum number of assistant turns reached</span>
                </div>
              </div>
            )}

            {simulation.aborted && (
              <div className="flex items-center justify-center py-4 mt-2">
                <div className="flex items-center gap-2 px-4 py-2 rounded-lg bg-red-500/10 border border-red-500/30">
                  <svg className="w-4 h-4 text-red-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m9-.75a9 9 0 11-18 0 9 9 0 0118 0zm-9 3.75h.008v.008H12v-.008z" />
                  </svg>
                  <span className="text-sm text-red-500">Simulation aborted by user</span>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
