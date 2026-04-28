"use client";

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

      <pre className="border border-border rounded-md p-3 md:p-4 bg-muted/10 text-sm text-foreground whitespace-pre-wrap font-mono leading-relaxed overflow-x-auto">
        {version.system_prompt}
      </pre>

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
