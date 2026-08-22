import { useState, useEffect, useRef, useCallback } from "react";

const STORAGE_KEY = "sidebarOpen";

const isDesktop = () => window.innerWidth >= 768;

/** The remembered choice, or null when there is none or storage is blocked. */
const readSaved = (): boolean | null => {
  try {
    const saved = window.localStorage.getItem(STORAGE_KEY);
    return saved === null ? null : saved === "true";
  } catch {
    return null;
  }
};

const writeSaved = (open: boolean): void => {
  try {
    window.localStorage.setItem(STORAGE_KEY, String(open));
  } catch {
    // Storage is blocked, so the choice lasts for this page only.
  }
};

/**
 * Hook to manage sidebar state based on screen size.
 * Desktop (>=768px): open by default, unless the reader has opened or closed
 * it before, in which case that choice is remembered across pages and visits.
 * Mobile (<768px): always closed to start, and toggling it is not remembered.
 *
 * Pass `false` for a page that wants the sidebar out of the way on desktop
 * too. That is only the starting point: a remembered choice wins over it.
 *
 * Returns [sidebarOpen, setSidebarOpen] tuple.
 * The state is initialized after mount to avoid hydration mismatch.
 */
export const useSidebarState = (
  openOnDesktop = true,
): [boolean, React.Dispatch<React.SetStateAction<boolean>>] => {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [initialized, setInitialized] = useState(false);
  const changedByReader = useRef(false);

  useEffect(() => {
    if (initialized) return;
    const desktop = isDesktop();
    const saved = desktop ? readSaved() : null;
    setSidebarOpen(saved ?? (desktop && openOnDesktop));
    setInitialized(true);
  }, [initialized, openOnDesktop]);

  // Remember only what the reader chose, so a page that starts closed does not
  // save that as their choice.
  useEffect(() => {
    if (changedByReader.current && isDesktop()) writeSaved(sidebarOpen);
  }, [sidebarOpen]);

  const setAndRemember = useCallback<
    React.Dispatch<React.SetStateAction<boolean>>
  >((value) => {
    changedByReader.current = true;
    setSidebarOpen(value);
  }, []);

  return [sidebarOpen, setAndRemember];
};
