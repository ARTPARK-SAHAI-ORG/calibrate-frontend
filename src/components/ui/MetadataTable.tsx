import { Fragment } from "react";

export type MetadataEntry = { key: string; value: string };

const CELL = "px-3 py-2 border-b border-border";

/** Key-value pairs sent with a trace or a labelling item, under a "Metadata"
 *  heading. Draws nothing when there are none. */
export function MetadataTable({ entries }: { entries?: MetadataEntry[] | null }) {
  if (!entries || entries.length === 0) return null;
  return (
    <div className="space-y-2">
      <h3 className="text-sm font-semibold text-foreground">Metadata</h3>
      {/* The field column is as wide as its longest name, up to half, and the
          value takes the rest. Only a name or value too long for its column
          breaks inside a word. */}
      <div className="grid grid-cols-[fit-content(50%)_minmax(0,1fr)] border border-border rounded-lg overflow-hidden text-xs [&>*:nth-last-child(-n+2)]:border-b-0">
        <div className={`${CELL} bg-muted/30 font-medium text-muted-foreground`}>Field</div>
        <div className={`${CELL} bg-muted/30 font-medium text-muted-foreground`}>Value</div>
        {entries.map((entry, index) => (
          <Fragment key={`${entry.key}-${index}`}>
            <div className={`${CELL} font-medium text-foreground wrap-anywhere`}>{entry.key}</div>
            <div className={`${CELL} text-foreground wrap-anywhere`}>{entry.value}</div>
          </Fragment>
        ))}
      </div>
    </div>
  );
}
