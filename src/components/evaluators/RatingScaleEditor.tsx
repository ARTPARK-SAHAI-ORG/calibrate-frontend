import React from "react";

export type RatingScaleRow = {
  value: number | string;
  name: string;
  description: string;
};

function numericValue(value: number | string) {
  return typeof value === "number" ? value : Number(value) || 0;
}

const RANK_CLASSES = {
  best: "border-green-500/40 bg-green-500/10 text-green-700 dark:text-green-400",
  middle:
    "border-amber-500/40 bg-amber-500/10 text-amber-700 dark:text-amber-400",
  worst: "border-red-500/40 bg-red-500/10 text-red-700 dark:text-red-400",
} as const;

const RANK_TEXT_CLASSES = {
  best: "text-green-700 dark:text-green-400",
  middle: "",
  worst: "text-red-700 dark:text-red-400",
} as const;

const RANK_LABELS = { best: "Best", middle: "", worst: "Worst" } as const;

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
    const maxVal = rows.reduce(
      (max, row) => Math.max(max, numericValue(row.value)),
      0,
    );
    onChange([
      ...rows,
      { value: maxVal + 1, name: "", description: "" } as T,
    ]);
  };

  const values = rows.map((row) => numericValue(row.value));
  const highest = Math.max(...values);
  const lowest = Math.min(...values);

  return (
    <div>
      <label className="block text-xs md:text-sm font-medium mb-1">
        Rating scale <span className="text-red-500">*</span>
      </label>
      <p className="text-xs md:text-sm text-muted-foreground mb-2">
        {description}
      </p>
      <div className="flex items-start gap-2 rounded-md border border-blue-500/30 bg-blue-500/10 p-3 mb-4 text-xs md:text-sm text-blue-700 dark:text-blue-300">
        <svg
          className="w-4 h-4 mt-0.5 flex-shrink-0"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          strokeWidth={1.75}
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M11.25 11.25l.041-.02a.75.75 0 011.063.852l-.708 2.836a.75.75 0 001.063.853l.041-.021M21 12a9 9 0 11-18 0 9 9 0 0118 0zm-9-3.75h.008v.008H12V8.25z"
          />
        </svg>
        <span>The highest number is the best score.</span>
      </div>
      <div className="space-y-4">
        {rows.map((row, idx) => {
          const missingLabel = validationAttempted && !row.name.trim();
          const rank =
            highest === lowest
              ? null
              : values[idx] === highest
                ? "best"
                : values[idx] === lowest
                  ? "worst"
                  : "middle";
          return (
            <div key={idx}>
              <div className="flex items-start gap-2">
                <div className="w-20 flex-shrink-0">
                  <input
                    type="number"
                    value={values[idx]}
                    onChange={(e) =>
                      updateRow(idx, {
                        value: Number(e.target.value),
                      } as Partial<T>)
                    }
                    className={`w-full h-9 md:h-10 px-2 rounded-md text-sm md:text-base font-medium border focus:outline-none focus:ring-2 focus:ring-accent focus:border-transparent text-center ${
                      rank
                        ? RANK_CLASSES[rank]
                        : "border-border bg-background dark:bg-accent text-foreground"
                    }`}
                  />
                  {rank && RANK_LABELS[rank] && (
                    <p
                      className={`mt-1 text-center text-xs font-medium ${RANK_TEXT_CLASSES[rank]}`}
                    >
                      {RANK_LABELS[rank]}
                    </p>
                  )}
                </div>
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
                rows={3}
                className="mt-2 w-full px-3 py-2 rounded-md text-sm border border-border bg-background dark:bg-accent text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-accent focus:border-transparent resize-y min-h-[5rem]"
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
