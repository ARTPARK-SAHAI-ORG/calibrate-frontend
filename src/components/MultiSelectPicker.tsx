"use client";

import React, { useState, useEffect, useRef } from "react";

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
}: MultiSelectPickerProps) {
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const dropdownRef = useRef<HTMLDivElement>(null);

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

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (
        dropdownRef.current &&
        !dropdownRef.current.contains(event.target as Node)
      ) {
        setDropdownOpen(false);
      }
    };

    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  return (
    <div className={`space-y-1.5 ${className}`} ref={dropdownRef}>
      {label && (
        <label className="block text-sm font-medium text-foreground">{label}</label>
      )}
      <div className="relative">
        <div
          onClick={() => !disabled && setDropdownOpen(!dropdownOpen)}
          className={`w-full min-h-[44px] px-4 py-2 rounded-xl text-sm bg-transparent text-foreground border border-border transition-colors flex items-center justify-between gap-2 ${
            disabled ? "cursor-default" : "hover:border-muted-foreground cursor-pointer"
          }`}
        >
          <div className="flex-1 flex flex-wrap gap-2 items-center">
            {selectedItems.length === 0 ? (
              <span className="text-muted-foreground">{placeholder}</span>
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

        {/* Dropdown */}
        {dropdownOpen && !disabled && (
          <div className="absolute left-0 right-0 top-full mt-2 bg-popover border border-border rounded-xl shadow-xl z-[100] overflow-hidden">
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
                  Loading...
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
                        ? "bg-accent text-foreground"
                        : "text-foreground hover:bg-muted"
                    }`}
                  >
                    <div className="flex-1 min-w-0">
                      <span className="block truncate">{item.name}</span>
                      {item.description && (
                        <span className="block text-xs text-muted-foreground truncate mt-0.5">
                          {item.description}
                        </span>
                      )}
                    </div>
                    {isSelected(item.uuid) && (
                      <svg
                        className="w-5 h-5 text-foreground flex-shrink-0 ml-2"
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
          </div>
        )}
      </div>
    </div>
  );
}
