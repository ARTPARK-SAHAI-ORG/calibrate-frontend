"use client";

import React from "react";

export type DialogStep = { n: number; label: string };

/**
 * The numbered steps under a window's title. A finished step shows a tick, and
 * a step opens only once the ones before it are answered.
 */
export function DialogStepper({
  steps,
  current,
  isDone,
  onSelect,
}: {
  steps: DialogStep[];
  current: number;
  /** The step is answered. */
  isDone: (n: number) => boolean;
  onSelect: (n: number) => void;
}) {
  const canOpen = (n: number) => steps.every((s) => s.n >= n || isDone(s.n));
  return (
    <div className="mt-3 flex items-center gap-2">
      {steps.map((s, i) => {
        const active = current === s.n;
        const done = isDone(s.n) && !active;
        return (
          <div key={s.n} className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => onSelect(s.n)}
              disabled={!canOpen(s.n)}
              className="flex items-center gap-2 cursor-pointer group disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <span
                className={`flex items-center justify-center w-6 h-6 rounded-full text-xs font-semibold transition-colors ${
                  active
                    ? "bg-foreground text-background"
                    : done
                      ? "bg-teal-500/15 text-teal-700 dark:text-teal-300 border border-teal-500/40"
                      : "bg-muted text-muted-foreground"
                }`}
              >
                {done ? "✓" : s.n}
              </span>
              <span
                className={`text-xs md:text-sm font-medium transition-colors ${
                  active
                    ? "text-foreground"
                    : "text-muted-foreground group-hover:text-foreground"
                }`}
              >
                {s.label}
              </span>
            </button>
            {i < steps.length - 1 && <span className="w-6 h-px bg-border" />}
          </div>
        );
      })}
    </div>
  );
}
