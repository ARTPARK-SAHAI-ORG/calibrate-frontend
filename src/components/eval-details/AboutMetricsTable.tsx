import React from "react";

export type MetricDescription = {
  metric: React.ReactNode;
  key?: string;
  description: React.ReactNode;
  preference: string;
  range: string;
};

type AboutMetricsTableProps = {
  metrics: MetricDescription[];
};

export function AboutMetricsTable({ metrics }: AboutMetricsTableProps) {
  return (
    <div className="space-y-4 md:space-y-6">
      {/* Desktop: Table layout */}
      <div className="hidden md:block border rounded-xl overflow-hidden">
        <table className="w-full">
          <thead className="bg-muted/50 border-b border-border">
            <tr>
              <th className="px-4 py-3 text-left text-[13px] font-medium text-foreground">Metric</th>
              <th className="px-4 py-3 text-left text-[13px] font-medium text-foreground">Description</th>
              <th className="px-4 py-3 text-left text-[13px] font-medium text-foreground">Preference</th>
              <th className="px-4 py-3 text-left text-[13px] font-medium text-foreground">Range</th>
            </tr>
          </thead>
          <tbody>
            {metrics.map((item, i) => (
              <tr key={item.key ?? String(item.metric)} className={`border-b border-border ${i === metrics.length - 1 ? "last:border-b-0" : ""}`}>
                <td className="px-4 py-3 text-[13px] font-medium text-foreground">{item.metric}</td>
                <td className="px-4 py-3 text-[13px] text-foreground">{item.description}</td>
                <td className="px-4 py-3 text-[13px] text-foreground">{item.preference}</td>
                <td className="px-4 py-3 text-[13px] text-foreground">{item.range}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Mobile: Card layout */}
      <div className="md:hidden space-y-3">
        {metrics.map((item) => (
          <div key={item.key ?? String(item.metric)} className="border border-border rounded-xl p-4 space-y-2">
            <h4 className="text-[13px] font-semibold text-foreground">{item.metric}</h4>
            <div className="text-[13px] text-muted-foreground">{item.description}</div>
            <div className="flex gap-4 pt-1">
              <div>
                <span className="text-[11px] text-muted-foreground uppercase tracking-wide">Preference</span>
                <p className="text-[13px] text-foreground">{item.preference}</p>
              </div>
              <div>
                <span className="text-[11px] text-muted-foreground uppercase tracking-wide">Range</span>
                <p className="text-[13px] text-foreground">{item.range}</p>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
