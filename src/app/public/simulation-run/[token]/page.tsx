"use client";

import React, { useState, useEffect } from "react";
import { useParams } from "next/navigation";
import { Tooltip } from "@/components/Tooltip";
import { PublicPageLayout, PublicNotFound, PublicLoading } from "@/components/PublicPageLayout";

type MetricData = { mean: number; std: number; values: number[] };
type Persona = { label: string; characteristics: string; gender: string; language: string };
type Scenario = { name: string; description: string };
type EvaluationResult = { name: string; value: number; reasoning: string };
type TranscriptEntry = { role: string; content?: string; tool_calls?: any[] | null; tool_call_id?: string };

type SimulationResult = {
  simulation_name: string;
  aborted?: boolean;
  persona: Persona;
  scenario: Scenario;
  evaluation_results: EvaluationResult[] | null;
  transcript?: TranscriptEntry[] | null;
  audio_urls?: string[];
  conversation_wav_url?: string;
};

type RunData = {
  task_id: string;
  name: string;
  status: string;
  type: "text" | "voice";
  updated_at: string;
  total_simulations: number;
  metrics: {
    tool_calls?: MetricData;
    answer_completeness?: MetricData;
    assistant_behavior?: MetricData;
    question_completeness?: MetricData;
    [key: string]: MetricData | undefined;
  } | null;
  simulation_results: SimulationResult[];
  error: string | null;
};

const LATENCY_KEYS = ["stt/ttft", "llm/ttft", "tts/ttft", "stt/processing_time", "llm/processing_time", "tts/processing_time"];

function getAudioUrlForEntry(
  entry: TranscriptEntry,
  entryIndex: number,
  audioUrls: string[] | undefined,
  filteredTranscript: TranscriptEntry[],
  runType: "text" | "voice",
): string | null {
  if (!audioUrls || runType !== "voice") return null;
  if (entry.role === "tool" || entry.tool_calls) return null;

  let userCount = 0;
  let assistantCount = 0;
  for (let i = 0; i < entryIndex; i++) {
    const msg = filteredTranscript[i];
    if (msg?.role === "user") userCount++;
    else if (msg?.role === "assistant" && !msg.tool_calls) assistantCount++;
  }

  let audioPattern: string;
  if (entry.role === "user") audioPattern = `${userCount + 1}_user.wav`;
  else if (entry.role === "assistant") audioPattern = `${assistantCount + 1}_bot.wav`;
  else return null;

  return audioUrls.find((url) => url.includes(audioPattern)) ?? null;
}

const getEvaluationResult = (sim: SimulationResult, key: string): number | null => {
  if (!sim.evaluation_results) return null;
  const mapped = key === "stt_llm_judge" ? "stt_llm_judge_score" : key;
  const found = sim.evaluation_results.find((r) => r.name === key || r.name === mapped);
  return found ? found.value : null;
};

const getEvaluationReasoning = (sim: SimulationResult, key: string): string | null => {
  if (!sim.evaluation_results) return null;
  const found = sim.evaluation_results.find((r) => r.name === key);
  return found?.reasoning ?? null;
};

