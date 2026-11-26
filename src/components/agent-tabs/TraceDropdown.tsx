"use client";

import { ChevronDownIcon } from "@/components/icons";
import React, { useRef, useState } from "react";
import { useDismissOnOutside } from "@/hooks";

type DropdownOption = {
  value: string;
  row: React.ReactNode;
  /** Drawn below a line, apart from the options above it. */
  separated?: boolean;
};

/**
 * A select whose options can take two lines, which a native select cannot
 * draw. Looks like `Select` when closed.
 */
export function TraceDropdown({
  label,
  value,
  selected,
  options,
  heading,
  onChange,
  disabled,
  className = "w-40",
  menuClassName = "w-[300px]",
}: {
  label: string;
  value?: string;
  selected: React.ReactNode;
  options: DropdownOption[];
  heading?: string;
  onChange: (value: string) => void;
  disabled?: boolean;
  className?: string;
  menuClassName?: string;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useDismissOnOutside(open, ref, () => setOpen(false));

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        aria-label={label}
        aria-haspopup="listbox"
        aria-expanded={open}
        disabled={disabled}
        onClick={() => setOpen((o) => !o)}
        className={`flex items-center justify-between gap-2 h-10 px-3 rounded-md text-sm border border-border bg-background text-foreground text-left cursor-pointer focus:outline-none focus:ring-2 focus:ring-accent disabled:cursor-not-allowed disabled:bg-muted/30 disabled:text-muted-foreground ${className}`}
      >
        <span className="min-w-0 flex-1 truncate">{selected}</span>
        <ChevronDownIcon className="w-4 h-4 flex-shrink-0 text-muted-foreground" />
      </button>
      {open && (
        <div
          role="listbox"
          aria-label={label}
          className={`absolute left-0 top-11 z-20 max-h-80 overflow-y-auto rounded-lg border border-border bg-background shadow-lg p-1.5 ${menuClassName}`}
        >
          {heading && (
            <p className="mx-2 mt-1 mb-1.5 text-xs text-muted-foreground">
              {heading}
            </p>
          )}
          {options.map((option) => (
            <React.Fragment key={option.value}>
              {option.separated && <div className="my-1 border-t border-border" />}
              <button
                type="button"
                role="option"
                aria-selected={option.value === value}
                onClick={() => {
                  setOpen(false);
                  onChange(option.value);
                }}
                className="block w-full min-w-0 px-2 py-1.5 rounded-md text-left text-foreground hover:bg-muted cursor-pointer"
              >
                {option.row}
              </button>
            </React.Fragment>
          ))}
        </div>
      )}
    </div>
  );
}

/** An option's name, with the value it would take under it when there is one. */
export function OptionRow({
  name,
  detail,
  muted,
}: {
  name: string;
  /** Undefined draws no second line; null says the latest trace lacks it. */
  detail?: string | null;
  muted?: boolean;
}) {
  return (
    <>
      <span
        className={`block text-sm font-medium ${muted ? "text-muted-foreground" : ""}`}
      >
        {name}
      </span>
      {detail === null ? (
        <span className="block truncate text-xs italic text-muted-foreground/60">
          Not in the latest trace
        </span>
      ) : (
        detail !== undefined && (
          <span className="block truncate text-xs text-muted-foreground">
            {detail}
          </span>
        )
      )}
    </>
  );
}
