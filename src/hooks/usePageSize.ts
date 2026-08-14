"use client";

import { useEffect, useState } from "react";

export const PAGE_SIZE_OPTIONS = [10, 25, 50, 100] as const;

/** One remembered "per page" choice, shared by every list that offers it. */
const PAGE_SIZE_KEY = "calibrate:items-page-size";

/**
 * The reader's preferred rows per page. Starts at 50, reads the saved choice
 * once on mount (ignoring anything that is not one of the options), and saves
 * every change. Callers reset their own offset when it changes.
 */
export function usePageSize(): [number, (next: number) => void] {
  const [pageSize, setPageSize] = useState(50);

  useEffect(() => {
    const stored = Number(window.localStorage.getItem(PAGE_SIZE_KEY));
    if ((PAGE_SIZE_OPTIONS as readonly number[]).includes(stored)) {
      setPageSize(stored);
    }
  }, []);

  const change = (next: number) => {
    window.localStorage.setItem(PAGE_SIZE_KEY, String(next));
    setPageSize(next);
  };

  return [pageSize, change];
}
