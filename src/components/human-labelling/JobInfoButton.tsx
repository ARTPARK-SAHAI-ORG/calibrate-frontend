"use client";

import { useRef, useState } from "react";
import { useDismissOnOutside } from "@/hooks/useDismissOnOutside";
import { parseBackendTime } from "@/lib/relativeTime";

/** An "i" button beside the job's progress, opening who the job is for, how
 *  big it is and when it was made. */
export function JobInfoButton({
  labeller,
  itemCount,
  createdAt,
}: {
  labeller: string;
  itemCount: number;
  createdAt: string;
}) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  useDismissOnOutside(open, rootRef, () => setOpen(false));

  const rows: [string, string | number][] = [
    ["Labeller", labeller],
    ["Items to label", itemCount],
    [
      "Date created",
      parseBackendTime(createdAt).toLocaleDateString("en-GB", {
        day: "numeric",
        month: "short",
        year: "numeric",
      }),
    ],
  ];

  return (
    <div ref={rootRef} className="relative shrink-0">
      <button
        type="button"
        aria-label="About this job"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
        className="w-9 h-9 flex items-center justify-center rounded-md border border-border bg-background text-foreground hover:bg-muted/50 transition-colors cursor-pointer"
      >
        <svg
          className="w-[18px] h-[18px]"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          strokeWidth={1.75}
          aria-hidden
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M11.25 11.25l.041-.02a.75.75 0 011.063.852l-.708 2.836a.75.75 0 001.063.853l.041-.021M21 12a9 9 0 11-18 0 9 9 0 0118 0zm-9-3.75h.008v.008H12V8.25z"
          />
        </svg>
      </button>
      {open && (
        <div className="absolute right-0 top-full mt-2 z-40 w-72 max-w-[calc(100vw-2rem)] rounded-xl border border-border bg-background shadow-lg overflow-hidden">
          <h2 className="px-4 py-3 text-sm font-semibold text-foreground border-b border-border">
            About this job
          </h2>
          <dl className="divide-y divide-border">
            {rows.map(([name, value]) => (
              <div
                key={name}
                className="flex items-center justify-between gap-4 px-4 py-2.5 text-sm text-foreground"
              >
                <dt>{name}</dt>
                <dd className="font-semibold text-right break-words min-w-0">
                  {value}
                </dd>
              </div>
            ))}
          </dl>
        </div>
      )}
    </div>
  );
}
