import { useState, useEffect } from "react";

/**
 * Hook to manage sidebar state based on screen size.
 * Desktop (>=768px): open by default
 * Mobile (<768px): closed by default
 *
 * Pass `false` for a page that wants the sidebar out of the way on desktop
 * too. Either way the reader can still open it from the menu button.
 *
 * Returns [sidebarOpen, setSidebarOpen] tuple.
 * The state is initialized after mount to avoid hydration mismatch.
 */
export const useSidebarState = (
  openOnDesktop = true,
): [boolean, React.Dispatch<React.SetStateAction<boolean>>] => {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [initialized, setInitialized] = useState(false);

  useEffect(() => {
    if (!initialized) {
      const isDesktop = window.innerWidth >= 768;
      setSidebarOpen(isDesktop && openOnDesktop);
      setInitialized(true);
    }
  }, [initialized, openOnDesktop]);

  return [sidebarOpen, setSidebarOpen];
};
