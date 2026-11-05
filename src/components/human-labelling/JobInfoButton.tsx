"use client";

import { Tooltip } from "@/components/Tooltip";
import { parseBackendTime } from "@/lib/relativeTime";

/** An "i" beside the job's progress. Hovering it shows who the job is for, how
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
    <Tooltip
      position="bottom"
      alignEnd
      className="shrink-0"
      contentStyle={{ width: "18rem", maxWidth: "calc(100vw - 2rem)" }}
      content={
        <div>
          <h2 className="pb-2 mb-1 text-base font-semibold border-b border-gray-200">
            About this job
          </h2>
          <dl className="divide-y divide-gray-200">
            {rows.map(([name, value]) => (
              <div
                key={name}
                className="flex items-center justify-between gap-4 py-2 text-sm"
              >
                <dt>{name}</dt>
                <dd className="font-medium text-right break-words min-w-0">
                  {value}
                </dd>
              </div>
            ))}
          </dl>
        </div>
      }
    >
      <button
        type="button"
        aria-label="About this job"
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
    </Tooltip>
  );
}
