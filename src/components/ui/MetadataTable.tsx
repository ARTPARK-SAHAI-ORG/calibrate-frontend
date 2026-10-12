export type MetadataEntry = { key: string; value: string };

/** Key-value pairs sent with a trace or a labelling item, under a "Metadata"
 *  heading. Draws nothing when there are none. */
export function MetadataTable({ entries }: { entries?: MetadataEntry[] | null }) {
  if (!entries || entries.length === 0) return null;
  return (
    <div className="space-y-2">
      <h3 className="text-sm font-semibold text-foreground">Metadata</h3>
      <div className="border border-border rounded-lg overflow-hidden text-xs">
        <div className="grid grid-cols-2 gap-3 px-3 py-2 border-b border-border bg-muted/30 font-medium text-muted-foreground">
          <div>Field</div>
          <div>Value</div>
        </div>
        {entries.map((entry, index) => (
          <div
            key={`${entry.key}-${index}`}
            className="grid grid-cols-2 gap-3 px-3 py-2 border-b border-border last:border-b-0"
          >
            <div className="font-medium text-foreground break-all">{entry.key}</div>
            <div className="text-foreground break-all">{entry.value}</div>
          </div>
        ))}
      </div>
    </div>
  );
}
