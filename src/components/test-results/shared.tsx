"use client";

import React from "react";
import {
  CheckIcon,
  XIcon,
  SpinnerIcon,
  ToolIcon,
  DocumentIcon,
  CloseIcon,
} from "@/components/icons";

// Re-export icons for backwards compatibility
export { CheckIcon, XIcon, SpinnerIcon, ToolIcon, CloseIcon, DocumentIcon };

// Shared Types
export type ToolCallOutput = {
  tool: string;
  arguments: Record<string, any>;
};

export type TestCaseOutput = {
  response?: string;
  tool_calls?: ToolCallOutput[];
};

export type TestCaseHistory = {
  role: "assistant" | "user" | "tool";
  content?: string;
  tool_calls?: Array<{
    id: string;
    function: {
      name: string;
      arguments: string;
    };
    type: string;
  }>;
  tool_call_id?: string;
};

export type TestCaseEvaluation = {
  type: string;
  tool_calls?: Array<{
    tool: string;
    arguments: Record<string, any> | null;
  }>;
  criteria?: string;
};

export type TestCaseData = {
  history?: TestCaseHistory[];
  evaluation?: TestCaseEvaluation;
};

// Shared Status Icon Component
export function StatusIcon({
  status,
}: {
  status: "passed" | "failed" | "running" | "pending" | "queued";
}) {
  if (status === "passed") {
    return (
      <div className="w-5 h-5 rounded-full bg-green-500/20 flex items-center justify-center flex-shrink-0">
        <CheckIcon className="w-3 h-3 text-green-500" />
      </div>
    );
  }
  if (status === "failed") {
    return (
      <div className="w-5 h-5 rounded-full bg-red-500/20 flex items-center justify-center flex-shrink-0">
        <XIcon className="w-3 h-3 text-red-500" />
      </div>
    );
  }
  if (status === "queued" || status === "pending") {
    return (
      <div className="w-5 h-5 rounded-full bg-gray-500/20 flex items-center justify-center flex-shrink-0">
        <div className="w-2 h-2 rounded-full bg-gray-400" />
      </div>
    );
  }
  // running status - yellow spinner
  return (
    <div className="w-5 h-5 flex items-center justify-center flex-shrink-0">
      <SpinnerIcon className="w-4 h-4 animate-spin text-yellow-500" />
    </div>
  );
}

// Shared Small Status Badge Component
export function SmallStatusBadge({ passed }: { passed: boolean }) {
  return (
    <div
      className={`w-4 h-4 rounded-full flex items-center justify-center ${
        passed ? "bg-green-500/20" : "bg-red-500/20"
      }`}
    >
      {passed ? (
        <CheckIcon className="w-2.5 h-2.5 text-green-500" />
      ) : (
        <XIcon className="w-2.5 h-2.5 text-red-500" />
      )}
    </div>
  );
}

