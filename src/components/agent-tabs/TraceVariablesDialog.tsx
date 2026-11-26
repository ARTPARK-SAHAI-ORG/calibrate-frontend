"use client";

import React, { useState } from "react";
import { useHideFloatingButton } from "@/components/AppLayout";
import { Select } from "@/components/ui/Select";
import { TraceVariablesPreview } from "@/components/agent-tabs/TraceVariablesPreview";
import { MAX_KEY_LENGTH } from "@/components/human-labelling/MetadataFieldsEditor";
import type { EvaluatorData } from "@/lib/evaluatorApi";
import {
  isMetadataSource,
  isMissingTraceValue,
  METADATA_SOURCE,
  metadataKey,
  missingTraceValues,
  traceChoices,
  traceSourceLabel,
  traceSources,
} from "@/lib/traceScoring";

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

  // What the server holds, which is what the left column reports on.
  const [saved, setSaved] = useState(evaluators);
  // What has been typed, per evaluator. A Metadata row holds "metadata." plus
  // whatever key has been typed so far.
  const [drafts, setDrafts] = useState<Record<string, Record<string, string>>>(
    () =>
      Object.fromEntries(
        evaluators.map((e) => [e.uuid, e.trace_variables ?? {}]),
      ),
  );
  const [selectedUuid, setSelectedUuid] = useState(
    () => (evaluators.find(isMissingTraceValue) ?? evaluators[0]).uuid,
  );
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const selectedIndex = saved.findIndex((e) => e.uuid === selectedUuid);
  const selected = saved[selectedIndex];
  const variables = selected.live_version?.variables ?? [];
  const values = drafts[selectedUuid];
  const hasSeveral = saved.length > 1;
  const choicesFor = (e: EvaluatorData) =>
    traceChoices(
      Object.fromEntries(
        (e.live_version?.variables ?? []).map(({ name }) => [
          name,
          drafts[e.uuid][name] ?? "",
        ]),
      ),
    );
  // A value still missing, or an edit not saved yet.
  const needsSave = (e: EvaluatorData) => {
    const draft = choicesFor(e);
    return (
      isMissingTraceValue(e) ||
      (e.live_version?.variables ?? []).some(
        ({ name }) => draft[name] !== e.trace_variables?.[name],
      )
    );
  };
  const othersNeedSave = saved.some(
    (e) => e.uuid !== selectedUuid && needsSave(e),
  );
  const sources = traceSources(agentNature);
  const choices = choicesFor(selected);

  const setValue = (name: string, value: string) =>
    setDrafts((prev) => ({
      ...prev,
      [selectedUuid]: { ...prev[selectedUuid], [name]: value },
    }));

  // Every variable needs a value: a judge with any left unset never scores.
  const incomplete = variables.some(({ name }) => !choices[name]);
  const hasUnsetVariable = variables.some(({ name }) => !values[name]);

  const handleClose = () => {
    if (!saving) onClose();
  };

  const handleSelect = (uuid: string) => {
    setSelectedUuid(uuid);
    setError(null);
  };

  const handleSave = async () => {
    try {
      setSaving(true);
      setError(null);
      await onSave(selectedUuid, choices);
      const next = saved.map((e) =>
        e.uuid === selectedUuid ? { ...e, trace_variables: choices } : e,
      );
      setSaved(next);
      setDrafts((prev) => ({ ...prev, [selectedUuid]: choices }));
      const nextMissing = [
        ...next.slice(selectedIndex + 1),
        ...next.slice(0, selectedIndex),
      ].find(needsSave);
      if (nextMissing) setSelectedUuid(nextMissing.uuid);
      else onClose();
    } catch (err) {
      // Keep the dialog open and surface the failure instead of closing as if
      // the save succeeded.
      setError(
        err instanceof Error ? err.message : "Failed to save trace values",
      );
    } finally {
      setSaving(false);
    }
  };

  const form = (
    <div key={selectedUuid} className="space-y-4">
      <div>
        <h3 className="text-sm md:text-base font-semibold text-foreground">
          {selected.name}
        </h3>
        {selected.description && (
          <p className="text-xs md:text-sm text-muted-foreground mt-1">
            {selected.description}
          </p>
        )}
      </div>
      {variables.map(({ name, description }) => {
        const value = values[name] ?? "";
        // A copy of an agent of another type can hold a value this agent's list
        // does not offer. Showing it stops it reading as Not set and being
        // dropped by a save nobody meant to change it.
        const savedValue = selected.trace_variables?.[name];
        const offList =
          savedValue &&
          !isMetadataSource(savedValue) &&
          !sources.some((source) => source.value === savedValue)
            ? savedValue
            : null;
        return (
          <div key={name} className="space-y-2">
            <div>
              <label
                htmlFor={`trace-variable-${name}`}
                className="block text-sm font-medium font-mono text-foreground break-all"
              >
                {`{{${name}}}`}
              </label>
              {description && (
                <p className="text-xs text-muted-foreground mt-1">
                  {description}
                </p>
              )}
            </div>
            <Select
              id={`trace-variable-${name}`}
              value={isMetadataSource(value) ? METADATA_SOURCE : value}
              onChange={(e) => setValue(name, e.target.value)}
              disabled={saving}
              className="cursor-pointer"
            >
              <option value="">Not set</option>
              {sources.map((source) => (
                <option key={source.value} value={source.value}>
                  {source.label}
                </option>
              ))}
              {offList && (
                <option value={offList}>{traceSourceLabel(offList)}</option>
              )}
            </Select>
            {isMetadataSource(value) && (
              <input
                type="text"
                aria-label={`Metadata key for ${name}`}
                value={value.slice(METADATA_SOURCE.length)}
                onChange={(e) =>
                  setValue(name, METADATA_SOURCE + e.target.value)
                }
                disabled={saving}
                maxLength={MAX_KEY_LENGTH}
                placeholder="Metadata key, for example expert_answer"
                className="w-full h-10 px-3 rounded-md text-sm border border-border bg-background focus:outline-none focus:ring-2 focus:ring-accent focus:border-transparent"
              />
            )}
            {isMetadataSource(value) && !metadataKey(value) && (
              <p className="text-xs text-muted-foreground">
                Type the metadata key to save
              </p>
            )}
          </div>
        );
      })}
      {hasUnsetVariable && (
        <p className="text-xs text-muted-foreground">
          Choose a value for every variable to save
        </p>
      )}
      <p className="text-xs text-muted-foreground">
        Applies to new traces. Traces that already arrived are not scored again.
      </p>
    </div>
  );

  const preview = (
    <TraceVariablesPreview
      agentUuid={agentUuid}
      agentNature={agentNature}
      variables={variables.map(({ name }) => name)}
      choices={choices}
    />
  );

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4"
      onClick={handleClose}
    >
      <div
        className={`bg-background border border-border rounded-xl w-full shadow-2xl flex flex-col max-h-[90vh] ${
          hasSeveral ? "max-w-7xl lg:h-[85vh]" : "max-w-4xl"
        }`}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-start justify-between gap-3 px-5 md:px-6 py-4 border-b border-border">
          <div>
            <h2 className="text-base md:text-lg font-semibold text-foreground">
              Choose trace values
            </h2>
            <p className="text-xs md:text-sm text-muted-foreground mt-1">
              Choose which part of each trace fills each variable
            </p>
          </div>
          <button
            onClick={handleClose}
            disabled={saving}
            className="flex items-center justify-center w-8 h-8 rounded-md hover:bg-muted transition-colors cursor-pointer flex-shrink-0 disabled:opacity-50 disabled:cursor-not-allowed"
            aria-label="Close"
          >
            <svg
              className="w-5 h-5"
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

        {/* Body */}
        {hasSeveral ? (
          <div className="flex-1 min-h-0 overflow-y-auto lg:overflow-hidden p-4 md:p-6">
            <div className="flex flex-col lg:flex-row gap-3 lg:gap-4 lg:h-full lg:min-h-0">
              <div className="lg:flex-1 lg:min-w-0 border border-border rounded-md overflow-y-auto divide-y divide-border max-h-60 lg:max-h-none lg:h-full">
                {saved.map((evaluator) => {
                  const total = evaluator.live_version?.variables?.length ?? 0;
                  const missing = missingTraceValues(evaluator).length;
                  const isSelected = evaluator.uuid === selectedUuid;
                  return (
                    <button
                      key={evaluator.uuid}
                      type="button"
                      aria-current={isSelected ? "true" : undefined}
                      onClick={() => handleSelect(evaluator.uuid)}
                      disabled={saving}
                      className={`w-full flex items-center justify-between gap-3 px-3 py-2.5 text-left cursor-pointer transition-colors disabled:cursor-not-allowed ${
                        isSelected ? "bg-muted" : "hover:bg-muted/50"
                      }`}
                    >
                      <span className="text-sm font-medium text-foreground min-w-0 break-words">
                        {evaluator.name}
                      </span>
                      {missing > 0 ? (
                        <span className="text-xs text-yellow-700 dark:text-yellow-500 flex-shrink-0">
                          {missing} of {total} missing
                        </span>
                      ) : (
                        <span className="text-xs text-emerald-700 dark:text-emerald-400 flex-shrink-0">
                          All set
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>
              <div className="lg:flex-1 lg:min-w-0 lg:overflow-y-auto lg:h-full lg:min-h-0">
                {form}
              </div>
              <div className="lg:flex-1 lg:min-w-0 lg:overflow-y-auto lg:h-full lg:min-h-0">
                {preview}
              </div>
            </div>
          </div>
        ) : (
          <div className="flex-1 min-h-0 overflow-y-auto p-4 md:p-6">
            <div className="flex flex-col md:flex-row gap-6">
              <div className="md:flex-1 md:min-w-0">{form}</div>
              <div className="md:flex-1 md:min-w-0">{preview}</div>
            </div>
          </div>
        )}

        {/* Footer */}
        <div className="flex flex-col gap-2 px-5 md:px-6 py-4 border-t border-border">
          {error && (
            <p
              role="alert"
              className="text-sm text-red-600 dark:text-red-400 text-right"
            >
              {error}
            </p>
          )}
          <div className="flex items-center justify-end gap-2 md:gap-3">
            {hasSeveral && (
              <p className="mr-auto text-sm text-muted-foreground">
                Evaluator {selectedIndex + 1} of {saved.length}
              </p>
            )}
            <button
              onClick={handleClose}
              disabled={saving}
              className="h-9 md:h-10 px-4 rounded-md text-sm md:text-base font-medium border border-border bg-background dark:bg-muted hover:bg-muted/50 dark:hover:bg-accent transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Close
            </button>
            <button
              onClick={handleSave}
              disabled={saving || incomplete}
              className="h-9 md:h-10 px-4 rounded-md text-sm md:text-base font-medium bg-foreground text-background hover:opacity-90 transition-opacity cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
            >
              {saving && (
                <svg
                  className="w-4 h-4 animate-spin"
                  fill="none"
                  viewBox="0 0 24 24"
                >
                  <circle
                    className="opacity-25"
                    cx="12"
                    cy="12"
                    r="10"
                    stroke="currentColor"
                    strokeWidth="4"
                  />
                  <path
                    className="opacity-75"
                    fill="currentColor"
                    d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                  />
                </svg>
              )}
              {saving ? "Saving..." : othersNeedSave ? "Save and next" : "Save"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
