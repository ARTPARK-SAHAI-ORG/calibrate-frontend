"use client";

import { useId, useState } from "react";
import type { TicketHelp } from "@/lib/ticketHelp";

/**
 * "What does this mean?" under a question: opens the team's own wording for it
 * in place, so a rater never leaves the case they are reading. Drawn inline
 * rather than as a window, which keeps it usable on a phone.
 */
export function QuestionHelp({
  help,
  questionName,
}: {
  help: TicketHelp;
  questionName: string;
}) {
  const [open, setOpen] = useState(false);
  const panelId = useId();
  return (
    <div>
      <button
        type="button"
        aria-expanded={open}
        aria-controls={panelId}
        onClick={() => setOpen((o) => !o)}
        className="text-sm text-muted-foreground underline underline-offset-2 hover:text-foreground cursor-pointer outline-none focus-visible:ring-2 focus-visible:ring-foreground/30 rounded noora:text-secondary noora:hover:text-foreground noora:focus-visible:ring-secondary"
      >
        {open ? "Hide the explanation" : "What does this mean?"}
      </button>
      {open && (
        <div
          id={panelId}
          role="region"
          aria-label={`What ${questionName} means`}
          className="mt-2 space-y-3 rounded-lg border border-border bg-muted/30 p-3 text-sm text-foreground noora:border-outline-variant noora:bg-surface-container"
        >
          <p>{help.definition}</p>
          {help.example && (
            <p className="rounded-md border-l-2 border-foreground/30 bg-background px-3 py-2 text-muted-foreground noora:border-secondary noora:bg-surface-lowest">
              Example: {help.example}
            </p>
          )}
          {help.choices?.length ? (
            <div>
              <p className="font-medium">How to choose</p>
              <ul className="mt-1 space-y-0.5 text-muted-foreground">
                {help.choices.map((c) => (
                  <li key={c.name}>
                    <span className="font-medium text-foreground">{c.name}</span>
                    {`: ${c.text}`}
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
          <HelpList title="Counts when" items={help.counts} />
          <HelpList title="Does not count" items={help.notCounts} />
        </div>
      )}
    </div>
  );
}

function HelpList({ title, items }: { title: string; items?: string[] }) {
  if (!items?.length) return null;
  return (
    <div>
      <p className="font-medium">{title}</p>
      <ul className="mt-1 list-disc space-y-0.5 pl-5 text-muted-foreground">
        {items.map((item) => (
          <li key={item}>{item}</li>
        ))}
      </ul>
    </div>
  );
}
