"use client";

import { useState } from "react";

type ScaleEntry = {
  value: boolean | number | string;
  name: string;
  description?: string;
};

type EvaluatorVariable = {
  name: string;
  description?: string;
  default?: string;
};

type EvaluatorVersion = {
  uuid: string;
  version_number: number;
  judge_model: string;
  system_prompt: string;
  output_config: { scale: ScaleEntry[] } | null;
  variables: EvaluatorVariable[] | null;
  created_at: string;
};

type VersionCardProps = {
  version: EvaluatorVersion;
  outputType: "binary" | "rating";
  isDefault: boolean;
  isLive: boolean;
  isSettingLive: boolean;
  onSetLive: (versionUuid: string) => void;
  formatDateTime: (date: string) => string;
};

export function VersionCard({
  version,
  outputType,
  isDefault,
  isLive,
  isSettingLive,
  onSetLive,
  formatDateTime,
}: VersionCardProps) {
  const [promptVisible, setPromptVisible] = useState(isLive || isDefault);
  const [copied, setCopied] = useState(false);

  function handleCopy() {
    navigator.clipboard.writeText(version.system_prompt).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    });
  }

  return (
    <div
      className={
        isDefault
          ? "space-y-3"
          : "border border-border rounded-xl p-4 md:p-5 bg-background space-y-3"
      }
    >
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-2 flex-wrap min-w-0">
          {!isDefault && (
            <>
              <span className="inline-flex items-center px-2 py-0.5 rounded-md text-xs font-semibold bg-muted text-foreground">
                v{version.version_number}
              </span>
              {isLive && (
                <span className="inline-flex items-center px-2 py-0.5 rounded-md text-[10px] md:text-[11px] font-medium uppercase tracking-wide bg-emerald-500/10 text-emerald-600 dark:text-emerald-400">
                  Current
                </span>
              )}
            </>
          )}
          <code className="text-xs md:text-sm font-mono text-muted-foreground truncate">
            {version.judge_model}
          </code>
        </div>
        {!isDefault && (
          <div className="flex items-center gap-3 flex-shrink-0">
            {!isLive && (
              <button
                onClick={() => onSetLive(version.uuid)}
                disabled={isSettingLive}
                className="h-9 px-4 rounded-md text-xs md:text-sm font-semibold border border-emerald-500/40 bg-emerald-500/10 text-emerald-700 hover:bg-emerald-500/15 dark:text-emerald-300 dark:border-emerald-400/40 dark:bg-emerald-500/15 dark:hover:bg-emerald-500/20 transition-colors shadow-sm cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {isSettingLive ? "Marking..." : "Mark as current"}
              </button>
            )}
            <span className="text-xs text-muted-foreground whitespace-nowrap">
              {formatDateTime(version.created_at)}
            </span>
          </div>
        )}
      </div>

      <div className="space-y-2">
        <div className="flex items-center justify-between gap-2">
          <button
            onClick={() => setPromptVisible((v) => !v)}
            className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors cursor-pointer"
          >
            {promptVisible ? (
              <>
                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M3.98 8.223A10.477 10.477 0 001.934 12C3.226 16.338 7.244 19.5 12 19.5c.993 0 1.953-.138 2.863-.395M6.228 6.228A10.45 10.45 0 0112 4.5c4.756 0 8.773 3.162 10.065 7.498a10.523 10.523 0 01-4.293 5.774M6.228 6.228L3 3m3.228 3.228l3.65 3.65m7.894 7.894L21 21m-3.228-3.228l-3.65-3.65m0 0a3 3 0 10-4.243-4.243m4.242 4.242L9.88 9.88" />
                </svg>
                Hide prompt
              </>
            ) : (
              <>
                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M2.036 12.322a1.012 1.012 0 010-.639C3.423 7.51 7.36 4.5 12 4.5c4.638 0 8.573 3.007 9.963 7.178.07.207.07.431 0 .639C20.577 16.49 16.64 19.5 12 19.5c-4.638 0-8.573-3.007-9.963-7.178z" />
                  <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                </svg>
                View prompt
              </>
            )}
          </button>
          {promptVisible && (
            <button
              onClick={handleCopy}
              className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors cursor-pointer"
            >
              {copied ? (
                <>
                  <svg className="w-3.5 h-3.5 text-emerald-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
                  </svg>
                  <span className="text-emerald-500">Copied</span>
                </>
              ) : (
                <>
                  <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M15.666 3.888A2.25 2.25 0 0013.5 2.25h-3c-1.03 0-1.9.693-2.166 1.638m7.332 0c.055.194.084.4.084.612v0a.75.75 0 01-.75.75H9a.75.75 0 01-.75-.75v0c0-.212.03-.418.084-.612m7.332 0c.646.049 1.288.11 1.927.184 1.1.128 1.907 1.077 1.907 2.185V19.5a2.25 2.25 0 01-2.25 2.25H6.75A2.25 2.25 0 014.5 19.5V6.257c0-1.108.806-2.057 1.907-2.185a48.208 48.208 0 011.927-.184" />
                  </svg>
                  Copy
                </>
              )}
            </button>
          )}
        </div>
        {promptVisible && (
          <pre className="border border-border rounded-md p-3 md:p-4 bg-muted/10 text-sm text-foreground whitespace-pre-wrap font-mono leading-relaxed overflow-x-auto">
            {version.system_prompt}
          </pre>
        )}
      </div>

      {version.variables?.length ? (
        <div className="space-y-2">
          <div className="text-[11px] uppercase tracking-wide text-muted-foreground">
            Variables
          </div>
          <div className="flex items-start gap-2 rounded-md border border-blue-500/20 bg-blue-500/5 p-3 text-xs md:text-sm text-muted-foreground">
            <svg
              className="w-4 h-4 mt-0.5 flex-shrink-0 text-blue-600 dark:text-blue-400"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={1.75}
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M11.25 11.25l.041-.02a.75.75 0 011.063.852l-.708 2.836a.75.75 0 001.063.853l.041-.021M21 12a9 9 0 11-18 0 9 9 0 0118 0zm-9-3.75h.008v.008H12V8.25z"
              />
            </svg>
            <span>
              When this evaluator is added to an LLM test, you will be able to
              fill in the value of each variable for that test
            </span>
          </div>
          <div className="border border-border rounded-md overflow-hidden">
            {version.variables.map((variable, i) => (
              <div
                key={variable.name}
                className={`p-3 md:p-4 bg-background ${
                  i > 0 ? "border-t border-border" : ""
                }`}
              >
                <code className="text-sm font-mono font-semibold text-foreground">
                  {`{{${variable.name}}}`}
                </code>
                {variable.description && (
                  <p className="text-sm text-muted-foreground mt-1">
                    {variable.description}
                  </p>
                )}
                {variable.default ? (
                  <div className="mt-2">
                    <div className="text-[11px] text-muted-foreground mb-1">
                      Default
                    </div>
                    <pre className="text-xs text-foreground whitespace-pre-wrap font-mono bg-muted/30 rounded-md p-2">
                      {variable.default}
                    </pre>
                  </div>
                ) : null}
              </div>
            ))}
          </div>
        </div>
      ) : null}

      {outputType === "rating" && version.output_config?.scale?.length ? (
        <div className="space-y-2">
          <div className="text-[11px] uppercase tracking-wide text-muted-foreground">
            Output
          </div>
          <div className="border border-border rounded-md p-3 md:p-4 bg-muted/10 space-y-2">
            {version.output_config.scale.map((entry) => (
              <div
                key={`${String(entry.value)}-${entry.name}`}
                className="flex items-start gap-3"
              >
                <span className="inline-flex items-center justify-center min-w-[28px] h-6 px-2 rounded-md text-xs font-semibold bg-muted text-foreground">
                  {String(entry.value)}
                </span>
                <div className="min-w-0">
                  <div className="text-sm font-medium text-foreground">
                    {entry.name}
                  </div>
                  {entry.description && (
                    <div className="text-xs text-muted-foreground mt-0.5">
                      {entry.description}
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      ) : null}
    </div>
  );
}
