"use client";

import { CloseIcon } from "@/components/icons";
import React, { useEffect, useState } from "react";
import { useHideFloatingButton } from "@/components/AppLayout";
import { SingleSelectPicker } from "@/components/SingleSelectPicker";
import { traceValue } from "@/components/agent-tabs/traceValue";
import { MAX_KEY_LENGTH } from "@/components/human-labelling/MetadataFieldsEditor";
import { SpinnerIcon, WarningTriangleIcon } from "@/components/icons";
import {
  CodeTabsBox,
  snippetBackendUrl,
} from "@/components/traces/CodeTabsBox";
import { KEY_PLACEHOLDER } from "@/components/traces/TraceIngestSnippet";
import { WarningBox } from "@/components/traces/WarningBox";
import {
  buildSnippet,
  type SnippetLanguage,
} from "@/components/traces/ingestSnippets";
import { ErrorNote } from "@/components/ui/ErrorNote";
import { useAccessToken } from "@/hooks";
import type { EvaluatorData } from "@/lib/evaluatorApi";
import { parseBackendErrorMessage } from "@/lib/parseBackendError";
import { formatRelativeTime } from "@/lib/relativeTime";
import { reportError } from "@/lib/reportError";
import {
  isMetadataSource,
  isMissingTraceValue,
  lowerFirst,
  METADATA_SOURCE,
  metadataKey,
  traceChoices,
  traceSourceLabel,
  traceSources,
} from "@/lib/traceScoring";
import {
  fetchTrace,
  fetchTraces,
  previewTraceVariables,
  type TraceDetail,
  type TraceSummary,
  type TraceVariablePreview,
} from "@/lib/tracesApi";

type TraceVariablesDialogProps = {
  agentUuid: string;
  evaluators: EvaluatorData[];
  agentNature: "conversation" | "general";
  onClose: () => void;
  onSave: (
    evaluatorUuid: string,
    traceVariables: Record<string, string>,
  ) => Promise<void>;
};

const RECENT_TRACES = 20;
const OTHER_KEY = "\u0000other";
const LATEST_HEADING = "Values from your latest trace";

const CHIP =
  "inline-flex self-start px-2 py-0.5 rounded-md text-sm font-mono font-semibold bg-blue-500/10 text-blue-700 dark:text-blue-300";
const CODE = "font-mono text-[13px] px-1 py-px rounded bg-amber-700/10";
const PILL =
  "flex-shrink-0 px-1.5 py-0.5 rounded bg-muted text-muted-foreground text-[11px] font-medium";
const BACK_BUTTON =
  "h-9 md:h-10 px-4 rounded-md text-sm md:text-base font-medium border border-border bg-background dark:bg-muted hover:bg-muted/50 dark:hover:bg-accent transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed";
const MAIN_BUTTON =
  "h-9 md:h-10 px-4 rounded-md text-sm md:text-base font-medium bg-foreground text-background hover:opacity-90 transition-opacity cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed";
const STEPS = [
  { n: 1, label: "Choose values" },
  { n: 2, label: "Test on a trace" },
] as const;

const chip = (name: string) => `{{${name}}}`;
const upperFirst = (text: string) => text[0].toUpperCase() + text.slice(1);

function Waiting() {
  return (
    <p className="flex items-center gap-2 text-sm text-muted-foreground">
      <SpinnerIcon className="w-4 h-4 animate-spin" />
      Loading
    </p>
  );
}

// Props shared by the pickers that sit beside a variable, so they look like `Select`.
const PICKER = {
  compact: true,
  className: "w-40",
  triggerClassName: "h-10 px-3 rounded-md",
  panelWidth: 300,
};

const latestHeading = () => (
  <p className="text-xs text-muted-foreground">{LATEST_HEADING}</p>
);

/** An option's name, with the value it would take under it when there is one. */
function OptionRow({
  name,
  detail,
  muted,
}: {
  name: string;
  /** Undefined draws no second line; null says the latest trace lacks it. */
  detail?: string | null;
  muted?: boolean;
}) {
  return (
    <span className="block min-w-0 flex-1">
      <span
        className={`block text-sm font-medium ${muted ? "text-muted-foreground" : ""}`}
      >
        {name}
      </span>
      {detail === null ? (
        <span className="block truncate text-xs italic text-muted-foreground/60">
          Not in the latest trace
        </span>
      ) : (
        detail !== undefined && (
          <span className="block truncate text-xs text-muted-foreground">
            {detail}
          </span>
        )
      )}
    </span>
  );
}

