import React from "react";

export type RatingScaleRow = {
  value: number | string;
  name: string;
  description: string;
};

type RatingScaleEditorProps<T extends RatingScaleRow> = {
  rows: T[];
  onChange: (rows: T[]) => void;
  validationAttempted: boolean;
  description: string;
  descriptionPlaceholder: string;
};

export function RatingScaleEditor<T extends RatingScaleRow>({
  rows,
  onChange,
  validationAttempted,
  description,
  descriptionPlaceholder,
}: RatingScaleEditorProps<T>) {
  const updateRow = (idx: number, patch: Partial<T>) => {
    const next = [...rows];
    next[idx] = { ...next[idx], ...patch };
    onChange(next);
  };

  const addRow = () => {
    const maxVal = rows.reduce((max, row) => {
      const numeric =
        typeof row.value === "number" ? row.value : Number(row.value) || 0;
      return Math.max(max, numeric);
    }, 0);
    onChange([
      ...rows,
      { value: maxVal + 1, name: "", description: "" } as T,
    ]);
  };

  return (
    <div>
      <label className="block text-xs md:text-sm font-medium mb-1">
        Rating scale <span className="text-red-500">*</span>
      </label>
      <p className="text-xs md:text-sm text-muted-foreground mb-2">
        {description}
      </p>
      <div className="space-y-2">
        {rows.map((row, idx) => {
          const missingLabel = validationAttempted && !row.name.trim();
          return (
            <div
              key={idx}
              className="border border-border rounded-md p-2 md:p-3 bg-muted/10 dark:bg-muted"
            >
              <div className="flex items-center gap-2">
                <input
                  type="number"
                  value={
                    typeof row.value === "number"
                      ? row.value
                      : Number(row.value) || 0
                  }
                  onChange={(e) =>
                    updateRow(idx, { value: Number(e.target.value) } as Partial<T>)
                  }
                  className="w-20 h-9 md:h-10 px-2 rounded-md text-sm md:text-base border border-border bg-background dark:bg-accent text-foreground focus:outline-none focus:ring-2 focus:ring-accent focus:border-transparent text-center"
                />
                <input
                  type="text"
                  value={row.name}
                  onChange={(e) =>
                    updateRow(idx, { name: e.target.value } as Partial<T>)
                  }
                  placeholder={["Bad", "Average", "Good"][idx] ?? "Label"}
                  className={`flex-1 h-9 md:h-10 px-3 rounded-md text-sm md:text-base border bg-background dark:bg-accent text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-accent focus:border-transparent ${
                    missingLabel ? "border-red-500" : "border-border"
                  }`}
                />
                <button
                  type="button"
                  onClick={() => {
                    if (rows.length <= 2) return;
                    onChange(rows.filter((_, i) => i !== idx));
                  }}
                  disabled={rows.length <= 2}
                  title={
                    rows.length <= 2
                      ? "At least two rows are required"
                      : "Remove row"
                  }
                  className="w-9 h-9 md:w-10 md:h-10 flex items-center justify-center rounded-md text-muted-foreground hover:text-red-500 hover:bg-red-500/10 transition-colors cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:bg-transparent disabled:hover:text-muted-foreground"
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
              </div>
              <textarea
                value={row.description}
                onChange={(e) =>
                  updateRow(idx, { description: e.target.value } as Partial<T>)
                }
                placeholder={descriptionPlaceholder}
                rows={2}
                className="mt-2 w-full px-3 py-2 rounded-md text-sm border border-border bg-background dark:bg-accent text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-accent focus:border-transparent resize-none"
              />
            </div>
          );
        })}
      </div>
      <button
        type="button"
        onClick={addRow}
        className="mt-2 h-9 md:h-10 px-3 rounded-md text-sm md:text-base font-medium border border-dashed border-border bg-background dark:bg-muted hover:bg-muted/30 dark:hover:bg-accent text-muted-foreground hover:text-foreground transition-colors cursor-pointer inline-flex items-center gap-1.5"
      >
        <svg
          className="w-4 h-4"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          strokeWidth={2}
        >
          <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
        </svg>
        Add row
      </button>
    </div>
  );
}
