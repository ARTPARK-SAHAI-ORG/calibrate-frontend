import type { ReactNode } from "react";

/** A small box with a muted label over one large number. */
export function StatCard({
  label,
  value,
  valueClassName = "",
}: {
  label: string;
  value: ReactNode;
  valueClassName?: string;
}) {
  return (
    <div className="border border-border rounded-lg px-4 py-3 bg-background min-w-[160px]">
      <div className="text-[10px] uppercase tracking-wide text-muted-foreground">
        {label}
      </div>
      <div className={`text-2xl font-semibold tabular-nums ${valueClassName}`}>
        {value}
      </div>
    </div>
  );
}
