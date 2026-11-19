"use client";

import { useRef, useState } from "react";
import { useDismissOnOutside } from "@/hooks/useDismissOnOutside";
import type { TicketDensity } from "@/hooks/useTicketDensity";

const DENSITY_OPTIONS: { value: TicketDensity; label: string; hint: string }[] =
  [
    { value: "comfortable", label: "Comfortable", hint: "More space around each message" },
    { value: "compact", label: "Compact", hint: "More of the ticket on the screen at once" },
  ];

/** The Settings button in the labelling page's top row, and its panel. For now
 *  it holds one choice, how much room a ticket takes; it is for the reader's own
 *  screen and changes nothing about the job. */
export function JobSettingsMenu({
  density,
  onDensityChange,
}: {
  density: TicketDensity;
  onDensityChange: (next: TicketDensity) => void;
}) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  useDismissOnOutside(open, rootRef, () => setOpen(false));

  return (
    <div ref={rootRef} className="relative shrink-0">
      <button
        type="button"
        aria-haspopup="dialog"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
        className="h-9 px-3 inline-flex items-center gap-1.5 rounded-md text-sm font-medium border border-border bg-background text-foreground hover:bg-muted/50 transition-colors cursor-pointer whitespace-nowrap outline-none focus-visible:ring-2 focus-visible:ring-foreground/30"
      >
        Settings
        <svg
          className={`w-3.5 h-3.5 transition-transform ${open ? "rotate-180" : ""}`}
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          strokeWidth={2}
          aria-hidden
        >
          <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
        </svg>
      </button>
      {open && (
        <div
          role="dialog"
          aria-label="Settings"
          className="absolute right-0 top-full z-40 mt-2 w-72 max-w-[calc(100vw-2rem)] rounded-xl border border-border bg-background text-foreground shadow-lg overflow-hidden"
        >
          <h2 className="px-4 py-3 text-base font-semibold bg-muted border-b border-border">
            Settings
          </h2>
          <div className="px-4 py-3">
            <h3 className="text-sm font-medium">Density</h3>
            <p className="text-xs text-muted-foreground">
              How much room each ticket takes
            </p>
            <div role="radiogroup" aria-label="Density" className="mt-2 space-y-1">
              {DENSITY_OPTIONS.map((o) => {
                const selected = density === o.value;
                return (
                  <button
                    key={o.value}
                    type="button"
                    role="radio"
                    aria-checked={selected}
                    onClick={() => onDensityChange(o.value)}
                    className={`w-full text-left rounded-lg border px-3 py-2 transition-colors cursor-pointer outline-none focus-visible:ring-2 focus-visible:ring-foreground/30 ${
                      selected
                        ? "border-foreground bg-muted/50"
                        : "border-border hover:bg-muted/40"
                    }`}
                  >
                    <span className="block text-sm font-medium">{o.label}</span>
                    <span className="block text-xs text-muted-foreground">
                      {o.hint}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
