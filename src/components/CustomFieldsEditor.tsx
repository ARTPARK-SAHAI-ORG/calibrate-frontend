"use client";

import React from "react";

export type InputFieldType = "text" | "number";

export type InputRow = {
  key: string;
  type: InputFieldType;
  value: string;
};

// Turn the editable rows into the typed `default_inputs` object the backend
// expects, plus any per-row validation errors. Rows with an empty key are
// dropped silently. Invalid rows are excluded from `inputs` but reported in
// `errors` so the UI can show them without ever writing a broken value.
export function deriveInputs(rows: InputRow[]): {
  inputs: Record<string, unknown>;
  errors: Record<number, string>;
} {
  const inputs: Record<string, unknown> = {};
  const errors: Record<number, string> = {};
  const seen = new Set<string>();

  rows.forEach((row, index) => {
    const key = row.key.trim();
    if (!key) return;
    if (key === "messages" || key === "model") {
      errors[index] = "Reserved name";
      return;
    }
    if (seen.has(key)) {
      errors[index] = "Duplicate name";
      return;
    }

    const raw = row.value.trim();
    let value: unknown;
    if (row.type === "number") {
      // No value entered → send null, not 0.
      if (!raw) {
        value = null;
      } else {
        const n = Number(raw);
        if (!Number.isFinite(n)) {
          errors[index] = "Not a valid number";
          return;
        }
        value = n;
      }
    } else {
      // text: no value entered → send null, not an empty string.
      value = raw === "" ? null : row.value;
    }

    seen.add(key);
    inputs[key] = value;
  });

  return { inputs, errors };
}

// Turn a stored `{key: value}` map back into editable rows. A `types` map, when
// given, wins over inferring the type from the value — this is how a number
// field with an empty (null) default keeps its "number" type across a save,
// which inference alone cannot recover.
export function seedInputRows(
  inputs: Record<string, unknown> | undefined | null,
  types?: Record<string, InputFieldType> | null,
): InputRow[] {
  const di = inputs || {};
  return Object.entries(di).map(([key, v]) => {
    const declared = types?.[key];
    const type: InputFieldType =
      declared === "number" || (declared == null && typeof v === "number")
        ? "number"
        : "text";
    return { key, type, value: v == null ? "" : String(v) };
  });
}

// Field-type map for the current rows, keyed by name (first occurrence wins).
// Persisted alongside `default_inputs` so types survive a round-trip even when
// a field's value is empty. Rows with an empty/whitespace key are skipped.
export function inputRowsToTypes(
  rows: InputRow[],
): Record<string, InputFieldType> {
  const types: Record<string, InputFieldType> = {};
  for (const row of rows) {
    const key = row.key.trim();
    if (!key || key in types) continue;
    types[key] = row.type;
  }
  return types;
}

type CustomFieldsEditorProps = {
  rows: InputRow[];
  errors: Record<number, string>;
  onRowsChange: (rows: InputRow[]) => void;
  label?: string;
  helpText?: string;
  disabled?: boolean;
  // When true, the field name and type are shown read-only and "Add field" is
  // hidden. Only the value stays editable (plus per-row delete). Used for the
  // verify dialog, where the user overrides the agent's existing fields rather
  // than defining new ones.
  lockFields?: boolean;
};

