"use client";

import React, { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

// Generic single-select dropdown. Owns the open/closed UI: rounded-xl
// trigger with chevron, an outside-click overlay, and a panel that's
// rendered in a portal with fixed positioning so it escapes any parent
// `overflow:hidden`/`overflow-auto` clipping (e.g. inside a modal body).
type SingleSelectPickerProps<T> = {
  items: T[];
  selectedId: string | null | undefined;
  onSelect: (item: T) => void;
  getId: (item: T) => string;
  renderTrigger: (item: T | null) => React.ReactNode;
  renderOption: (item: T, isSelected: boolean) => React.ReactNode;
  matchesSearch?: (item: T, query: string) => boolean;
  searchPlaceholder?: string;
  loading?: boolean;
  loadingLabel?: string;
  emptyLabel?: string;
  placeholder?: string;
  disabled?: boolean;
  label?: string;
  className?: string;
  ariaLabel?: string;
  // Tighter rows + smaller trigger; useful when the picker sits inside
  // dense layouts (e.g. a row of evaluator versions inside a dialog).
  compact?: boolean;
  // Returns a reason string when an item cannot be selected (rendered as a
  // muted line under the option and made non-interactive), or null when it can.
  isItemDisabled?: (item: T) => string | null;
  // Content pinned above the options inside the open panel, e.g. a form that
  // creates a new item. `close` shuts the panel once that action is done.
  renderHeader?: (close: () => void) => React.ReactNode;
};

type Rect = { left: number; top: number; width: number; bottom: number };

export function SingleSelectPicker<T>({
  items,
  selectedId,
  onSelect,
  getId,
  renderTrigger,
  renderOption,
  matchesSearch,
  searchPlaceholder = "Search",
  loading = false,
  loadingLabel = "Loading",
  emptyLabel = "No items found",
  placeholder = "Select",
  disabled = false,
  label,
  className = "",
  ariaLabel,
  compact = false,
  isItemDisabled,
  renderHeader,
}: SingleSelectPickerProps<T>) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [rect, setRect] = useState<Rect | null>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);

  const selected = items.find((it) => getId(it) === selectedId) ?? null;
  const filtered =
    matchesSearch && search.length > 0
      ? items.filter((it) => matchesSearch(it, search))
      : items;

  const updateRect = () => {
    if (!triggerRef.current) return;
    const r = triggerRef.current.getBoundingClientRect();
    setRect({ left: r.left, top: r.top, width: r.width, bottom: r.bottom });
  };

  useLayoutEffect(() => {
    if (!open) return;
    updateRect();
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onScroll = () => updateRect();
    const onResize = () => updateRect();
    window.addEventListener("scroll", onScroll, true);
    window.addEventListener("resize", onResize);
    return () => {
      window.removeEventListener("scroll", onScroll, true);
      window.removeEventListener("resize", onResize);
    };
  }, [open]);

  const triggerSizeClass = compact
    ? "h-9 px-3 rounded-lg"
    : "h-11 px-4 rounded-xl";
  const optionPaddingClass = compact ? "px-3 py-1.5" : "px-4 py-3";
  const statusPaddingClass = compact ? "px-3 py-2" : "px-4 py-3";

  const dropdownStyle: React.CSSProperties | undefined = rect
    ? (() => {
        const dropdownEstHeight = 240;
        const margin = 8;
        const spaceBelow = window.innerHeight - rect.bottom - margin;
        const openAbove =
          spaceBelow < dropdownEstHeight && rect.top > dropdownEstHeight;
        return {
          left: rect.left,
          width: rect.width,
          ...(openAbove
            ? { bottom: window.innerHeight - rect.top + margin }
            : { top: rect.bottom + margin }),
        };
      })()
    : undefined;

  return (
    <div className={`space-y-1.5 ${className}`}>
      {label && (
        <label className="block text-sm font-medium text-foreground">
          {label}
        </label>
      )}
      <div className="relative">
        <button
          ref={triggerRef}
          type="button"
          disabled={disabled}
          aria-label={ariaLabel}
          aria-haspopup="listbox"
          aria-expanded={open}
          onClick={() => setOpen((o) => !o)}
          onKeyDown={(e) => {
            if (e.key === "Escape") setOpen(false);
          }}
          className={`w-full ${triggerSizeClass} text-sm bg-transparent text-foreground border border-border transition-colors flex items-center justify-between gap-2 focus:outline-none focus-visible:ring-2 focus-visible:ring-accent ${
            disabled
              ? "cursor-not-allowed opacity-50"
              : "hover:border-muted-foreground cursor-pointer"
          }`}
        >
          <span
            className={`truncate ${
              selected ? "text-foreground" : "text-muted-foreground"
            }`}
          >
            {selected ? renderTrigger(selected) : placeholder}
          </span>
          {!disabled && (
            <svg
              className={`${
                compact ? "w-4 h-4" : "w-5 h-5"
              } text-muted-foreground transition-transform flex-shrink-0 ${
                open ? "rotate-180" : ""
              }`}
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={2}
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M19.5 8.25l-7.5 7.5-7.5-7.5"
              />
            </svg>
          )}
        </button>
      </div>

      {open &&
        !disabled &&
        typeof window !== "undefined" &&
        createPortal(
          <>
            <div
              className="fixed inset-0 z-[99]"
              onClick={() => setOpen(false)}
            />
            <div
              role="listbox"
              style={dropdownStyle}
              className="fixed bg-background border border-border rounded-xl shadow-xl z-[100] overflow-hidden"
            >
              {matchesSearch && (
                <div className="p-3 border-b border-border">
                  <input
                    type="text"
                    value={search}
                    autoFocus
                    onChange={(e) => setSearch(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Escape") {
                        e.stopPropagation();
                        setOpen(false);
                      }
                    }}
                    placeholder={searchPlaceholder}
                    className="w-full h-10 px-4 rounded-lg text-sm bg-background text-foreground placeholder:text-muted-foreground border border-border focus:outline-none focus:ring-1 focus:ring-accent"
                    onClick={(e) => e.stopPropagation()}
                  />
                </div>
              )}
              {renderHeader && (
                <div className="p-3 border-b border-border">
                  {renderHeader(() => setOpen(false))}
                </div>
              )}
              <div className="max-h-60 overflow-y-auto">
                {loading ? (
                  <div
                    className={`${statusPaddingClass} flex items-center gap-2 text-sm text-muted-foreground`}
                  >
                    <svg
                      className="w-4 h-4 animate-spin"
                      fill="none"
                      viewBox="0 0 24 24"
                    >
                      <circle
                        className="opacity-25"
                        cx="12"
                        cy="12"
                        r="10"
                        stroke="currentColor"
                        strokeWidth="4"
                      />
                      <path
                        className="opacity-75"
                        fill="currentColor"
                        d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                      />
                    </svg>
                    {loadingLabel}
                  </div>
                ) : filtered.length === 0 ? (
                  <div
                    className={`${statusPaddingClass} text-sm text-muted-foreground`}
                  >
                    {emptyLabel}
                  </div>
                ) : (
                  filtered.map((item) => {
                    const id = getId(item);
                    const isSelected = id === selectedId;
                    const disabledReason = isItemDisabled?.(item) ?? null;
                    if (disabledReason) {
                      // Two columns: the name and the reason stack on the
                      // left, and whatever the row puts on the right (a pill,
                      // say) spans both rows, so it sits in the middle of the
                      // row, level with the pills on the one-line rows.
                      // The row is greyed by the name's colour, never by fading
                      // the whole row: fading also washes out the reason the
                      // row cannot be picked, which is the one thing here the
                      // reader has to be able to read. Pills carry their own
                      // colours, so they stay as they are.
                      return (
                        <div
                          key={id}
                          role="option"
                          aria-selected={isSelected}
                          aria-disabled={true}
                          className={`w-full ${optionPaddingClass} text-left text-sm cursor-not-allowed text-muted-foreground grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-2 [&>*:nth-child(2)]:row-span-2`}
                        >
                          {renderOption(item, isSelected)}
                          {/* The reason wears the warning colour and a warning
                              sign, so it reads as "you cannot pick this" rather
                              than as a description of the item. */}
                          <div className="col-start-1 mt-0.5 flex items-start gap-1 text-xs text-yellow-700 dark:text-yellow-500">
                            <svg
                              className="w-3.5 h-3.5 mt-px flex-shrink-0"
                              fill="none"
                              viewBox="0 0 24 24"
                              stroke="currentColor"
                              strokeWidth={2}
                              aria-hidden="true"
                            >
                              <path
                                strokeLinecap="round"
                                strokeLinejoin="round"
                                d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z"
                              />
                            </svg>
                            <span>{disabledReason}</span>
                          </div>
                        </div>
                      );
                    }
                    return (
                      <button
                        key={id}
                        type="button"
                        role="option"
                        aria-selected={isSelected}
                        onClick={() => {
                          onSelect(item);
                          setOpen(false);
                        }}
                        className={`w-full ${optionPaddingClass} text-left text-sm transition-colors cursor-pointer flex items-center justify-between gap-2 ${
                          isSelected
                            ? "bg-accent text-foreground"
                            : "text-foreground hover:bg-muted"
                        }`}
                      >
                        {renderOption(item, isSelected)}
                      </button>
                    );
                  })
                )}
              </div>
            </div>
          </>,
          document.body,
        )}
    </div>
  );
}
