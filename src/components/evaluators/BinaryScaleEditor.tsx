import {
  DEFAULT_BINARY_FALSE_LABEL,
  DEFAULT_BINARY_TRUE_LABEL,
} from "@/lib/binaryLabels";

export type BinaryScaleRow = {
  value: boolean;
  name: string;
  description: string;
};

export function defaultBinaryScale(): BinaryScaleRow[] {
  return [
    { value: true, name: "", description: "" },
    { value: false, name: "", description: "" },
  ];
}

type Props = {
  rows: BinaryScaleRow[];
  onChange: (rows: BinaryScaleRow[]) => void;
};

export function BinaryScaleEditor({ rows, onChange }: Props) {
  const update = (idx: number, patch: Partial<BinaryScaleRow>) => {
    const next = [...rows];
    next[idx] = { ...next[idx], ...patch };
    onChange(next);
  };

  return (
    <div>
      <label className="block text-xs md:text-sm font-medium mb-1">
        Labels
      </label>
      <p className="text-xs md:text-sm text-muted-foreground mb-2">
        Override the labels shown for each binary verdict. Leave blank to use
        the defaults ({DEFAULT_BINARY_TRUE_LABEL} / {DEFAULT_BINARY_FALSE_LABEL}
        ). The optional description is rubric text sent to the judge.
      </p>
      <div className="space-y-4">
        {rows.map((row, idx) => {
          const placeholder = row.value
            ? DEFAULT_BINARY_TRUE_LABEL
            : DEFAULT_BINARY_FALSE_LABEL;
          return (
            <div key={String(row.value)}>
              <div className="flex items-center gap-2">
                <span
                  className={`w-20 h-9 md:h-10 inline-flex items-center justify-center rounded-md text-sm md:text-base font-medium border ${
                    row.value
                      ? "border-green-500/30 bg-green-500/10 text-green-700 dark:text-green-400"
                      : "border-red-500/30 bg-red-500/10 text-red-700 dark:text-red-400"
                  }`}
                >
                  {row.value ? "True" : "False"}
                </span>
                <input
                  type="text"
                  value={row.name}
                  onChange={(e) => update(idx, { name: e.target.value })}
                  placeholder={placeholder}
                  className="flex-1 h-9 md:h-10 px-3 rounded-md text-sm md:text-base border border-border bg-background dark:bg-accent text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-accent focus:border-transparent"
                />
              </div>
              <textarea
                value={row.description}
                onChange={(e) =>
                  update(idx, { description: e.target.value })
                }
                placeholder="(optional) description for the response to receive this verdict; a detailed rubric helps the LLM judge evaluate more reliably"
                rows={3}
                className="mt-2 w-full px-3 py-2 rounded-md text-sm border border-border bg-background dark:bg-accent text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-accent focus:border-transparent resize-y min-h-[5rem]"
              />
            </div>
          );
        })}
      </div>
    </div>
  );
}
