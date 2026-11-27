import { Tooltip } from "@/components/Tooltip";
import { SpinnerIcon, WarningTriangleIcon } from "@/components/icons";
import {
  isMetadataSource,
  metadataKey,
  missingValueSentence,
  missingValueText,
  traceSourceHint,
  traceSourceLabel,
} from "@/lib/traceScoring";
import { METADATA_KEY_CODE, VARIABLE_CHIP } from "@/lib/variableChip";
import type { AgentNature } from "./ingestSnippets";
import { WarningBox } from "./WarningBox";

export type TraceVariableOutcome = "tests" | "labelling";

/** What is missing, with a metadata field's name set apart from the words. */
function MissingText({
  source,
  agentNature,
  sentence,
}: {
  source: string;
  agentNature?: AgentNature;
  sentence?: boolean;
}) {
  if (!isMetadataSource(source))
    return (
      <>
        {sentence
          ? missingValueSentence(source, agentNature)
          : missingValueText(source, agentNature)}
      </>
    );
  const key = <code className={METADATA_KEY_CODE}>{metadataKey(source)}</code>;
  return sentence ? (
    <>This trace has no metadata entry called {key}</>
  ) : (
    <>No {key} in the metadata</>
  );
}

export type TraceVariableRow = {
  variable: string;
  source: string;
  perTrace: { traceId: string; label: string; value: string | null }[];
};

const SMALL_HEADING =
  "text-[11px] uppercase tracking-wide text-muted-foreground font-medium";

/** `{{name}}` from <part of the trace>, with what that part is on hover. */
export function VariableFromSource({
  variable,
  source,
  agentNature,
}: {
  variable: string;
  source: string;
  agentNature?: AgentNature;
}) {
  const hint = traceSourceHint(source);
  const chip = (
    <span className="bg-muted text-muted-foreground text-xs font-medium rounded px-2 py-0.5">
      {isMetadataSource(source)
        ? `Metadata: ${metadataKey(source)}`
        : traceSourceLabel(source, agentNature)}
    </span>
  );
  return (
    <div className="flex flex-wrap items-center gap-2">
      <code className={VARIABLE_CHIP}>{`{{${variable}}}`}</code>
      <span className="text-sm text-muted-foreground">from</span>
      {hint ? (
        <Tooltip content={hint} position="top">
          {chip}
        </Tooltip>
      ) : (
        chip
      )}
    </div>
  );
}

/** What each of an evaluator's variables reads from the traces picked. */
export function TraceVariableValues({
  rows,
  outcome,
  agentNature,
  loading = false,
}: {
  rows: TraceVariableRow[];
  outcome: TraceVariableOutcome;
  agentNature?: AgentNature;
  loading?: boolean;
}) {
  return (
    <div className="border border-border rounded-md divide-y divide-border">
      {rows.map((row) => (
        <div key={row.variable} className="p-4 space-y-2">
          <VariableFromSource
            variable={row.variable}
            source={row.source}
            agentNature={agentNature}
          />
          {loading ? (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <SpinnerIcon className="w-4 h-4 animate-spin" />
              Loading
            </div>
          ) : (
            <Values row={row} outcome={outcome} agentNature={agentNature} />
          )}
        </div>
      ))}
    </div>
  );
}

function Values({
  row,
  outcome,
  agentNature,
}: {
  row: TraceVariableRow;
  outcome: TraceVariableOutcome;
  agentNature?: AgentNature;
}) {
  // No traces named, such as every trace the list matches: only where each
  // value comes from can be said.
  if (row.perTrace.length === 0) return null;
  if (row.perTrace.length === 1) {
    const { value } = row.perTrace[0];
    if (value !== null) {
      return (
        <p className="text-sm text-foreground whitespace-pre-wrap break-words">
          {value}
        </p>
      );
    }
    return (
      <WarningBox
        icon={
          <WarningTriangleIcon className="w-4 h-4 mt-0.5 flex-shrink-0 text-amber-600 dark:text-amber-400" />
        }
      >
        <MissingText source={row.source} agentNature={agentNature} sentence />
        {outcome === "tests"
          ? ", so the test will be added without this evaluator"
          : ", so this item will have it left blank"}
      </WarningBox>
    );
  }
  return (
    // Its own box inside the variable's, like the missing-values table.
    <div className="mt-3 border border-border rounded-md overflow-hidden">
      <table className="w-full text-sm">
        <thead className="bg-muted/30">
          <tr>
            <th className={`${SMALL_HEADING} text-left align-top px-3 py-2`}>
              Trace
            </th>
            <th className={`${SMALL_HEADING} text-left align-top px-3 py-2`}>
              Value
            </th>
          </tr>
        </thead>
        <tbody>
          {row.perTrace.map((t) => (
            <tr key={t.traceId} className="border-t border-border">
              <td className="px-3 py-2 align-top text-muted-foreground break-words">
                {t.label}
              </td>
              <td className="px-3 py-2 align-top break-words whitespace-pre-wrap">
                {t.value !== null ? (
                  <span className="text-foreground">{t.value}</span>
                ) : (
                  <span className="inline-flex items-center gap-1.5 text-amber-700 dark:text-amber-300">
                    <WarningTriangleIcon className="w-4 h-4 flex-shrink-0" />
                    <span>
                      <MissingText
                        source={row.source}
                        agentNature={agentNature}
                      />
                    </span>
                  </span>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
