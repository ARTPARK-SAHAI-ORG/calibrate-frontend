"use client";

import React, { useState, useEffect } from "react";
import { useParams } from "next/navigation";
import {
  TestCaseOutput,
  TestCaseData,
  StatusIcon,
  TestDetailView,
  EvaluationCriteriaPanel,
} from "@/components/test-results/shared";
import { PublicPageLayout, PublicNotFound, PublicLoading } from "@/components/PublicPageLayout";

type ChatMessage = {
  role: "user" | "agent" | "tool";
  content: string;
  tool_name?: string;
  tool_args?: Record<string, any>;
};

type TestCaseResult = {
  test_uuid?: string;
  test_name?: string;
  name?: string;
  status?: "passed" | "failed" | "error";
  passed?: boolean | null;
  reasoning?: string;
  output?: TestCaseOutput | null;
  test_case?: TestCaseData | null;
  chat_history?: ChatMessage[];
  evaluation?: { passed: boolean; message?: string; details?: Record<string, any> };
  error?: string;
};

type TestRunStatusResponse = {
  task_id: string;
  status: string;
  total_tests?: number;
  passed?: number;
  failed?: number;
  results?: TestCaseResult[];
  error?: string;
};

// Map raw API result → display status
function getStatus(r: TestCaseResult): "passed" | "failed" {
  if (r.passed === true || r.status === "passed") return "passed";
  return "failed";
}

export default function PublicTestRunPage() {
  const params = useParams();
  const token = params.token as string;

  const [data, setData] = useState<TestRunStatusResponse | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [selectedIndex, setSelectedIndex] = useState<number | null>(null);

  useEffect(() => { document.title = "Test Run | Calibrate"; }, []);

  useEffect(() => {
    const fetchData = async () => {
      try {
        const backendUrl = process.env.NEXT_PUBLIC_BACKEND_URL;
        if (!backendUrl) throw new Error("Backend URL not configured");

        const res = await fetch(`${backendUrl}/public/test-run/${token}`, {
          headers: { accept: "application/json", "ngrok-skip-browser-warning": "true" },
        });

        if (res.status === 404) { setNotFound(true); return; }
        if (!res.ok) throw new Error("Failed to load results");

        const result: TestRunStatusResponse = await res.json();
        if (result.status !== "done" && result.status !== "completed") { setNotFound(true); return; }

        setData(result);
        if (result.results?.length) setSelectedIndex(0);
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

  const results = data.results ?? [];
  const passed = results.filter((r) => getStatus(r) === "passed").length;
  const failed = results.filter((r) => getStatus(r) === "failed").length;
  const selected = selectedIndex !== null ? results[selectedIndex] : null;

  return (
    <PublicPageLayout>
      <div className="space-y-4 md:space-y-6">
        {/* Summary stats */}
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2">
            <span className="inline-flex items-center px-2.5 py-1 rounded-md text-xs font-medium bg-green-100 text-green-700 dark:bg-green-500/20 dark:text-green-400">
              {passed} passed
            </span>
            <span className="inline-flex items-center px-2.5 py-1 rounded-md text-xs font-medium bg-red-100 text-red-700 dark:bg-red-500/20 dark:text-red-400">
              {failed} failed
            </span>
          </div>
          <span className="text-[13px] text-muted-foreground">{results.length} total tests</span>
        </div>

        {results.length > 0 && (
          <div className="flex border border-border rounded-xl overflow-hidden" style={{ height: "calc(100vh - 260px)", minHeight: 480 }}>
            {/* Left panel — test list */}
            <div className="w-64 shrink-0 border-r border-border flex flex-col overflow-hidden bg-muted/10">
              <div className="overflow-y-auto flex-1 p-2 space-y-0.5">
                {results.map((r, i) => {
                  const status = getStatus(r);
                  const name = r.name || r.test_case?.name || r.test_name || `Test ${i + 1}`;
                  return (
                    <button
                      key={i}
                      type="button"
                      onClick={() => setSelectedIndex(i)}
                      className={`w-full flex items-center gap-2 px-3 py-2 rounded-lg cursor-pointer transition-colors text-left ${selectedIndex === i ? "bg-muted" : "hover:bg-muted/50"}`}
                    >
                      <StatusIcon status={status} />
                      <span className="text-[13px] text-foreground truncate">{name}</span>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Right panel — detail */}
            <div className="flex-1 overflow-y-auto">
              {selected ? (
                (() => {
                  const status = getStatus(selected);
                  return (
                    <div className="flex h-full">
                      {/* Conversation + output */}
                      <div className="flex-1 overflow-y-auto p-4 md:p-6">
                        <TestDetailView
                          history={selected.test_case?.history || []}
                          output={selected.output ?? undefined}
                          passed={selected.evaluation?.passed ?? status === "passed"}
                          reasoning={selected.reasoning}
                        />
                      </div>
                      {/* Evaluation criteria panel */}
                      {selected.test_case?.evaluation && (
                        <div className="w-72 shrink-0 border-l border-border overflow-y-auto">
                          <EvaluationCriteriaPanel evaluation={selected.test_case.evaluation} />
                        </div>
                      )}
                    </div>
                  );
                })()
              ) : (
                <div className="flex items-center justify-center h-full">
                  <p className="text-muted-foreground text-[13px]">Select a test to view details</p>
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </PublicPageLayout>
  );
}
