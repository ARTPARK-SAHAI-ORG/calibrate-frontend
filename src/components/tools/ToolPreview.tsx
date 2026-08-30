"use client";

import type { ToolData } from "@/components/AddToolDialog";
import { readToolParameters, NormalizedToolParam } from "@/lib/toolParams";
import { EditIcon } from "@/components/icons";
import { DeleteIconButton } from "@/components/ui";

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
                aria-label="Edit tool"
                className="w-8 h-8 flex items-center justify-center rounded-md text-muted-foreground hover:text-foreground hover:bg-muted transition-colors cursor-pointer"
              >
                <EditIcon className="w-4 h-4" />
              </button>
            )}
            {onDelete && (
              <DeleteIconButton
                onClick={() => onDelete(tool)}
                title="Delete tool"
              />
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