function TraceRow({ trace }: { trace: TraceSummary }) {
  return (
    <span className="flex items-center gap-2 min-w-0 text-sm">
      <span className={PILL}>Input</span>
      <span className="flex-1 min-w-0 truncate">{trace.input_preview}</span>
      <span className={PILL}>
        {upperFirst(formatRelativeTime(trace.created_at))}
      </span>
    </span>
  );
}

/** Mounted only while open, so every open starts from `evaluators`. */
export function TraceVariablesDialog({
  agentUuid,
  evaluators,
  agentNature,
  onClose,
  onSave,
}: TraceVariablesDialogProps) {
  // Hide the floating "Talk to Us" button while the modal is open.
  useHideFloatingButton(true);
  const accessToken = useAccessToken();

  const [saved, setSaved] = useState(evaluators);
  const [index, setIndex] = useState(() =>
    Math.max(0, evaluators.findIndex(isMissingTraceValue)),
  );
  // A Metadata row holds "metadata." plus whatever key has been typed so far.
  const [values, setValues] = useState<Record<string, string>>(
    () => saved[index].trace_variables ?? {},
  );
  // Whether a Metadata row types its key rather than picking it from the
  // latest trace. Unset means a saved key the latest trace lacks is typed.
  const [typed, setTyped] = useState<Record<string, boolean>>({});
  const [step, setStep] = useState<1 | 2>(1);
  const [traces, setTraces] = useState<TraceSummary[] | null>(null);
  const [latest, setLatest] = useState<TraceDetail | null>(null);
  const [traceUuid, setTraceUuid] = useState("");
  const [preview, setPreview] = useState<{
    key: string;
    values: TraceVariablePreview[];
    error: string | null;
  } | null>(null);
  const [language, setLanguage] = useState<SnippetLanguage>("curl");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const current = saved[index];
  const variables = current.live_version?.variables ?? [];
  const choices = traceChoices(
    Object.fromEntries(variables.map(({ name }) => [name, values[name] ?? ""])),
  );
  const complete = variables.every(({ name }) => choices[name]);
  const hasTraces = !!traces?.length;
  const othersMissing = saved.some(
    (e, i) => i !== index && isMissingTraceValue(e),
  );

  const sources = traceSources(agentNature);
  const orderedSources = [
    ...sources.filter((s) => s.value !== METADATA_SOURCE),
    ...sources.filter((s) => s.value === METADATA_SOURCE),
  ];
  const metaKeys = [...new Set((latest?.metadata ?? []).map((m) => m.key))];
  const latestValue = (source: string) =>
    latest ? traceValue(latest, source) : undefined;

  useEffect(() => {
    if (!accessToken) return;
    let live = true;
    (async () => {
      try {
        const { items } = await fetchTraces(accessToken, {
          agentId: agentUuid,
          limit: RECENT_TRACES,
          offset: 0,
        });
        if (!live) return;
        setTraces(items);
        if (items[0]) {
          const detail = await fetchTrace(accessToken, items[0].uuid);
          if (live) setLatest(detail);
        }
      } catch (err) {
        // With no traces to read, the dialog still saves in one step.
        reportError("Error fetching traces:", err);
        if (live) setTraces((t) => t ?? []);
      }
    })();
    return () => {
      live = false;
    };
  }, [accessToken, agentUuid]);

  const requestKey =
    step === 2 && traceUuid ? JSON.stringify([traceUuid, choices]) : null;
  const answer = preview?.key === requestKey ? preview : null;

  useEffect(() => {
    if (!accessToken || !requestKey) return;
    let live = true;
    const [traceId, traceVariables] = JSON.parse(requestKey);
    previewTraceVariables(accessToken, agentUuid, traceId, traceVariables).then(
      ({ values }) => {
        if (live) setPreview({ key: requestKey, values, error: null });
      },
      (err) => {
        if (!live) return;
        reportError("Error previewing trace values:", err);
        setPreview({
          key: requestKey,
          values: [],
          error: parseBackendErrorMessage(err, "Could not read this trace."),
        });
      },
    );
    return () => {
      live = false;
    };
  }, [accessToken, agentUuid, requestKey]);

  const setValue = (name: string, value: string, typing?: boolean) => {
    setValues((prev) => ({ ...prev, [name]: value }));
    setTyped((prev) => ({ ...prev, [name]: !!typing }));
  };

  const handleClose = () => {
    if (!saving) onClose();
  };

  const handleSave = async () => {
    try {
      setSaving(true);
      setError(null);
      await onSave(current.uuid, choices);
      const next = saved.map((e, i) =>
        i === index ? { ...e, trace_variables: choices } : e,
      );
      setSaved(next);
      // It opens on the first one missing a value, so none earlier is.
      const nextIndex = next.findIndex(
        (e, i) => i > index && isMissingTraceValue(e),
      );
      if (nextIndex < 0) {
        onClose();
        return;
      }
      setIndex(nextIndex);
      setValues(next[nextIndex].trace_variables ?? {});
      setTyped({});
      setTraceUuid("");
      setStep(1);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Failed to save trace values",
      );
    } finally {
      setSaving(false);
    }
  };

  // The code column: what a trace must carry, with the metadata the choices
  // read shown as entries and everything else left as "...".
  const metadata = [
    ...new Map(
      Object.values(choices)
        .filter(isMetadataSource)
        .map((source) => [
          metadataKey(source),
          {
            key: metadataKey(source),
            value: latestValue(source) ?? "...",
          },
        ]),
    ).values(),
  ];
  const snippet = buildSnippet(language, {
    backendUrl: snippetBackendUrl(),
    agentUuid,
    apiKey: KEY_PLACEHOLDER,
    agentNature,
    placeholders: true,
    metadata,
  });
  const lines = snippet.split("\n");
  const metaStart = lines.findIndex((l) => /^\s*"?metadata"?: \[$/.test(l));
  const metaEnd =
    metaStart < 0
      ? -1
      : lines.findIndex((l, i) => i > metaStart && l.trim() === "]");

  const sourceRow = (name: string) => {
    const value = values[name] ?? "";
    const isMeta = isMetadataSource(value);
    const key = metadataKey(value);
    const typing =
      isMeta &&
      (metaKeys.length === 0 ||
        (typed[name] ?? (key !== "" && !metaKeys.includes(key))));
    // A copy of an agent of another type can hold a value this agent's list
    // does not offer. Listing it stops a save nobody meant from dropping it.
    const savedValue = current.trace_variables?.[name];
    const offList =
      savedValue &&
      !isMetadataSource(savedValue) &&
      !sources.some((s) => s.value === savedValue)
        ? [{ value: savedValue, label: traceSourceLabel(savedValue) }]
        : [];
    return (
      <React.Fragment key={name}>
        <code className={CHIP}>{chip(name)}</code>
        <div className="flex gap-2">
          <SingleSelectPicker
            {...PICKER}
            ariaLabel={`Source for ${name}`}
            items={[...orderedSources, ...offList]}
            selectedId={isMeta ? METADATA_SOURCE : value}
            getId={(source) => source.value}
            placeholder="Not set"
            disabled={saving}
            renderHeader={latest ? latestHeading : undefined}
            renderTrigger={(source) =>
              source?.value === METADATA_SOURCE
                ? "Metadata"
                : traceSourceLabel(value, agentNature)
            }
            renderOption={(source) => (
              <OptionRow
                name={source.label}
                detail={
                  !latest
                    ? undefined
                    : source.value === METADATA_SOURCE
                      ? metaKeys.join(", ") || null
                      : latestValue(source.value)
                }
              />
            )}
            onSelect={({ value: next }) => {
              if (!(next === METADATA_SOURCE && isMeta)) setValue(name, next);
            }}
          />
          {isMeta && metaKeys.length > 0 && (
            <SingleSelectPicker
              {...PICKER}
              ariaLabel={`Metadata key list for ${name}`}
              items={[...metaKeys, OTHER_KEY]}
              selectedId={typing ? OTHER_KEY : key}
              getId={(k) => k}
              placeholder="Choose a key"
              disabled={saving}
              renderHeader={latestHeading}
              isItemSeparated={(k) => k === OTHER_KEY}
              renderTrigger={(k) => (k === OTHER_KEY ? "Other key" : k)}
              renderOption={(k) =>
                k === OTHER_KEY ? (
                  <OptionRow name="Other key" muted />
                ) : (
                  <OptionRow
                    name={k}
                    detail={latestValue(METADATA_SOURCE + k)}
                  />
                )
              }
              onSelect={(next) =>
                next === OTHER_KEY
                  ? setValue(name, METADATA_SOURCE, true)
                  : setValue(name, METADATA_SOURCE + next)
              }
            />
          )}
          {typing && (
            <input
              type="text"
              aria-label={`Metadata key for ${name}`}
              value={value.slice(METADATA_SOURCE.length)}
              onChange={(e) =>
                setValue(name, METADATA_SOURCE + e.target.value, true)
              }
              disabled={saving}
              maxLength={MAX_KEY_LENGTH}
              placeholder="Type a metadata key"
              className="w-40 h-10 px-3 rounded-md text-sm border border-border bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-accent"
            />
          )}
        </div>
      </React.Fragment>
    );
  };

  const chooseStep = (
    <div className="flex flex-col lg:flex-row">
      <div className="flex-1 min-w-0 p-4 md:p-6">
        <div className="grid grid-cols-[max-content_max-content] gap-x-6 gap-y-3 items-center content-start text-sm whitespace-nowrap">
          <span className="text-xs font-medium text-muted-foreground">
            Variable
          </span>
          <span className="text-xs font-medium text-muted-foreground">
            Comes from
          </span>
          {variables.map(({ name }) => sourceRow(name))}
        </div>
      </div>
      <div className="lg:w-[520px] flex-shrink-0 border-t lg:border-t-0 lg:border-l border-border p-4 md:p-6 space-y-2 min-w-0">
        <p className="text-sm font-medium text-foreground">
          What your code needs to send
        </p>
        <CodeTabsBox
          code={snippet}
          language={language}
          onLanguageChange={setLanguage}
          testId="trace-send-code"
          renderLine={(line, i) =>
            i >= metaStart && i <= metaEnd && metaStart >= 0 ? (
              <span
                data-highlighted
                className="block bg-amber-500/15 -mx-4 px-4"
              >
                {line}
              </span>
            ) : (
              `${line}${i < lines.length - 1 ? "\n" : ""}`
            )
          }
        />
      </div>
    </div>
  );

  const missing = [
    ...new Set(
      answer?.values.filter((v) => v.value === null).map((v) => v.source) ?? [],
    ),
  ];
  const selectedTrace = traces?.find((t) => t.uuid === traceUuid);

  const testStep = (
    <div className="p-4 md:p-6 space-y-4">
      <div className="space-y-2">
        <p className="text-sm font-medium text-foreground">Select a trace</p>
        {traces && traces.length > 0 && (
          <SingleSelectPicker
            compact
            triggerClassName="h-10 px-3 rounded-md"
            ariaLabel="Select a trace"
            items={traces ?? []}
            selectedId={traceUuid}
            getId={(trace) => trace.uuid}
            placeholder="Choose a trace"
            renderTrigger={(trace) => trace && <TraceRow trace={trace} />}
            renderOption={(trace) => <TraceRow trace={trace} />}
            onSelect={(trace) => setTraceUuid(trace.uuid)}
          />
        )}
      </div>
      {selectedTrace && (
        <div className="space-y-2">
          <p className="text-sm font-medium text-foreground">
            What the evaluator will be given from this trace
          </p>
          <div className="border border-border rounded-md divide-y divide-border">
            {variables.map(({ name }) => {
              const source = choices[name];
              const value = answer?.values.find((v) => v.variable === name);
              return (
                <div key={name} className="p-4 flex flex-col gap-2">
                  <code className={CHIP}>{chip(name)}</code>
                  {!answer ? (
                    <Waiting />
                  ) : value?.value === null ? (
                    <div className="flex items-start gap-2 rounded-md border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-sm text-amber-700 dark:text-amber-300">
                      <WarningTriangleIcon className="w-4 h-4 mt-0.5 flex-shrink-0" />
                      <p>
                        {isMetadataSource(source) ? (
                          <>
                            This trace has no metadata entry called{" "}
                            <code className={CODE}>{metadataKey(source)}</code>
                          </>
                        ) : (
                          `This trace has no ${lowerFirst(traceSourceLabel(source, agentNature))}`
                        )}
                      </p>
                    </div>
                  ) : (
                    value && (
                      <p className="text-sm text-foreground whitespace-pre-wrap break-words max-h-40 overflow-y-auto">
                        {value.value}
                      </p>
                    )
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}
      {answer?.error && <ErrorNote>{answer.error}</ErrorNote>}
      {missing.length > 0 && (
        <WarningBox>
          This evaluator will not score traces like this one. Send{" "}
          {missing.map((source, i) => (
            <React.Fragment key={source}>
              {i > 0 && " and "}
              {isMetadataSource(source) ? (
                <>
                  a <code className={CODE}>{metadataKey(source)}</code> entry in
                  each trace&apos;s metadata
                </>
              ) : (
                `the ${lowerFirst(traceSourceLabel(source, agentNature))} in each trace`
              )}
            </React.Fragment>
          ))}
          , or go back to the first step and choose a different value.
        </WarningBox>
      )}
    </div>
  );

  const saveButton = (
    <button
      onClick={handleSave}
      disabled={saving || !complete}
      className={MAIN_BUTTON}
    >
      {saving ? "Saving..." : othersMissing ? "Save and next" : "Save"}
    </button>
  );

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4"
      onClick={handleClose}
    >
      <div
        className={`bg-background border border-border rounded-xl w-full shadow-2xl flex flex-col max-h-[90vh] ${
          step === 2 ? "max-w-4xl" : "max-w-7xl"
        }`}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header + stepper */}
        <div className="px-5 md:px-6 py-5 md:py-6 border-b border-border">
          <div className="flex items-start justify-between gap-3">
            <div>
              <h2 className="text-base md:text-lg font-semibold text-foreground">
                Configure for traces
              </h2>
              <p className="text-xs md:text-sm text-muted-foreground mt-1.5">
                This evaluator has variables. Map each one to a part of the
                trace so it can run on traces.
              </p>
            </div>
            <button
              onClick={handleClose}
              disabled={saving}
              aria-label="Close"
              className="flex items-center justify-center w-8 h-8 rounded-md hover:bg-muted transition-colors cursor-pointer flex-shrink-0 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <CloseIcon className="w-5 h-5" />
            </button>
          </div>
          {hasTraces && (
            <>
              <div className="mt-5">
                <WarningBox>
                  Applies to new traces only. Existing traces are not scored
                  again.
                </WarningBox>
              </div>
              <div className="mt-5 flex items-center gap-2">
                {STEPS.map((s, i) => {
                  const active = step === s.n;
                  const done = !active && s.n === 1;
                  return (
                    <div key={s.n} className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => setStep(s.n)}
                        disabled={saving || (s.n === 2 && !complete)}
                        className="flex items-center gap-2 cursor-pointer group disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        <span
                          className={`flex items-center justify-center w-6 h-6 rounded-full text-xs font-semibold transition-colors ${
                            active
                              ? "bg-foreground text-background"
                              : done
                                ? "bg-teal-500/15 text-teal-700 dark:text-teal-300 border border-teal-500/40"
                                : "bg-muted text-muted-foreground"
                          }`}
                        >
                          {done ? "✓" : s.n}
                        </span>
                        <span
                          className={`text-xs md:text-sm font-medium transition-colors ${
                            active
                              ? "text-foreground"
                              : "text-muted-foreground group-hover:text-foreground"
                          }`}
                        >
                          {s.label}
                        </span>
                      </button>
                      {i < STEPS.length - 1 && (
                        <span className="w-6 h-px bg-border" />
                      )}
                    </div>
                  );
                })}
              </div>
            </>
          )}
        </div>

        {/* Body */}
        <div className="flex-1 min-h-0 overflow-y-auto">
          {error && (
            <div className="px-4 md:px-6 pt-4 md:pt-6">
              <ErrorNote>{error}</ErrorNote>
            </div>
          )}
          {traces === null ? (
            <div className="p-4 md:p-6">
              <Waiting />
            </div>
          ) : step === 1 ? (
            chooseStep
          ) : (
            testStep
          )}
        </div>

        {/* Footer: dismissal is the header ✕, so no Close here. */}
        <div className="flex items-center justify-end gap-2 md:gap-3 px-5 md:px-6 py-4 border-t border-border">
          {saved.length > 1 && (
            <p className="mr-auto text-sm text-muted-foreground">
              Evaluator {index + 1} of {saved.length}: {current.name}
            </p>
          )}
          {traces !== null &&
            (!hasTraces ? (
              saveButton
            ) : step === 1 ? (
              <button
                onClick={() => setStep(2)}
                disabled={!complete}
                className={MAIN_BUTTON}
              >
                Next
              </button>
            ) : (
              <>
                <button
                  onClick={() => setStep(1)}
                  disabled={saving}
                  className={BACK_BUTTON}
                >
                  Back
                </button>
                {saveButton}
              </>
            ))}
        </div>
      </div>
    </div>
  );
}
