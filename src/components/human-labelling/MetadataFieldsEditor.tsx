import React from "react";
import type { MetadataEntry } from "@/components/ui";
import { FieldError } from "@/components/ui/FieldError";

export type MetadataRow = { key: string; value: string };

/** The backend's limits on one item's metadata. */
export const MAX_METADATA_ENTRIES = 100;
const MAX_KEY_LENGTH = 256;
const MAX_VALUE_LENGTH = 8192;

const RemoveIcon = ({ className }: { className: string }) => (
  <svg
    className={className}
    fill="none"
    viewBox="0 0 24 24"
    stroke="currentColor"
    strokeWidth={2}
  >
    <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
  </svg>
);

/** A row with nothing typed in it is ignored on save, so it never blocks. */
const isBlankRow = (row: MetadataRow) => !row.key.trim() && !row.value.trim();

/** One message per row that cannot be saved, keyed by row index. */
export function metadataRowErrors(rows: MetadataRow[]): Record<number, string> {
  const errors: Record<number, string> = {};
  const seen = new Set<string>();
  rows.forEach((row, index) => {
    if (isBlankRow(row)) return;
    const key = row.key.trim();
    if (!key) {
      errors[index] = "Add a field name for this value";
    } else if (seen.has(key)) {
      errors[index] = `"${key}" is already used by another field. Use a different name.`;
    }
    seen.add(key);
  });
  return errors;
}

export function rowsToMetadata(rows: MetadataRow[]): MetadataEntry[] {
  return rows
    .filter((row) => !isBlankRow(row))
    .map((row) => ({ key: row.key.trim(), value: row.value }));
}

export function metadataToRows(entries?: MetadataEntry[] | null): MetadataRow[] {
  return (entries ?? []).map((entry) => ({ key: entry.key, value: entry.value }));
}

const inputClass =
  "flex-1 min-w-0 h-9 md:h-10 px-3 md:px-4 rounded-md text-sm md:text-base border bg-background text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-accent";
const removeClass =
  "w-8 h-8 flex items-center justify-center rounded-md text-muted-foreground hover:text-red-500 hover:bg-red-500/10 transition-colors cursor-pointer flex-shrink-0";

/** Key-value rows for an item's metadata, the same rows the agent connection
 *  tab uses for headers. The owner holds the rows; `metadataRowErrors` says
 *  which cannot be saved and `rowsToMetadata` turns them into what the API
 *  takes. */
export function MetadataFieldsEditor({
  rows,
  onRowsChange,
  disabled = false,
}: {
  rows: MetadataRow[];
  onRowsChange: (rows: MetadataRow[]) => void;
  disabled?: boolean;
}) {
  const errors = metadataRowErrors(rows);
  const update = (index: number, field: keyof MetadataRow, value: string) =>
    onRowsChange(rows.map((row, i) => (i === index ? { ...row, [field]: value } : row)));
  const remove = (index: number) => onRowsChange(rows.filter((_, i) => i !== index));

  return (
    <div className="space-y-2">
      <label className="block text-base font-medium text-foreground">Metadata</label>
      <div className="space-y-2">
        {rows.map((row, index) => (
          <div key={index}>
            <div className="flex flex-wrap md:flex-nowrap items-center gap-2">
              <input
                type="text"
                value={row.key}
                maxLength={MAX_KEY_LENGTH}
                aria-invalid={Boolean(errors[index])}
                data-metadata-error={errors[index] ? "" : undefined}
                onChange={(e) => update(index, "key", e.target.value)}
                placeholder="Field name"
                aria-label={`Metadata field name ${index + 1}`}
                disabled={disabled}
                className={`${inputClass} ${errors[index] ? "border-red-500" : "border-border"}`}
              />
              <input
                type="text"
                value={row.value}
                maxLength={MAX_VALUE_LENGTH}
                onChange={(e) => update(index, "value", e.target.value)}
                placeholder="Value"
                aria-label={`Metadata value ${index + 1}`}
                disabled={disabled}
                className={`${inputClass} border-border`}
              />
              <button
                type="button"
                onClick={() => remove(index)}
                aria-label={`Remove metadata field ${index + 1}`}
                disabled={disabled}
                className={removeClass}
              >
                <RemoveIcon className="w-4 h-4" />
              </button>
            </div>
            <FieldError show={Boolean(errors[index])}>{errors[index]}</FieldError>
          </div>
        ))}
      </div>
      {rows.length < MAX_METADATA_ENTRIES && (
      <button
        type="button"
        onClick={() => onRowsChange([...rows, { key: "", value: "" }])}
        disabled={disabled}
        className="text-xs text-muted-foreground hover:text-foreground transition-colors cursor-pointer flex items-center gap-1"
      >
        <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
        </svg>
        Add field
      </button>
      )}
    </div>
  );
}