// Shared Tool Call Card Component
export function ToolCallCard({
  toolName,
  args,
}: {
  toolName: string;
  args: Record<string, any>;
}) {
  return (
    <div className="bg-muted/20 border border-border rounded-2xl p-4">
      <div className="flex items-center gap-2 mb-2">
        <ToolIcon className="w-4 h-4 text-muted-foreground" />
        <span className="text-sm font-medium text-foreground">{toolName}</span>
      </div>
      {Object.keys(args).length > 0 && (
        <div className="space-y-2 mt-3">
          {Object.entries(args).map(([paramName, paramValue]) => (
            <div key={paramName}>
              <label className="block text-xs font-medium text-muted-foreground mb-1">
                {paramName}
              </label>
              <div className="px-3 py-2 rounded-lg text-sm bg-background border border-border text-foreground">
                {typeof paramValue === "object"
                  ? JSON.stringify(paramValue)
                  : String(paramValue)}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// Shared Test Detail View Component
export function TestDetailView({
  history,
  output,
  passed,
}: {
  history: TestCaseHistory[];
  output?: TestCaseOutput;
  passed: boolean;
}) {
  return (
    <div className="p-6 space-y-6">
      {/* Chat History from test_case.history */}
      {history.length > 0 && (
        <div className="space-y-4">
          <div className="space-y-4">
            {history.map((message, index) => (
              <div
                key={index}
                className={`space-y-1 ${
                  message.role === "user" ? "flex flex-col items-end" : ""
                }`}
              >
                {/* User Message */}
                {message.role === "user" && (
                  <div className="max-w-[80%]">
                    <div className="px-4 py-3 rounded-2xl bg-[#242426] border border-[#444]">
                      <p className="text-sm text-foreground whitespace-pre-wrap">
                        {message.content}
                      </p>
                    </div>
                  </div>
                )}

                {/* Agent Message (text response) */}
                {message.role === "assistant" && !message.tool_calls && (
                  <>
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium text-foreground">
                        Agent
                      </span>
                    </div>
                    <div className="max-w-[80%]">
                      <div className="px-4 py-3 rounded-2xl bg-muted/30 border border-border">
                        <p className="text-sm text-foreground whitespace-pre-wrap">
                          {message.content}
                        </p>
                      </div>
                    </div>
                  </>
                )}

                {/* Agent Tool Call from history */}
                {message.role === "assistant" &&
                  message.tool_calls &&
                  message.tool_calls.length > 0 && (
                    <>
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-medium text-foreground">
                          Agent Tool Call
                        </span>
                      </div>
                      <div className="max-w-[80%]">
                        {message.tool_calls.map((toolCall, tcIndex) => {
                          let parsedArgs: Record<string, any> = {};
                          try {
                            parsedArgs = JSON.parse(
                              toolCall.function.arguments
                            );
                          } catch {
                            parsedArgs = {};
                          }
                          return (
                            <ToolCallCard
                              key={tcIndex}
                              toolName={toolCall.function.name}
                              args={parsedArgs}
                            />
                          );
                        })}
                      </div>
                    </>
                  )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Output Section - Agent's Response/Tool Call */}
      {output && (
        <div className="space-y-4">
          {/* Text Response */}
          {output.response && (
            <div
              className={`${
                passed
                  ? "border-l-4 border-l-green-500 pl-3"
                  : "border-l-4 border-l-red-500 pl-3"
              }`}
            >
              <div className="flex items-center gap-2 mb-1">
                <span className="text-sm font-medium text-foreground">
                  Agent
                </span>
                <SmallStatusBadge passed={passed} />
              </div>
              <div className="max-w-[80%]">
                <div className="px-4 py-3 rounded-2xl bg-muted/30 border border-border">
                  <p className="text-sm text-foreground whitespace-pre-wrap">
                    {output.response}
                  </p>
                </div>
              </div>
            </div>
          )}

          {/* Tool Calls Output */}
          {output.tool_calls && output.tool_calls.length > 0 && (
            <div
              className={`${
                passed
                  ? "border-l-4 border-l-green-500 pl-3"
                  : "border-l-4 border-l-red-500 pl-3"
              }`}
            >
              <div className="flex items-center gap-2 mb-2">
                <span className="text-sm font-medium text-foreground">
                  Agent Tool Call
                </span>
                <SmallStatusBadge passed={passed} />
              </div>
              <div className="space-y-3">
                {output.tool_calls.map((toolCall, index) => (
                  <div key={index} className="max-w-[80%]">
                    <ToolCallCard
                      toolName={toolCall.tool}
                      args={toolCall.arguments}
                    />
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Show empty state if no history and no output */}
      {history.length === 0 && !output && (
        <div className="text-center py-8">
          <p className="text-sm text-muted-foreground">
            No conversation history available for this test
          </p>
        </div>
      )}
    </div>
  );
}

// Shared Empty State Component
export function EmptyStateView({ message }: { message: string }) {
  return (
    <div className="flex items-center justify-center h-full">
      <div className="text-center">
        <div className="w-12 h-12 rounded-full bg-muted/50 flex items-center justify-center mx-auto mb-3">
          <DocumentIcon className="w-6 h-6 text-muted-foreground" />
        </div>
        <p className="text-muted-foreground text-sm">{message}</p>
      </div>
    </div>
  );
}

// Shared Stats Display Component
export function TestStats({
  passedCount,
  failedCount,
}: {
  passedCount: number;
  failedCount: number;
}) {
  return (
    <div className="flex items-center gap-3 text-sm">
      <div className="flex items-center gap-1.5">
        <div className="w-2 h-2 rounded-full bg-green-500"></div>
        <span className="text-muted-foreground">{passedCount} passed</span>
      </div>
      <div className="flex items-center gap-1.5">
        <div className="w-2 h-2 rounded-full bg-red-500"></div>
        <span className="text-muted-foreground">{failedCount} failed</span>
      </div>
    </div>
  );
}
