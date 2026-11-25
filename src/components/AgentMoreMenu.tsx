"use client";

import { useRef, useState } from "react";
import { Tooltip } from "@/components/Tooltip";
import { CopyIcon, DotsIcon } from "@/components/icons";
import { useDismissOnOutside } from "@/hooks/useDismissOnOutside";

/** The agent header's less used actions, kept behind one button so the
 *  header fits in a narrow window. */
export function AgentMoreMenu({ onDuplicate }: { onDuplicate: () => void }) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  useDismissOnOutside(open, rootRef, () => setOpen(false));

  return (
    <div className="relative" ref={rootRef}>
      <Tooltip content="More actions" position="bottom">
        <button
          type="button"
          onClick={() => setOpen((o) => !o)}
          aria-label="More actions"
          aria-haspopup="menu"
          aria-expanded={open}
          className="h-8 w-8 rounded-md border border-border bg-background text-foreground hover:bg-accent transition-colors cursor-pointer flex items-center justify-center"
        >
          <DotsIcon className="w-4 h-4" />
        </button>
      </Tooltip>
      {open && (
        <div
          role="menu"
          className="absolute right-0 top-10 min-w-44 bg-background border border-border rounded-xl shadow-lg z-50 overflow-hidden p-1"
        >
          <button
            type="button"
            role="menuitem"
            onClick={() => {
              setOpen(false);
              onDuplicate();
            }}
            className="w-full flex items-center gap-2 px-3 py-2 rounded-md text-sm text-foreground hover:bg-muted transition-colors cursor-pointer"
          >
            <CopyIcon className="w-4 h-4" />
            Duplicate agent
          </button>
        </div>
      )}
    </div>
  );
}
