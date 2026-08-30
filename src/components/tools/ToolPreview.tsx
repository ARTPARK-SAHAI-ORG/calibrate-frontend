"use client";

import type { ToolData } from "@/components/AddToolDialog";
import { readToolParameters, NormalizedToolParam } from "@/lib/toolParams";

/**
 * What a tool needs to be called, shown beside the tool picker so the reader
 * can see it before adding it. Everything it needs is already on the tool
 * object the list was built from (the list endpoint returns the same config
 * as the single-tool endpoint) — unlike the evaluator preview, this never
 * fetches. Laid out as the same bordered, titled sections (Configuration,
 * Parameters, Query/Body parameters) the tool builder itself uses, read-only.
 */
export function ToolPreview({
  tool,
  onEdit,
  onDelete,
}: {
  tool: ToolData | null;
  /** Opens the tool builder in edit mode. Omit to hide the button. */
  onEdit?: (tool: ToolData) => void;
  /** Permanently deletes the tool from the workspace. Omit to hide the button. */
  onDelete?: (tool: ToolData) => void;
}) {
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
      <div className="flex items-start justify-between gap-3">
        <h3 className="text-base font-semibold text-foreground">{tool.name}</h3>
        {(onEdit || onDelete) && (
          <div className="flex items-center gap-1 flex-shrink-0">
            {onEdit && (
              <button
                type="button"
                onClick={() => onEdit(tool)}
                title="Edit tool"
                className="w-7 h-7 flex items-center justify-center rounded-md text-muted-foreground hover:text-foreground hover:bg-muted transition-colors cursor-pointer"
              >
                <svg
                  className="w-4 h-4"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                  strokeWidth={1.5}
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M16.862 4.487l1.687-1.688a1.875 1.875 0 112.652 2.652L10.582 16.07a4.5 4.5 0 01-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 011.13-1.897l8.932-8.931zm0 0L19.5 7.125M18 14v4.75A2.25 2.25 0 0115.75 21H5.25A2.25 2.25 0 013 18.75V8.25A2.25 2.25 0 015.25 6H10"
                  />
                </svg>
              </button>
            )}
            {onDelete && (
              <button
                type="button"
                onClick={() => onDelete(tool)}
                title="Delete tool"
                className="w-7 h-7 flex items-center justify-center rounded-md text-muted-foreground hover:text-red-500 hover:bg-red-500/10 transition-colors cursor-pointer"
              >
                <svg
                  className="w-4 h-4"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                  strokeWidth={1.5}
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 01-2.244 2.077H8.084a2.25 2.25 0 01-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 00-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 013.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 00-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 00-7.5 0"
                  />
                </svg>
              </button>
            )}
          </div>
        )}
      </div>

      {/* Configuration — type, description, method + URL for a webhook. Same
          section shape as the tool builder's own Configuration card. */}
      <div className="border border-border rounded-xl p-4 space-y-3 bg-muted/50">
        <h4 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          Configuration
        </h4>
        <Field
          label="Type"
          value={isWebhook ? "Webhook" : "Structured Output"}
        />
        {description && <Field label="Description" value={description} />}
        {isWebhook && webhook && (
          <div>
            <span className="text-xs text-muted-foreground">Request</span>
            <div className="flex items-center gap-2 mt-1">
              <span className="px-2 py-0.5 rounded bg-background border border-border text-xs font-mono text-foreground">
                {webhook.method}
              </span>
              <span className="text-xs font-mono text-muted-foreground break-all">
                {webhook.url}
              </span>
            </div>
          </div>
        )}
      </div>

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

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <span className="text-xs text-muted-foreground">{label}</span>
      <p className="text-sm text-foreground mt-0.5">{value}</p>
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
    <div className="border border-border rounded-xl p-4 space-y-3 bg-muted/50">
      <h4 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        {title}
      </h4>
      <div className="space-y-2">
        {params.map((p, i) => (
          <div
            key={`${p.name}-${i}`}
            className="border border-border rounded-lg p-3 bg-background"
          >
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-sm font-medium text-foreground">
                {p.name || "(unnamed)"}
              </span>
              <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-muted text-muted-foreground">
                {p.dataType}
              </span>
              {!p.required && (
                <span className="text-xs text-muted-foreground">optional</span>
              )}
            </div>
            {p.description && (
              <p className="text-xs text-muted-foreground mt-1">
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