export default function PublicSimulationRunPage() {
  const params = useParams();
  const token = params.token as string;

  const [data, setData] = useState<RunData | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [activeMetricsTab, setActiveMetricsTab] = useState<"performance" | "latency">("performance");
  const [selectedSim, setSelectedSim] = useState<SimulationResult | null>(null);

  useEffect(() => { document.title = "Simulation Run | Calibrate"; }, []);

  useEffect(() => {
    const fetchData = async () => {
      try {
        const backendUrl = process.env.NEXT_PUBLIC_BACKEND_URL;
        if (!backendUrl) throw new Error("Backend URL not configured");

        const res = await fetch(`${backendUrl}/public/simulation-run/${token}`, {
          headers: { accept: "application/json", "ngrok-skip-browser-warning": "true" },
        });

        if (res.status === 404) { setNotFound(true); return; }
        if (!res.ok) throw new Error("Failed to load results");

        const result: RunData = await res.json();
        if (result.status.toLowerCase() !== "done") { setNotFound(true); return; }

        setData(result);
      } catch {
        setNotFound(true);
      } finally {
        setIsLoading(false);
      }
    };
    fetchData();
  }, [token]);

  if (isLoading) return <PublicPageLayout><PublicLoading /></PublicPageLayout>;
  if (notFound || !data) return <PublicPageLayout><PublicNotFound /></PublicPageLayout>;

  const isTextType = data.type === "text";

  // Separate regular vs latency metrics
  const regularMetrics: Array<[string, MetricData]> = [];
  const latencyMetrics: Array<[string, MetricData]> = [];
  if (data.metrics) {
    Object.entries(data.metrics).forEach(([key, metric]) => {
      if (!metric) return;
      if (LATENCY_KEYS.includes(key)) latencyMetrics.push([key, metric]);
      else regularMetrics.push([key, metric]);
    });
  }

  // Derive metric keys for table columns
  const latencyMetricKeys = LATENCY_KEYS;
  let displayMetricKeys: string[] = [];
  if (data.metrics) {
    displayMetricKeys = Object.keys(data.metrics).filter((k) => !latencyMetricKeys.includes(k));
  } else {
    const metricSet = new Set<string>();
    data.simulation_results.forEach((sim) => {
      sim.evaluation_results?.forEach((r) => {
        if (!latencyMetricKeys.includes(r.name)) metricSet.add(r.name);
      });
    });
    displayMetricKeys = Array.from(metricSet);
  }

  return (
    <PublicPageLayout
      title={data.name}
      pills={
        <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-medium ${data.type === "voice" ? "bg-orange-100 text-orange-700 dark:bg-orange-500/20 dark:text-orange-400" : "bg-purple-100 text-purple-700 dark:bg-purple-500/20 dark:text-purple-400"}`}>
          {data.type}
        </span>
      }
    >
      <div className="space-y-6 md:space-y-8">

        {/* Overall Metrics */}
        {data.metrics && (regularMetrics.length > 0 || latencyMetrics.length > 0) && (
          <div>
            <h2 className="text-base md:text-lg font-semibold mb-3">Overall Metrics</h2>
            {!isTextType && (
              <div className="flex gap-2 border-b border-border mb-4">
                <button onClick={() => setActiveMetricsTab("performance")} className={`px-4 py-2 text-[13px] font-medium border-b-2 transition-colors cursor-pointer ${activeMetricsTab === "performance" ? "border-foreground text-foreground" : "border-transparent text-muted-foreground hover:text-foreground"}`}>Performance</button>
                <button onClick={() => setActiveMetricsTab("latency")} className={`px-4 py-2 text-[13px] font-medium border-b-2 transition-colors cursor-pointer ${activeMetricsTab === "latency" ? "border-foreground text-foreground" : "border-transparent text-muted-foreground hover:text-foreground"}`}>Latency</button>
              </div>
            )}
            {(isTextType || activeMetricsTab === "performance") && regularMetrics.length > 0 && (
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                {regularMetrics.map(([key, metric]) => (
                  <div key={key} className="border border-border rounded-xl p-4 bg-muted/10">
                    <div className="text-[12px] text-muted-foreground mb-1">{key}</div>
                    <div className="text-[18px] font-semibold text-foreground">{Math.round(metric.mean * 100)}%</div>
                  </div>
                ))}
              </div>
            )}
            {!isTextType && activeMetricsTab === "latency" && latencyMetrics.length > 0 && (
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                {latencyMetrics.map(([key, metric]) => (
                  <div key={key} className="border border-border rounded-xl p-4 bg-muted/10">
                    <div className="text-[12px] text-muted-foreground mb-1">{key}</div>
                    <div className="text-[18px] font-semibold text-foreground">
                      {metric.mean < 1 ? `${(metric.mean * 1000).toFixed(0)}ms` : `${metric.mean.toFixed(2)}s`}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Simulation Results Table */}
        {data.simulation_results.length > 0 && (
          <div>
            <div className="flex items-baseline gap-3 mb-3 md:mb-4">
              <h2 className="hidden md:block text-base md:text-lg font-semibold">
                Simulation Results
              </h2>
              <p className="text-sm text-muted-foreground">
                {data.simulation_results.length}{" "}
                {data.simulation_results.length === 1 ? "simulation" : "simulations"}
              </p>
            </div>
            <div className="border border-border rounded-xl overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead className="bg-muted/50 border-b border-border">
                    <tr>
                      <th className="w-10 px-4 py-3 text-left text-[12px] font-medium text-muted-foreground"></th>
                      <th className="px-4 py-3 text-left text-[12px] font-medium text-muted-foreground uppercase tracking-wider">Persona</th>
                      <th className="px-4 py-3 text-left text-[12px] font-medium text-muted-foreground uppercase tracking-wider">Scenario</th>
                      {displayMetricKeys.map((k) => (
                        <th key={k} className="px-4 py-3 text-left text-[12px] font-medium text-muted-foreground tracking-wider whitespace-nowrap">{k}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {data.simulation_results.map((sim, i) => (
                      <tr key={i} className="hover:bg-muted/30 transition-colors">
                        <td className="px-4 py-4">
                          {(sim.transcript?.length ?? 0) > 0 && (
                            <button
                              onClick={() => setSelectedSim(sim)}
                              className="flex items-center justify-center w-6 h-6 cursor-pointer hover:text-foreground text-muted-foreground transition-colors"
                              title="View transcript"
                            >
                              <svg className={`w-4 h-4 ${sim.aborted ? "text-red-500" : ""}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                <path strokeLinecap="round" strokeLinejoin="round" d="M5.25 5.653c0-.856.917-1.398 1.667-.986l11.54 6.348a1.125 1.125 0 010 1.971l-11.54 6.347a1.125 1.125 0 01-1.667-.986V5.653z" />
                              </svg>
                            </button>
                          )}
                        </td>
                        <td className="px-4 py-4 text-[13px] text-foreground whitespace-nowrap">{sim.persona.label}</td>
                        <td className="px-4 py-4 text-[13px] text-foreground whitespace-nowrap">{sim.scenario.name}</td>
                        {displayMetricKeys.map((key) => {
                          const val = getEvaluationResult(sim, key);
                          const reasoning = getEvaluationReasoning(sim, key);
                          if (val === null) return (
                            <td key={key} className="px-4 py-4">
                              {sim.aborted ? <span className="text-xs text-muted-foreground">N/A</span> : <span className="text-xs text-muted-foreground">—</span>}
                            </td>
                          );
                          const isPass = val === 1;
                          return (
                            <td key={key} className="px-4 py-4">
                              <div className="flex items-center gap-1.5">
                                <span className={`inline-flex items-center px-2.5 py-1 rounded-md text-xs font-medium ${isPass ? "bg-green-100 text-green-700 dark:bg-green-500/20 dark:text-green-400" : "bg-red-100 text-red-700 dark:bg-red-500/20 dark:text-red-400"}`}>
                                  {isPass ? "Pass" : "Fail"}
                                </span>
                                {reasoning && (
                                  <Tooltip content={reasoning}>
                                    <button type="button" className="p-1 rounded-md hover:bg-muted transition-colors cursor-pointer">
                                      <svg className="w-3.5 h-3.5 text-muted-foreground" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                        <path strokeLinecap="round" strokeLinejoin="round" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                                      </svg>
                                    </button>
                                  </Tooltip>
                                )}
                              </div>
                            </td>
                          );
                        })}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Transcript Dialog — identical to creator view */}
      {selectedSim && (
        <div className="fixed inset-0 z-50 flex justify-end">
          {/* Backdrop */}
          <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={() => setSelectedSim(null)} />
          {/* Sidebar - full width on mobile, 40% on desktop */}
          <div className="relative w-full md:w-[40%] md:min-w-[500px] bg-background border-l border-border flex flex-col h-full shadow-2xl">
            {/* Header */}
            <div className="flex items-center justify-between px-4 md:px-6 py-4">
              <div className="flex items-center gap-3">
                <svg className="w-5 h-5 text-muted-foreground" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M8.625 12a.375.375 0 11-.75 0 .375.375 0 01.75 0zm0 0H8.25m4.125 0a.375.375 0 11-.75 0 .375.375 0 01.75 0zm0 0H12m4.125 0a.375.375 0 11-.75 0 .375.375 0 01.75 0zm0 0h-.375M21 12c0 4.556-4.03 8.25-9 8.25a9.764 9.764 0 01-2.555-.337A5.972 5.972 0 015.41 20.97a5.969 5.969 0 01-.474-.065 4.48 4.48 0 00.978-2.025c.09-.457-.133-.901-.467-1.226C3.93 16.178 3 14.189 3 12c0-4.556 4.03-8.25 9-8.25s9 3.694 9 8.25z" />
                </svg>
                <h2 className="text-base md:text-lg font-semibold">Transcript</h2>
              </div>
              <button onClick={() => setSelectedSim(null)} className="flex items-center justify-center w-8 h-8 rounded-md hover:bg-muted transition-colors cursor-pointer">
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            {/* Full Conversation Audio Player */}
            {selectedSim.conversation_wav_url && (
              <div className="px-4 md:px-6 pb-4 border-b border-border">
                <div className="flex items-center gap-2 mb-2">
                  <span className="text-sm font-medium text-foreground">Hear the full conversation</span>
                </div>
                <audio key={selectedSim.conversation_wav_url} controls className="w-full h-10" src={selectedSim.conversation_wav_url}>
                  Your browser does not support the audio element.
                </audio>
              </div>
            )}

            {/* Transcript content */}
            <div className="flex-1 overflow-y-auto p-4 md:p-6">
              <div className="space-y-4">
                {(() => {
                  const fullTranscript = selectedSim.transcript ?? [];
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

                  if (filteredTranscript.length === 0) {
                    return (
                      <div className="flex items-center justify-center py-8">
                        <p className="text-sm text-muted-foreground">No transcript available yet</p>
                      </div>
                    );
                  }

                  return filteredTranscript.map((entry, index) => {
                    const audioUrl = getAudioUrlForEntry(entry, index, selectedSim.audio_urls, filteredTranscript, data!.type);
                    return (
                      <div key={index} className={`space-y-2 ${entry.role === "user" ? "flex flex-col items-end" : ""}`}>
                        {/* Agent header */}
                        {entry.role === "assistant" && (
                          <div className="flex items-center gap-2">
                            <span className="text-sm font-medium text-foreground">
                              {entry.tool_calls ? "Agent Tool Call" : "Agent"}
                            </span>
                          </div>
                        )}

                        {/* Per-message audio */}
                        {audioUrl && (
                          <div className="w-full md:w-1/2">
                            <audio key={audioUrl} controls className="w-full h-8 mb-2" src={audioUrl}>
                              Your browser does not support the audio element.
                            </audio>
                          </div>
                        )}

                        {/* User message */}
                        {entry.role === "user" && entry.content && (
                          <div className="w-full md:w-1/2">
                            <div className="px-4 py-3 rounded-xl text-sm text-foreground bg-muted border border-border whitespace-pre-wrap">
                              {entry.content}
                            </div>
                          </div>
                        )}

                        {/* Assistant text response */}
                        {entry.role === "assistant" && entry.content && !entry.tool_calls && (
                          <div className="w-full md:w-1/2">
                            <div className="px-4 py-3 rounded-xl text-sm text-foreground bg-accent border border-border whitespace-pre-wrap">
                              {entry.content}
                            </div>
                          </div>
                        )}

                        {/* Tool calls */}
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

                        {/* Webhook response */}
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
                  });
                })()}

                {/* Max turns notice */}
                {(() => {
                  const fullTranscript = selectedSim.transcript ?? [];
                  const lastEntry = fullTranscript[fullTranscript.length - 1];
                  if (lastEntry?.role === "end_reason" && lastEntry?.content === "max_turns") {
                    return (
                      <div className="flex items-center justify-center py-4 mt-2">
                        <div className="flex items-center gap-2 px-4 py-2 rounded-lg bg-yellow-500/10 border border-yellow-500/30">
                          <svg className="w-4 h-4 text-yellow-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m9-.75a9 9 0 11-18 0 9 9 0 0118 0zm-9 3.75h.008v.008H12v-.008z" />
                          </svg>
                          <span className="text-sm text-yellow-500">Maximum number of assistant turns reached</span>
                        </div>
                      </div>
                    );
                  }
                  return null;
                })()}

                {/* Aborted notice */}
                {selectedSim.aborted && (
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
      )}
    </PublicPageLayout>
  );
}
