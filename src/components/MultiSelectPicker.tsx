"use client";

import React, { useState, useEffect, useRef } from "react";
import { createPortal } from "react-dom";

export type PickerItem = {
  uuid: string;
  name: string;
  description?: string;
};

type MultiSelectPickerProps = {
  items: PickerItem[];
  selectedItems: PickerItem[];
  onSelectionChange: (items: PickerItem[]) => void;
  label?: string;
  placeholder?: string;
  searchPlaceholder?: string;
  isLoading?: boolean;
  className?: string;
  disabled?: boolean;
  // Optional callback fired when the dropdown opens or closes. Lets the
  // parent defer side effects (e.g. resetting an uploaded CSV) until the
  // user is done picking instead of reacting to every intermediate
  // toggle.
  onOpenChange?: (open: boolean) => void;
};

export function MultiSelectPicker({
  items,
  selectedItems,
  onSelectionChange,
  label,
  placeholder = "Select items",
  searchPlaceholder = "Search...",
  isLoading = false,
  className = "",
  disabled = false,
  onOpenChange,
}: MultiSelectPickerProps) {
  const [dropdownOpen, setDropdownOpenState] = useState(false);
  // Mirror state in a ref so the wrapper can read the previous value
  // synchronously (without the setState updater form, which runs during
  // render — calling parent setState from there triggers React's
  // "Cannot update a component while rendering" warning).
  const dropdownOpenRef = useRef(false);
  // Keep the latest onOpenChange in a ref so handlers captured by
  // mount-only effects (e.g. the document-level mousedown listener)
  // call the freshest version, which closes over the parent's current
  // selection state — not the empty initial state.
  const onOpenChangeRef = useRef(onOpenChange);
  useEffect(() => {
    onOpenChangeRef.current = onOpenChange;
  }, [onOpenChange]);
  const setDropdownOpen = (next: boolean | ((p: boolean) => boolean)) => {
    const prev = dropdownOpenRef.current;
    const resolved = typeof next === "function" ? next(prev) : next;
    if (resolved === prev) return;
    dropdownOpenRef.current = resolved;
    setDropdownOpenState(resolved);
    onOpenChangeRef.current?.(resolved);
  };
  const [searchQuery, setSearchQuery] = useState("");
  const dropdownRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLDivElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const [menuRect, setMenuRect] = useState<{
    left: number;
    top: number;
    width: number;
  } | null>(null);

  // Anchor the portaled dropdown to the trigger via fixed positioning.
  // Recompute on open, on scroll/resize, and whenever surrounding layout
  // shifts (e.g. a parent renders a new section based on the picker's
  // selection, pushing the trigger down) — caught via a ResizeObserver
  // on the trigger and on document.body.
  useEffect(() => {
    if (!dropdownOpen) return;
    const updateRect = () => {
      const el = triggerRef.current;
      if (!el) return;
      const r = el.getBoundingClientRect();
      setMenuRect({ left: r.left, top: r.bottom + 8, width: r.width });
    };
    updateRect();
    window.addEventListener("scroll", updateRect, true);
    window.addEventListener("resize", updateRect);
    let observer: ResizeObserver | null = null;
    if (typeof ResizeObserver !== "undefined") {
      observer = new ResizeObserver(updateRect);
      if (triggerRef.current) observer.observe(triggerRef.current);
      if (typeof document !== "undefined") observer.observe(document.body);
    }
    return () => {
      window.removeEventListener("scroll", updateRect, true);
      window.removeEventListener("resize", updateRect);
      observer?.disconnect();
    };
  }, [dropdownOpen]);

  const filteredItems = items.filter((item) =>
    item.name.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const isSelected = (uuid: string) =>
    selectedItems.some((item) => item.uuid === uuid);

  const toggleItem = (item: PickerItem) => {
    if (isSelected(item.uuid)) {
      onSelectionChange(selectedItems.filter((i) => i.uuid !== item.uuid));
    } else {
      onSelectionChange([...selectedItems, item]);
    }
  };

  const removeItem = (uuid: string, e: React.MouseEvent) => {
    e.stopPropagation();
    onSelectionChange(selectedItems.filter((i) => i.uuid !== uuid));
  };

  // Close dropdown when clicking outside. The menu now lives in a portal
  // so we have to test against both the trigger container and the menu.
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      const target = event.target as Node;
      if (dropdownRef.current && dropdownRef.current.contains(target)) return;
      if (menuRef.current && menuRef.current.contains(target)) return;
      setDropdownOpen(false);
    };

    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  return (
    <div className={`space-y-1.5 ${className}`} ref={dropdownRef}>
      {label && (
        <label className="block text-sm font-medium text-foreground">
          {label}
        </label>
      )}
      <div className="relative" ref={triggerRef}>
        <div
          onClick={() => !disabled && setDropdownOpen(!dropdownOpen)}
          className={`w-full min-h-[44px] px-4 py-2 rounded-xl text-sm bg-background text-foreground border border-border transition-colors flex items-center justify-between gap-2 ${
            disabled
              ? "cursor-default"
              : "hover:border-muted-foreground cursor-pointer"
          }`}
        >
          <div className="flex-1 flex flex-wrap gap-2 items-center">
            {selectedItems.length === 0 ? (
              <span className="text-foreground/90">
                {placeholder}
              </span>
            ) : (
              selectedItems.map((item) => (
                <span
                  key={item.uuid}
                  className="inline-flex items-center gap-1 px-2 py-1 rounded-md bg-muted text-foreground text-xs"
                >
                  {item.name}
                  {!disabled && (
                    <button
                      onClick={(e) => removeItem(item.uuid, e)}
                      className="hover:text-red-400 transition-colors"
                    >
                      <svg
                        className="w-3 h-3"
                        fill="none"
                        viewBox="0 0 24 24"
                        stroke="currentColor"
                        strokeWidth={2}
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          d="M6 18L18 6M6 6l12 12"
                        />
                      </svg>
                    </button>
                  )}
                </span>
              ))
            )}
          </div>
          {!disabled && (
            <svg
              className={`w-5 h-5 text-muted-foreground transition-transform flex-shrink-0 ${
                dropdownOpen ? "rotate-180" : ""
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
        </div>

        {/* Dropdown — portaled to <body> with fixed positioning so it
            escapes any ancestor `overflow: auto` (e.g. a scrolling modal
            content area) and isn't clipped. */}
        {dropdownOpen && !disabled && menuRect && typeof document !== "undefined" &&
          createPortal(
          <div
            ref={menuRef}
            style={{
              position: "fixed",
              left: menuRect.left,
              top: menuRect.top,
              width: menuRect.width,
            }}
            className="bg-popover text-foreground border border-border rounded-xl shadow-xl z-[100] overflow-hidden"
          >
            {/* Search */}
            <div className="p-3 border-b border-border">
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder={searchPlaceholder}
                className="w-full h-10 px-4 rounded-lg text-sm bg-background text-foreground placeholder:text-muted-foreground border border-border focus:outline-none focus:ring-1 focus:ring-accent"
                onClick={(e) => e.stopPropagation()}
              />
            </div>

            {/* Options */}
            <div className="max-h-60 overflow-y-auto">
              {isLoading ? (
                <div className="px-4 py-3 text-sm text-muted-foreground flex items-center gap-2">
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
                    ></circle>
                    <path
                      className="opacity-75"
                      fill="currentColor"
                      d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                    ></path>
                  </svg>
                  Loading
                </div>
              ) : filteredItems.length === 0 ? (
                <div className="px-4 py-3 text-sm text-muted-foreground">
                  No items found
                </div>
              ) : (
                filteredItems.map((item) => (
                  <button
                    key={item.uuid}
                    onClick={() => toggleItem(item)}
                    className={`w-full px-4 py-3 text-left text-sm transition-colors cursor-pointer flex items-center justify-between ${
                      isSelected(item.uuid)
                        ? "bg-accent text-accent-foreground"
                        : "text-foreground hover:bg-muted"
                    }`}
                  >
                    <div className="flex-1 min-w-0">
                      <span className="block truncate">{item.name}</span>
                      {item.description && (
                        <span
                          className={`block text-xs truncate mt-0.5 ${
                            isSelected(item.uuid)
                              ? "text-accent-foreground/75"
                              : "text-muted-foreground"
                          }`}
                        >
                          {item.description}
                        </span>
                      )}
                    </div>
                    {isSelected(item.uuid) && (
                      <svg
                        className="w-5 h-5 text-accent-foreground flex-shrink-0 ml-2"
                        fill="none"
                        viewBox="0 0 24 24"
                        stroke="currentColor"
                        strokeWidth={2}
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          d="M4.5 12.75l6 6 9-13.5"
                        />
                      </svg>
                    )}
                  </button>
                ))
              )}
            </div>
          </div>,
          document.body,
        )}
      </div>
    </div>
  );
}
