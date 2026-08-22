import { useState, useEffect, useRef, useCallback } from "react";

const STORAGE_KEY = "sidebarOpen";

const isDesktop = () => window.innerWidth >= 768;

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
  const openRef = useRef(false);

  useEffect(() => {
    openRef.current = sidebarOpen;
  }, [sidebarOpen]);

  useEffect(() => {
    if (initialized) return;
    const desktop = isDesktop();
    const saved = desktop ? localStorage.getItem(STORAGE_KEY) : null;
    setSidebarOpen(
      saved !== null ? saved === "true" : desktop && openOnDesktop,
    );
    setInitialized(true);
  }, [initialized, openOnDesktop]);

  const setAndRemember = useCallback<
    React.Dispatch<React.SetStateAction<boolean>>
  >((value) => {
    const next =
      typeof value === "function"
        ? (value as (prev: boolean) => boolean)(openRef.current)
        : value;
    if (isDesktop()) localStorage.setItem(STORAGE_KEY, String(next));
    setSidebarOpen(next);
  }, []);

  return [sidebarOpen, setAndRemember];
};
