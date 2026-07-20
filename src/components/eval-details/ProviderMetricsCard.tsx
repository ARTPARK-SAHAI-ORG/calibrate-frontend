import React from "react";

export type MetricItem = {
  label: string;
  value: string | number;
};

type ProviderMetricsCardProps = {
  metrics: MetricItem[];
};

export function ProviderMetricsCard({ metrics }: ProviderMetricsCardProps) {
  return (
    <div className="border rounded-xl p-4 bg-muted/10">
      <h3 className="text-[15px] font-semibold mb-4">Overall Metrics</h3>
      <div className="grid gap-4" style={{ gridTemplateColumns: `repeat(${metrics.length}, minmax(0, 1fr))` }}>
        {metrics.map((m) => (
          <div key={m.label}>
            <div className="text-[12px] text-muted-foreground mb-1">{m.label}</div>
            <div className="text-base md:text-[18px] font-semibold text-foreground">
              {m.value ?? "-"}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
