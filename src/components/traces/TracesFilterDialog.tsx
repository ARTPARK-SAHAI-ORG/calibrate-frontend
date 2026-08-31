"use client";

import React, { useState } from "react";
import { useHideFloatingButton } from "@/components/AppLayout";
import { MultiSelectPicker } from "@/components/MultiSelectPicker";
import { SegmentedFilter } from "@/components/ui";
import {
  countTraceFilters,
  NO_TRACE_FILTERS,
  type TraceFilterValues,
  type TraceOutputFilter,
} from "@/lib/tracesApi";

/** What the agent did on the turn: replied, or called tools instead. A trace
 *  that both replied and called tools counts as a reply. */
const OUTPUT_FILTER_OPTIONS: { value: TraceOutputFilter; label: string }[] = [
  { value: "all", label: "All" },
  { value: "response", label: "Response" },
  { value: "tool_call", label: "Tool call" },
];

const FIELD_CLASSES =
  "w-full h-10 px-3 rounded-md border border-border bg-background text-sm " +
  "text-foreground placeholder:text-muted-foreground focus:outline-none " +
  "focus:ring-2 focus:ring-foreground/20";

type TracesFilterDialogProps = {
  isOpen: boolean;
  onClose: () => void;
  /** The filters currently narrowing the list. */
  value: TraceFilterValues;
  /** Called with the new filters when the reader applies them. */
  onApply: (filters: TraceFilterValues) => void;
  /** Every label this agent's traces carry. */
  allLabels: string[];
  /** Every metadata key this agent's traces carry. */
  allMetadataKeys: string[];
};

function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-2">
      <label className="block text-sm font-medium text-foreground">
        {label}
      </label>
      {children}
      {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
    </div>
  );
}

/** One tick-many-of-these filter. The whole set comes from the backend, so an
 *  agent that has sent none gets a sentence saying so rather than an empty
 *  menu it can do nothing with. */
function ValuePicker({
  label,
  noun,
  hint,
  nothingSent,
  all,
  picked,
  onChange,
}: {
  label: string;
  /** What the values are called, for the two search-and-pick texts. */
  noun: string;
  hint: string;
  nothingSent: string;
  all: string[];
  picked: string[];
  onChange: (picked: string[]) => void;
}) {
  const asItems = (values: string[]) =>
    values.map((value) => ({ uuid: value, name: value }));
  return (
    <Field label={label} hint={all.length > 0 ? hint : nothingSent}>
      <MultiSelectPicker
        items={asItems(all)}
        selectedItems={asItems(picked)}
        onSelectionChange={(items) => onChange(items.map((i) => i.uuid))}
        placeholder={`All ${noun}`}
        searchPlaceholder={`Search ${noun}`}
        disabled={all.length === 0}
        className="w-full"
      />
    </Field>
  );
}

/**
 * The filter window for the Traces tab. Everything that narrows the list other
 * than the search box lives here, so the toolbar stays one search box and one
 * button however many filters there are.
 *
 * The draft is local until Apply: setting three filters is one reload of the
 * list, not three, and a reader who changes their mind can just close it.
 */
export function TracesFilterDialog({
  isOpen,
  ...rest
}: TracesFilterDialogProps) {
  useHideFloatingButton(isOpen);
  // The body is mounted only while the window is open, so its draft starts
  // from what is actually filtering the list every time: an abandoned edit
  // from last time can never be mistaken for what is on.
  return isOpen ? <FilterDialogBody {...rest} /> : null;
}

function FilterDialogBody({
  onClose,
  value,
  onApply,
  allLabels,
  allMetadataKeys,
}: Omit<TracesFilterDialogProps, "isOpen">) {
  const [draft, setDraft] = useState<TraceFilterValues>(value);

  const set = <K extends keyof TraceFilterValues>(
    key: K,
    next: TraceFilterValues[K],
  ) => setDraft((current) => ({ ...current, [key]: next }));

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Filter traces"
        className="bg-background rounded-xl w-full max-w-3xl max-h-[90vh] flex flex-col shadow-2xl"
      >
        <div className="p-5 md:p-6 border-b border-border">
          <div className="flex items-start justify-between gap-3">
            <h2 className="text-base md:text-lg font-semibold text-foreground">
              Filter traces
            </h2>
            {/* Up here rather than beside Apply, so the buttons that leave the
                window stay the only two at the bottom. */}
            {countTraceFilters(draft) > 0 && (
              <button
                type="button"
                onClick={() => setDraft(NO_TRACE_FILTERS)}
                className="text-sm font-medium text-muted-foreground hover:text-foreground transition-colors cursor-pointer"
              >
                Clear all
              </button>
            )}
          </div>
          <p className="text-sm text-muted-foreground mt-1">
            Show only the traces you want to look at. Filters apply to every
            trace, not only the ones on this page.
          </p>
        </div>

        <div className="flex-1 min-h-0 overflow-y-auto p-5 md:p-6 space-y-5">
          <Field
            label="Output"
            hint="A trace that replied and also called tools counts as a response."
          >
            <SegmentedFilter
              value={draft.outputType}
              onChange={(next) => set("outputType", next)}
              options={OUTPUT_FILTER_OPTIONS}
              className="w-fit"
              ariaLabel="Filter traces by output"
            />
          </Field>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
            <Field
              label="Input contains"
              hint="Text in what the agent was asked."
            >
              <input
                type="text"
                value={draft.inputContains}
                onChange={(e) => set("inputContains", e.target.value)}
                placeholder="Any input"
                className={FIELD_CLASSES}
              />
            </Field>

            <Field
              label="Output contains"
              hint="Text in the reply or the tool calls."
            >
              <input
                type="text"
                value={draft.outputContains}
                onChange={(e) => set("outputContains", e.target.value)}
                placeholder="Any output"
                className={FIELD_CLASSES}
              />
            </Field>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
            <ValuePicker
              label="Labels"
              noun="labels"
              hint="A trace matches when it carries any of the labels you pick."
              nothingSent="This agent has not sent any labels with its traces yet."
              all={allLabels}
              picked={draft.labels}
              onChange={(picked) => set("labels", picked)}
            />

            <ValuePicker
              label="Metadata keys"
              noun="metadata keys"
              hint="A trace matches when it carries any of the keys you pick. To match a value, use the search box."
              nothingSent="This agent has not sent any metadata with its traces yet."
              all={allMetadataKeys}
              picked={draft.metadataKeys}
              onChange={(picked) => set("metadataKeys", picked)}
            />
          </div>
        </div>

        <div className="flex items-center justify-end gap-2 md:gap-3 p-5 md:p-6 border-t border-border">
          <button
            type="button"
            onClick={onClose}
            className="h-9 md:h-10 px-4 rounded-md text-xs md:text-sm font-medium border border-border bg-background hover:bg-muted/50 transition-colors cursor-pointer"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={() => {
              onApply(draft);
              onClose();
            }}
            className="h-9 md:h-10 px-4 rounded-md text-xs md:text-sm font-medium bg-foreground text-background hover:opacity-90 transition-opacity cursor-pointer"
          >
            Apply
          </button>
        </div>
      </div>
    </div>
  );
}
