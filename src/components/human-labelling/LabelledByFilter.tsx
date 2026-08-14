"use client";

import React, { useEffect, useRef, useState } from "react";

/**
 * "Labelled by" filter for the items table on the labelling task page.
 * Shows only items someone has labelled, or only items labelled by the
 * people picked here.
 *
 * The two modes are exclusive: an item labelled by a named person is by
 * definition labelled by someone, so holding both at once adds nothing.
 */

export type LabelledByFilter = { anyone: boolean; annotatorIds: string[] };

export const EMPTY_LABELLED_BY_FILTER: LabelledByFilter = {
  anyone: false,
  annotatorIds: [],
};

export function isLabelledByFilterActive(f: LabelledByFilter): boolean {
  return f.anyone || f.annotatorIds.length > 0;
}

export type LabelledByAnnotator = { uuid: string; name?: string | null };

export function annotatorFilterName(a: LabelledByAnnotator): string {
  return a.name?.trim() || a.uuid.slice(0, 8);
}

// Same tag look as ItemValueFilter: solid foreground on background.
const tagClass =
  "h-7 pl-3 pr-1.5 rounded-full text-xs font-medium border border-foreground bg-foreground text-background inline-flex items-center gap-2";

function RemoveButton({
  label,
  onClick,
}: {
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      aria-label={`Remove ${label}`}
      onClick={onClick}
      className="w-4 h-4 rounded-full inline-flex items-center justify-center opacity-70 hover:opacity-100 hover:bg-background/25 transition-opacity cursor-pointer"
    >
      <svg
        className="w-2.5 h-2.5"
        fill="none"
        viewBox="0 0 24 24"
        stroke="currentColor"
        strokeWidth={3}
      >
        <path strokeLinecap="round" d="M6 6l12 12M18 6L6 18" />
      </svg>
    </button>
  );
}

function ToggleRow({
  label,
  checked,
  onClick,
}: {
  label: string;
  checked: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      aria-pressed={checked}
      onClick={onClick}
      className="w-full flex items-center gap-2.5 px-2.5 py-1.5 rounded-md text-sm text-left hover:bg-muted/60 transition-colors cursor-pointer"
    >
      {/* A plain mark, not SelectCheckbox — that renders a button, and a
          button inside this row's button is invalid nesting. */}
      <span
        aria-hidden="true"
        className={`w-4 h-4 shrink-0 rounded border inline-flex items-center justify-center ${
          checked
            ? "bg-foreground border-foreground text-background"
            : "border-foreground/40"
        }`}
      >
        {checked && (
          <svg
            className="w-2.5 h-2.5"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={4}
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M5 13l4 4L19 7"
            />
          </svg>
        )}
      </span>
      <span className="truncate">{label}</span>
    </button>
  );
}

export function LabelledByFilterControl({
  annotators,
  filter,
  onChange,
}: {
  annotators: readonly LabelledByAnnotator[];
  filter: LabelledByFilter;
  onChange: (next: LabelledByFilter) => void;
}) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  // Nothing to filter by yet. A filter that is already on always keeps its
  // tags, even if the people it names have since dropped off the task
  // (their items deleted, their job removed), so the reader can always see
  // why the list is short and switch the filter off.
  if (annotators.length === 0 && !isLabelledByFilterActive(filter)) return null;

  const picked = filter.annotatorIds.map(
    (id) => annotators.find((a) => a.uuid === id) ?? { uuid: id },
  );
  const tagCount = (filter.anyone ? 1 : 0) + picked.length;

  const toggleAnnotator = (uuid: string) => {
    const on = filter.annotatorIds.includes(uuid);
    onChange({
      anyone: false,
      annotatorIds: on
        ? filter.annotatorIds.filter((id) => id !== uuid)
        : [...filter.annotatorIds, uuid],
    });
  };

  return (
    <div ref={rootRef} className="relative flex items-center gap-2 flex-wrap">
      {filter.anyone && (
        <span className={tagClass}>
          <span className="font-semibold">Labelled by anyone</span>
          <RemoveButton
            label="Labelled by anyone"
            onClick={() => onChange({ ...filter, anyone: false })}
          />
        </span>
      )}

      {picked.map((a) => {
        const label = `Labelled by ${annotatorFilterName(a)}`;
        return (
          <span key={a.uuid} className={tagClass}>
            <span className="font-semibold">{label}</span>
            <RemoveButton
              label={label}
              onClick={() =>
                onChange({
                  ...filter,
                  annotatorIds: filter.annotatorIds.filter(
                    (id) => id !== a.uuid,
                  ),
                })
              }
            />
          </span>
        );
      })}

      <button
        type="button"
        onClick={() => setOpen((p) => !p)}
        className={`h-7 px-3 rounded-full text-xs font-medium border border-dashed transition-colors cursor-pointer ${
          open
            ? "border-foreground text-foreground"
            : "border-border text-muted-foreground hover:border-foreground/40 hover:text-foreground"
        }`}
      >
        + Labelled by
      </button>

      {tagCount > 1 && (
        <button
          type="button"
          onClick={() => onChange(EMPTY_LABELLED_BY_FILTER)}
          className="text-xs text-muted-foreground underline underline-offset-2 hover:text-foreground transition-colors cursor-pointer"
        >
          Clear all
        </button>
      )}

      {open && (
        <div className="absolute left-0 top-full z-30 mt-1.5 w-60 rounded-lg border border-border bg-background shadow-lg p-1">
          <p className="px-2.5 pt-1.5 pb-1 text-[11px] text-muted-foreground">
            Labelled by
          </p>
          <ToggleRow
            label="Anyone"
            checked={filter.anyone}
            onClick={() =>
              onChange({ anyone: !filter.anyone, annotatorIds: [] })
            }
          />
          {annotators.map((a) => (
            <ToggleRow
              key={a.uuid}
              label={annotatorFilterName(a)}
              checked={filter.annotatorIds.includes(a.uuid)}
              onClick={() => toggleAnnotator(a.uuid)}
            />
          ))}
        </div>
      )}
    </div>
  );
}
