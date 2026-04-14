"use client";

import React, { useEffect, useState } from "react";
import { signOut } from "next-auth/react";
import { useAccessToken } from "@/hooks";
import { SpinnerIcon, CheckCircleIcon, AlertIcon } from "@/components/icons";

type VerificationStatus = "unverified" | "verifying" | "verified" | "failed";

export type ConnectionConfig = {
  agent_url?: string;
  agent_headers?: Record<string, string>;
  connection_verified?: boolean;
  connection_verified_at?: string | null;
  connection_verified_error?: string | null;
  supports_benchmark?: boolean;
  benchmark_provider?: string;
  benchmark_models_verified?: Record<
    string,
    { verified: boolean; verified_at: string; error: string | null }
  >;
};

type AgentConnectionTabContentProps = {
  agentUuid: string;
  agentUrl: string;
  onAgentUrlChange: (url: string) => void;
  agentHeaders: Array<{ key: string; value: string }>;
  onAgentHeadersChange: (
    headers: Array<{ key: string; value: string }>,
  ) => void;
  connectionConfig: ConnectionConfig;
  onConnectionConfigChange: (config: ConnectionConfig) => void;
  onSave: () => Promise<void> | void;
  isSaving: boolean;
};

export function AgentConnectionTabContent({
  agentUuid,
  agentUrl,
  onAgentUrlChange,
  agentHeaders,
  onAgentHeadersChange,
  connectionConfig,
  onConnectionConfigChange,
  onSave,
  isSaving,
}: AgentConnectionTabContentProps) {
  const backendAccessToken = useAccessToken();
  const [verifyStatus, setVerifyStatus] = useState<VerificationStatus>(() => {
    if (connectionConfig.connection_verified === true) return "verified";
    if (
      connectionConfig.connection_verified === false &&
      connectionConfig.connection_verified_error
    )
      return "failed";
    return "unverified";
  });
  useEffect(() => {
    if (connectionConfig.connection_verified === true) {
      setVerifyStatus("verified");
    } else if (
      connectionConfig.connection_verified === false &&
      connectionConfig.connection_verified_error
    ) {
      setVerifyStatus("failed");
    } else if (connectionConfig.connection_verified === false) {
      setVerifyStatus("unverified");
    }
  }, [
    connectionConfig.connection_verified,
    connectionConfig.connection_verified_error,
  ]);

  const [sampleResponse, setSampleResponse] = useState<Record<
    string,
    unknown
  > | null>(null);
  const handleAddHeader = () => {
    onAgentHeadersChange([...agentHeaders, { key: "", value: "" }]);
  };

  const handleRemoveHeader = (index: number) => {
    onAgentHeadersChange(agentHeaders.filter((_, i) => i !== index));
  };

  const handleHeaderChange = (
    index: number,
    field: "key" | "value",
    value: string,
  ) => {
    const updated = agentHeaders.map((h, i) =>
      i === index ? { ...h, [field]: value } : h,
    );
    onAgentHeadersChange(updated);
  };

  const handleVerify = async () => {
    setVerifyStatus("verifying");

    try {
      const backendUrl = process.env.NEXT_PUBLIC_BACKEND_URL;
      if (!backendUrl) throw new Error("BACKEND_URL not set");

      const currentHeadersObj: Record<string, string> = {};
      for (const h of agentHeaders) {
        if (h.key.trim()) {
          currentHeadersObj[h.key] = h.value;
        }
      }

      const savedUrl = connectionConfig.agent_url || "";
      const savedHeaders = connectionConfig.agent_headers || {};
      const hasUnsavedChanges =
        agentUrl.trim() !== savedUrl ||
        JSON.stringify(currentHeadersObj) !== JSON.stringify(savedHeaders);

      let response: Response;

      if (hasUnsavedChanges) {
        response = await fetch(`${backendUrl}/agents/verify-connection`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            accept: "application/json",
            "ngrok-skip-browser-warning": "true",
            Authorization: `Bearer ${backendAccessToken}`,
          },
          body: JSON.stringify({
            agent_url: agentUrl.trim(),
            ...(Object.keys(currentHeadersObj).length > 0 && {
              agent_headers: currentHeadersObj,
            }),
          }),
        });
      } else {
        response = await fetch(
          `${backendUrl}/agents/${agentUuid}/verify-connection`,
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              accept: "application/json",
              "ngrok-skip-browser-warning": "true",
              Authorization: `Bearer ${backendAccessToken}`,
            },
            body: JSON.stringify({}),
          },
        );
      }

      if (response.status === 401) {
        await signOut({ callbackUrl: "/login" });
        return;
      }

      if (!response.ok) {
        throw new Error("Verification request failed");
      }

      const result = await response.json();

      onConnectionConfigChange({
        ...connectionConfig,
        connection_verified: result.success ?? false,
        connection_verified_at: result.success
          ? new Date().toISOString()
          : null,
        connection_verified_error: result.error ?? null,
      });

      setSampleResponse(result.sample_response ?? null);
      setVerifyStatus(result.success ? "verified" : "failed");
    } catch (err) {
      console.error("Error verifying connection:", err);
      onConnectionConfigChange({
        ...connectionConfig,
        connection_verified: false,
        connection_verified_at: null,
        connection_verified_error:
          err instanceof Error ? err.message : "Verification failed",
      });
      setSampleResponse(null);
      setVerifyStatus("failed");
    }
  };

  const verifiedAt = connectionConfig.connection_verified_at
    ? new Date(connectionConfig.connection_verified_at).toLocaleString(
        "en-US",
        {
          month: "short",
          day: "numeric",
          year: "numeric",
          hour: "numeric",
          minute: "2-digit",
          hour12: true,
        },
      )
    : null;

  const verifyError = connectionConfig.connection_verified_error;

  const supportsBenchmark = connectionConfig.supports_benchmark ?? false;
  const benchmarkProvider = connectionConfig.benchmark_provider || "openrouter";

  const exampleModelByProvider: Record<string, string> = {
    openrouter: "openai/gpt-4.1",
    openai: "gpt-4.1",
    google: "gemini-3-flash",
    anthropic: "claude-4.6-sonnet",
    "meta-llama": "llama-4-scout",
    mistralai: "mistral-large",
    deepseek: "deepseek-chat",
    "x-ai": "grok-3",
    cohere: "command-a",
    qwen: "qwen-max",
    ai21: "jamba-1.5-large",
  };

  const handleBenchmarkToggle = () => {
    onConnectionConfigChange({
      ...connectionConfig,
      supports_benchmark: !supportsBenchmark,
      benchmark_provider: !supportsBenchmark
        ? connectionConfig.benchmark_provider || "openrouter"
        : connectionConfig.benchmark_provider,
    });
  };

  const handleProviderChange = (provider: string) => {
    onConnectionConfigChange({
      ...connectionConfig,
      benchmark_provider: provider,
    });
  };

  return (
    <div className="flex flex-col md:grid md:grid-cols-2 gap-6 md:gap-8">
      {/* Left Column: Endpoint + Connection Check */}
      <div className="space-y-6 md:space-y-8">
        {/* Endpoint Section */}
        <div className="space-y-4 md:space-y-6">
          {/* Benchmark toggle */}
          <div className="flex items-center justify-between">
            <label className="text-sm md:text-base font-medium text-foreground">
              Support benchmarking different models
            </label>
            <button
              type="button"
              onClick={handleBenchmarkToggle}
              className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors cursor-pointer ${
                supportsBenchmark ? "bg-foreground" : "bg-border"
              }`}
            >
              <span
                className={`inline-block h-3.5 w-3.5 transform rounded-full bg-background transition-transform ${
                  supportsBenchmark ? "translate-x-4" : "translate-x-1"
                }`}
              />
            </button>
          </div>

          {/* Agent URL */}
          <div className="space-y-1.5">
            <label className="block text-sm md:text-base font-medium text-foreground">
              Agent URL <span className="text-red-500">*</span>
            </label>
            <input
              type="url"
              value={agentUrl}
              onChange={(e) => onAgentUrlChange(e.target.value)}
              placeholder="https://your-agent.example.com/chat"
              className="w-full h-9 md:h-10 px-3 md:px-4 rounded-md text-sm md:text-base border border-border bg-background text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-accent focus:border-transparent"
            />
            <p className="text-xs text-muted-foreground">
              Calibrate will create a POST request to this URL with the
              conversation messages
            </p>
          </div>

          {/* Headers */}
          <div className="space-y-2">
            <label className="text-sm md:text-base font-medium text-foreground">
              Headers
            </label>
            <p className="text-xs text-muted-foreground">
              Add headers for authentication or custom metadata
            </p>
            <div className="space-y-2 md:space-y-2">
              {agentHeaders.map((header, index) => (
                <div key={index}>
                  {/* Mobile: card layout */}
                  <div className="md:hidden border border-border rounded-lg p-3 space-y-2">
                    <div className="flex items-center gap-2">
                      <input
                        type="text"
                        value={header.key}
                        onChange={(e) =>
                          handleHeaderChange(index, "key", e.target.value)
                        }
                        placeholder="Header name"
                        className="flex-1 min-w-0 h-9 px-3 rounded-md text-sm border border-border bg-background text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-accent"
                      />
                      <button
                        type="button"
                        onClick={() => handleRemoveHeader(index)}
                        className="w-8 h-8 flex items-center justify-center rounded-md text-muted-foreground hover:text-red-500 hover:bg-red-500/10 transition-colors cursor-pointer flex-shrink-0"
                      >
                        <svg
                          className="w-3.5 h-3.5"
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
                      </button>
                    </div>
                    <div className="pr-10">
                      <input
                        type="text"
                        value={header.value}
                        onChange={(e) =>
                          handleHeaderChange(index, "value", e.target.value)
                        }
                        placeholder="Value"
                        className="w-full h-9 px-3 rounded-md text-sm border border-border bg-background text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-accent"
                      />
                    </div>
                  </div>
                  {/* Desktop: inline row */}
                  <div className="hidden md:flex items-center gap-2">
                    <input
                      type="text"
                      value={header.key}
                      onChange={(e) =>
                        handleHeaderChange(index, "key", e.target.value)
                      }
                      placeholder="Header name"
                      className="flex-1 h-10 px-4 rounded-md text-base border border-border bg-background text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-accent"
                    />
                    <input
                      type="text"
                      value={header.value}
                      onChange={(e) =>
                        handleHeaderChange(index, "value", e.target.value)
                      }
                      placeholder="Value"
                      className="flex-1 h-10 px-4 rounded-md text-base border border-border bg-background text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-accent"
                    />
                    <button
                      type="button"
                      onClick={() => handleRemoveHeader(index)}
                      className="w-8 h-8 flex items-center justify-center rounded-md text-muted-foreground hover:text-red-500 hover:bg-red-500/10 transition-colors cursor-pointer flex-shrink-0"
                    >
                      <svg
                        className="w-4 h-4"
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
                    </button>
                  </div>
                </div>
              ))}
            </div>
            <button
              type="button"
              onClick={handleAddHeader}
              className="text-xs text-muted-foreground hover:text-foreground transition-colors cursor-pointer flex items-center gap-1"
            >
              <svg
                className="w-3.5 h-3.5"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth={2}
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M12 4.5v15m7.5-7.5h-15"
                />
              </svg>
              Add header
            </button>
          </div>

          {/* Benchmark Provider Picker */}
          {supportsBenchmark && (
            <div className="space-y-2 border border-border rounded-xl bg-muted/20 p-3 md:p-4">
              <label className="text-sm md:text-base font-medium text-foreground">
                Model provider
              </label>
              <p className="text-xs text-muted-foreground">
                Choose the provider your agent uses to route model requests
                during benchmarks.
              </p>
              <div className="relative">
                <select
                  value={benchmarkProvider}
                  onChange={(e) => handleProviderChange(e.target.value)}
                  className="w-full h-9 md:h-10 px-3 md:px-4 pr-10 rounded-md text-sm md:text-base border border-border bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-accent focus:border-transparent cursor-pointer appearance-none"
                >
                  <option value="openrouter">
                    OpenRouter (all providers)
                  </option>
                  <option value="openai">OpenAI</option>
                  <option value="anthropic">Anthropic</option>
                  <option value="google">Google</option>
                  <option value="meta-llama">Meta</option>
                  <option value="mistralai">Mistral</option>
                  <option value="deepseek">DeepSeek</option>
                  <option value="x-ai">xAI</option>
                  <option value="cohere">Cohere</option>
                  <option value="qwen">Qwen</option>
                  <option value="ai21">AI21</option>
                </select>
                <svg
                  className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                  strokeWidth={2}
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M19.5 8.25l-7.5 7.5-7.5-7.5"
                  />
                </svg>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Right Column: Connection Check + Expected Format */}
      <div className="space-y-4 md:space-y-6">
        {/* Connection Check */}
        <div className="border border-border rounded-xl p-3 md:p-4 space-y-3">
          <div>
            <h3 className="text-sm md:text-base font-medium text-foreground">
              Connection check
            </h3>
            <p className="text-xs text-muted-foreground mt-0.5">
              Verifies your agent is reachable and returns the expected response
              format. Required before running LLM tests and text simulations
            </p>
          </div>

          <div className="flex items-center justify-between gap-4">
            {/* Status pill — hidden while verifying */}
            <div className="flex items-center gap-2">
              {verifyStatus === "verifying" ? null : verifyStatus ===
                "verified" ? (
                <>
                  <CheckCircleIcon className="w-4 h-4 text-green-500" />
                  <span className="text-sm text-green-600">
                    Verified
                    {verifiedAt && (
                      <span className="text-muted-foreground font-normal">
                        {" "}
                        · {verifiedAt}
                      </span>
                    )}
                  </span>
                </>
              ) : verifyStatus === "failed" ? (
                <>
                  <AlertIcon className="w-4 h-4 text-red-500" />
                  <span className="text-sm text-red-500">Failed</span>
                </>
              ) : (
                <>
                  <div className="w-2 h-2 rounded-full bg-muted-foreground/40" />
                  <span className="text-sm text-muted-foreground">
                    Not verified
                  </span>
                </>
              )}
            </div>

            {/* Verify button */}
            <button
              type="button"
              onClick={handleVerify}
              disabled={
                verifyStatus === "verifying" || !agentUrl.trim() || isSaving
              }
              className="h-8 md:h-9 px-3 md:px-4 rounded-md text-xs md:text-sm font-medium bg-yellow-500 text-black hover:bg-yellow-400 transition-colors cursor-pointer disabled:opacity-70 disabled:cursor-not-allowed flex-shrink-0 flex items-center gap-1.5"
            >
              {verifyStatus === "verifying" ? (
                <SpinnerIcon className="w-3.5 h-3.5 animate-spin" />
              ) : (
                <CheckCircleIcon className="w-3.5 h-3.5" />
              )}
              {verifyStatus === "verifying"
                ? "Verifying..."
                : verifyStatus === "verified"
                  ? "Re-verify"
                  : "Verify"}
            </button>
          </div>

          {verifyStatus === "failed" && (verifyError || sampleResponse) && (
            <div className="space-y-2 rounded-lg border border-red-500/20 bg-red-500/5 p-3">
              {verifyError && (
                <p className="text-xs text-red-400">{verifyError}</p>
              )}
              {sampleResponse && (
                <div className="space-y-1">
                  <p className="text-xs font-medium text-muted-foreground">
                    Your agent responded with:
                  </p>
                  <pre className="text-xs bg-muted rounded-lg p-3 overflow-x-auto text-foreground max-h-48 overflow-y-auto">
                    {JSON.stringify(sampleResponse, null, 2)}
                  </pre>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Expected Format */}
        <div className="border border-border rounded-xl overflow-hidden">
          <div className="flex items-center gap-2 px-3 md:px-4 py-3 text-sm md:text-base font-medium text-foreground">
            <svg
              className="w-4 h-4 text-muted-foreground"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={2}
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M11.25 11.25l.041-.02a.75.75 0 011.063.852l-.708 2.836a.75.75 0 001.063.853l.041-.021M21 12a9 9 0 11-18 0 9 9 0 0118 0zm-9-3.75h.008v.008H12V8.25z"
              />
            </svg>
            Expected request &amp; response format
          </div>
          <div className="px-3 md:px-4 pb-3 md:pb-4 space-y-4 border-t border-border bg-muted/10">
            <div className="pt-4 space-y-3">
              <p className="text-sm text-muted-foreground">
                Calibrate will{" "}
                <code className="text-xs bg-muted px-1 py-0.5 rounded">
                  POST
                </code>{" "}
                to your agent URL with this body:
              </p>
              <pre className="text-xs bg-muted rounded-lg p-3 overflow-x-auto text-foreground">
                {`{
  "messages": [
    { "role": "assistant", "content": "Namaste! Main aapki kaise madad kar sakti hoon?" },
    { "role": "user",      "content": "Meri beti ka vaccination schedule kya hai?"      }
  ]
}`}
              </pre>

              {supportsBenchmark && (
                <>
                  <p className="text-sm text-muted-foreground">
                    To support benchmarking multiple models, a{" "}
                    <code className="text-xs bg-muted px-1 py-0.5 rounded">
                      model
                    </code>{" "}
                    field is also included so your agent can route to the right
                    LLM:
                  </p>
                  <pre className="text-xs bg-muted rounded-lg p-3 overflow-x-auto text-foreground">
                    {`{ "messages": [...], "model": "${exampleModelByProvider[benchmarkProvider] || "model-name"}" }`}
                  </pre>
                  <div className="flex gap-2 p-3 rounded-lg bg-yellow-500/10 border border-yellow-500/20">
                    <svg
                      className="w-4 h-4 text-yellow-500 flex-shrink-0 mt-0.5"
                      fill="none"
                      viewBox="0 0 24 24"
                      stroke="currentColor"
                      strokeWidth={2}
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z"
                      />
                    </svg>
                    <p className="text-xs text-yellow-600 dark:text-yellow-400">
                      Your agent is responsible for reading the{" "}
                      <code className="text-[11px] bg-yellow-500/10 px-1 py-0.5 rounded">
                        model
                      </code>{" "}
                      parameter and setting the right model to perform the
                      actual inference. Calibrate sends this field but does not
                      control which model your agent uses.
                    </p>
                  </div>
                </>
              )}

              <p className="text-sm text-muted-foreground">
                Your agent must respond with at least one of:
              </p>
              <pre className="text-xs bg-muted rounded-lg p-3 overflow-x-auto text-foreground">
                {`{
  "response": "Aapki beti ka agla vaccination 14 weeks pe hai — OPV aur DPT ke liye.",
  "tool_calls": [
    { "tool": "get_schedule", "arguments": { "child_age_weeks": 14 } }
  ]
}`}
              </pre>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
