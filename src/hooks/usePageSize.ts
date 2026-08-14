"use client";

import { useState } from "react";

export const PAGE_SIZE_OPTIONS = [10, 25, 50, 100] as const;

/** One remembered "per page" choice, shared by every list that offers it. */
const PAGE_SIZE_KEY = "calibrate:items-page-size";

const DEFAULT_PAGE_SIZE = 50;

/** The saved choice, or 50 when there is none, it is not one of the options,
 *  or there is no browser (rendering on the server). */
function savedPageSize(): number {
  if (typeof window === "undefined") return DEFAULT_PAGE_SIZE;
  // A browser set to block site data throws on both reading and writing here.
  // Forgetting the choice is fine; taking the page down with it is not.
  try {
    const stored = Number(window.localStorage.getItem(PAGE_SIZE_KEY));
    return (PAGE_SIZE_OPTIONS as readonly number[]).includes(stored)
      ? stored
      : DEFAULT_PAGE_SIZE;
  } catch {
    return DEFAULT_PAGE_SIZE;
  }
}

/**
 * The reader's preferred rows per page. Reads the saved choice before the
 * first render, so the first list request already asks for the saved size
 * instead of asking twice, and saves every change. Callers reset their own
 * offset when it changes.
 */
export function usePageSize(): [number, (next: number) => void] {
  const [pageSize, setPageSize] = useState(savedPageSize);

  const change = (next: number) => {
    try {
      window.localStorage.setItem(PAGE_SIZE_KEY, String(next));
    } catch {
      // Site data is blocked, so the choice lasts for this visit only.
    }
    setPageSize(next);
  };

  return [pageSize, change];
}
