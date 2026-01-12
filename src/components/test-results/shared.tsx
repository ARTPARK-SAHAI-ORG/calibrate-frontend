"use client";

import React from "react";

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

// Shared Icons
export function CheckIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      fill="none"
      viewBox="0 0 24 24"
      stroke="currentColor"
      strokeWidth={3}
    >
      <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
    </svg>
  );
}

export function XIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
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
  );
}

export function SpinnerIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24">
      <circle
        className="opacity-25"
        cx="12"
        cy="12"
        r="10"
        stroke="currentColor"
        strokeWidth="4"
      ></circle>
      <path
        className="opacity-75"
        fill="currentColor"
        d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
      ></path>
    </svg>
  );
}

export function ToolIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      fill="none"
      viewBox="0 0 24 24"
      stroke="currentColor"
      strokeWidth={1.5}
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M11.42 15.17L17.25 21A2.652 2.652 0 0021 17.25l-5.877-5.877M11.42 15.17l2.496-3.03c.317-.384.74-.626 1.208-.766M11.42 15.17l-4.655 5.653a2.548 2.548 0 11-3.586-3.586l6.837-5.63m5.108-.233c.55-.164 1.163-.188 1.743-.14a4.5 4.5 0 004.486-6.336l-3.276 3.277a3.004 3.004 0 01-2.25-2.25l3.276-3.276a4.5 4.5 0 00-6.336 4.486c.091 1.076-.071 2.264-.904 2.95l-.102.085m-1.745 1.437L5.909 7.5H4.5L2.25 3.75l1.5-1.5L7.5 4.5v1.409l4.26 4.26m-1.745 1.437l1.745-1.437m6.615 8.206L15.75 15.75M4.867 19.125h.008v.008h-.008v-.008z"
      />
    </svg>
  );
}

export function CloseIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      fill="none"
      viewBox="0 0 24 24"
      stroke="currentColor"
      strokeWidth={2}
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M6 18L18 6M6 6l12 12"
      />
    </svg>
  );
}

export function DocumentIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      fill="none"
      viewBox="0 0 24 24"
      stroke="currentColor"
      strokeWidth={1.5}
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M9 12h3.75M9 15h3.75M9 18h3.75m3 .75H18a2.25 2.25 0 002.25-2.25V6.108c0-1.135-.845-2.098-1.976-2.192a48.424 48.424 0 00-1.123-.08m-5.801 0c-.065.21-.1.433-.1.664 0 .414.336.75.75.75h4.5a.75.75 0 00.75-.75 2.25 2.25 0 00-.1-.664m-5.8 0A2.251 2.251 0 0113.5 2.25H15c1.012 0 1.867.668 2.15 1.586m-5.8 0c-.376.023-.75.05-1.124.08C9.095 4.01 8.25 4.973 8.25 6.108V8.25m0 0H4.875c-.621 0-1.125.504-1.125 1.125v11.25c0 .621.504 1.125 1.125 1.125h9.75c.621 0 1.125-.504 1.125-1.125V9.375c0-.621-.504-1.125-1.125-1.125H8.25zM6.75 12h.008v.008H6.75V12zm0 3h.008v.008H6.75V15zm0 3h.008v.008H6.75V18z"
      />
    </svg>
  );
}

// Shared Status Icon Component
export function StatusIcon({
  status,
}: {
  status: "passed" | "failed" | "running" | "pending";
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
  return (
    <div className="w-5 h-5 flex items-center justify-center flex-shrink-0">
      <SpinnerIcon className="w-4 h-4 animate-spin text-muted-foreground" />
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
