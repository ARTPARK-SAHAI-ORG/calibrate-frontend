"use client";

import type { ToolData } from "@/components/AddToolDialog";
import { readToolParameters, NormalizedToolParam } from "@/lib/toolParams";

/**
 * What a tool needs to be called, shown beside the tool picker so the reader
 * can see it before adding it. Everything it needs is already on the tool
 * object the list was built from (the list endpoint returns the same config
 * as the single-tool endpoint) — unlike the evaluator preview, this never
 * fetches.
 */
export function ToolPreview({ tool }: { tool: ToolData | null }) {
  if (!tool) {
    return (
      <Frame>
        <p className="text-sm text-muted-foreground">
          Select a tool to see its details
        </p>
      </Frame>
    );
  }

  const isWebhook = tool.config?.type === "webhook";
  const description = tool.description || tool.config?.description || "";
  const webhook = tool.config?.webhook;
  const queryParams = readToolParameters({
    parameters: webhook?.queryParameters,
  });
  const bodyParams = readToolParameters({
    parameters: webhook?.body?.parameters,
  });
  const params = readToolParameters(tool.config);

  return (
    <div className="h-full overflow-y-auto p-4 md:p-5 space-y-4">
      <div>
        <h3 className="text-sm font-semibold text-foreground">{tool.name}</h3>
        <span className="text-xs text-muted-foreground">
          {isWebhook ? "Webhook" : "Structured Output"}
        </span>
      </div>

      {description && (
        <p className="text-sm text-muted-foreground">{description}</p>
      )}

      {isWebhook && webhook && (
        <div className="flex items-center gap-2">
          <span className="px-2 py-0.5 rounded bg-muted text-xs font-mono text-foreground">
            {webhook.method}
          </span>
          <span className="text-xs font-mono text-muted-foreground break-all">
            {webhook.url}
          </span>
        </div>
      )}

      {isWebhook ? (
        <>
          <ParamSection title="Query parameters" params={queryParams} />
          <ParamSection title="Body parameters" params={bodyParams} />
        </>
      ) : (
        <ParamSection title="Parameters" params={params} />
      )}
    </div>
  );
}

function ParamSection({
  title,
  params,
}: {
  title: string;
  params: NormalizedToolParam[];
}) {
  if (params.length === 0) return null;
  return (
    <div>
      <h4 className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground mb-2">
        {title}
      </h4>
      <div className="space-y-2">
        {params.map((p, i) => (
          <div key={`${p.name}-${i}`} className="text-sm">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="font-medium text-foreground">
                {p.name || "(unnamed)"}
              </span>
              <span className="text-xs text-muted-foreground">
                {p.dataType}
                {!p.required && " · optional"}
              </span>
            </div>
            {p.description && (
              <p className="text-xs text-muted-foreground mt-0.5">
                {p.description}
              </p>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

/** Centred box used when there is nothing to lay out. */
function Frame({ children }: { children: React.ReactNode }) {
  return (
    <div className="h-full min-h-[8rem] flex items-center justify-center p-4 text-center">
      {children}
    </div>
  );
}