export function CustomFieldsEditor({
  rows,
  errors,
  onRowsChange,
  label,
  helpText,
  disabled,
  lockFields,
}: CustomFieldsEditorProps) {
  const handleAdd = () => {
    onRowsChange([...rows, { key: "", type: "text", value: "" }]);
  };

  const handleRemove = (index: number) => {
    onRowsChange(rows.filter((_, i) => i !== index));
  };

  const handleRowChange = (index: number, patch: Partial<InputRow>) => {
    onRowsChange(rows.map((r, i) => (i === index ? { ...r, ...patch } : r)));
  };

  return (
    <div className="space-y-2">
      {label && (
        <label
          className={
            lockFields
              ? "block text-xs font-medium text-muted-foreground"
              : "text-sm md:text-base font-medium text-foreground"
          }
        >
          {label}
        </label>
      )}
      {helpText && (
        <p className="text-xs text-muted-foreground">{helpText}</p>
      )}
      <div className={lockFields ? "space-y-3" : "space-y-2"}>
        {rows.map((row, index) => {
          const hasError = Boolean(errors[index]);
          const valueInputClass = `flex-1 min-w-0 h-9 md:h-10 px-3 md:px-4 rounded-md text-sm md:text-base border bg-background text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 disabled:opacity-50 disabled:cursor-not-allowed ${
            hasError
              ? "border-red-500 focus:ring-red-500"
              : "border-border focus:ring-accent"
          }`;
          const removeButton = (
            <button
              type="button"
              onClick={() => handleRemove(index)}
              aria-label="Remove field"
              disabled={disabled}
              className="w-8 h-8 flex items-center justify-center rounded-md text-muted-foreground hover:text-red-500 hover:bg-red-500/10 transition-colors cursor-pointer flex-shrink-0 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <svg
                className="w-4 h-4"
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
          );

          // Locked mode (verify override): the field name and type are fixed,
          // so render a normal labeled input like the rest of the app. Only
          // the value is editable; the hidden type still drives validation.
          if (lockFields) {
            return (
              <div key={index} className="space-y-1">
                <label className="block text-xs font-medium text-muted-foreground truncate">
                  {row.key}
                </label>
                <div className="flex items-center gap-2">
                  <input
                    type="text"
                    inputMode={row.type === "number" ? "decimal" : undefined}
                    value={row.value}
                    onChange={(e) =>
                      handleRowChange(index, { value: e.target.value })
                    }
                    placeholder="Value"
                    aria-label="Field value"
                    disabled={disabled}
                    className={valueInputClass}
                  />
                  {removeButton}
                </div>
                {hasError && (
                  <p className="text-[11px] text-red-500">{errors[index]}</p>
                )}
              </div>
            );
          }

          return (
            <div key={index}>
              <div className="flex flex-wrap md:flex-nowrap items-center gap-2">
                <input
                  type="text"
                  value={row.key}
                  onChange={(e) =>
                    handleRowChange(index, { key: e.target.value })
                  }
                  placeholder="Field name"
                  disabled={disabled}
                  className="flex-1 min-w-0 h-9 md:h-10 px-3 md:px-4 rounded-md text-sm md:text-base border border-border bg-background text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-accent disabled:opacity-50 disabled:cursor-not-allowed"
                />
                <div className="relative">
                  <select
                    value={row.type}
                    onChange={(e) =>
                      handleRowChange(index, {
                        type: e.target.value as InputFieldType,
                      })
                    }
                    aria-label="Field type"
                    disabled={disabled}
                    className="h-9 md:h-10 pl-3 pr-8 rounded-md text-sm md:text-base border border-border bg-background text-foreground focus:outline-none focus:ring-1 focus:ring-accent cursor-pointer appearance-none disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    <option value="text">Text</option>
                    <option value="number">Number</option>
                  </select>
                  <svg
                    className="absolute right-2 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                    strokeWidth={2}
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      d="M19.5 8.25l-7.5 7.5-7.5-7.5"
                    />
                  </svg>
                </div>
                <input
                  type={row.type === "number" ? "number" : "text"}
                  value={row.value}
                  onChange={(e) =>
                    handleRowChange(index, { value: e.target.value })
                  }
                  placeholder="Default value (optional)"
                  aria-label="Field value"
                  disabled={disabled}
                  className={valueInputClass}
                />
                {removeButton}
              </div>
              {hasError && (
                <p className="text-[11px] text-red-500 mt-1">{errors[index]}</p>
              )}
            </div>
          );
        })}
      </div>
      {!lockFields && (
        <button
          type="button"
          onClick={handleAdd}
          disabled={disabled}
          className="text-xs text-muted-foreground hover:text-foreground transition-colors cursor-pointer flex items-center gap-1 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          <svg
            className="w-3.5 h-3.5"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={2}
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M12 4.5v15m7.5-7.5h-15"
            />
          </svg>
          Add field
        </button>
      )}
    </div>
  );
}
