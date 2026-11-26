"use client";

import React from "react";
import Link from "next/link";
import { useAuth } from "@/hooks";
import { DotsIcon } from "@/components/icons";
import { useDismissOnOutside } from "@/hooks/useDismissOnOutside";

const ACTION_CLASS =
  "h-8 px-3 rounded-md text-sm font-medium border border-border bg-background text-foreground hover:bg-accent transition-colors cursor-pointer";
const MENU_ITEM_CLASS =
  "w-full flex items-center gap-2 px-3 py-2 rounded-md text-sm text-foreground hover:bg-muted transition-colors cursor-pointer";

/** A button the page adds to the top bar: in the bar on a wide screen, and in
 *  the ⋯ menu on a phone. */
export type PublicPageAction = { label: string; onClick: () => void };

interface PublicPageLayoutProps {
  children: React.ReactNode;
  title?: string;
  pills?: React.ReactNode;
  /** Buttons for this page, before the theme toggle. */
  actions?: PublicPageAction[];
  contentClassName?: string;
}

type Theme = "light" | "dark" | "device";

function applyTheme(theme: Theme) {
  const root = document.documentElement;
  root.classList.remove("light", "dark");
  if (theme === "device") {
    root.classList.add(
      window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light"
    );
  } else {
    root.classList.add(theme);
  }
}

function resolvedIsDark(theme: Theme): boolean {
  if (theme === "dark") return true;
  if (theme === "light") return false;
  return window.matchMedia("(prefers-color-scheme: dark)").matches;
}

export function PublicPageLayout({
  children,
  title,
  pills,
  actions = [],
  contentClassName = "max-w-7xl",
}: PublicPageLayoutProps) {
  const { isAuthenticated, isLoading } = useAuth();
  const [mounted, setMounted] = React.useState(false);
  const [isDark, setIsDark] = React.useState(false);
  const [menuOpen, setMenuOpen] = React.useState(false);
  const menuRef = React.useRef<HTMLDivElement>(null);
  useDismissOnOutside(menuOpen, menuRef, () => setMenuOpen(false));

  // On mount: read saved theme (same localStorage key as AppLayout) and apply it
  React.useEffect(() => {
    const saved = (localStorage.getItem("theme") as Theme | null) ?? "device";
    applyTheme(saved);
    setIsDark(resolvedIsDark(saved));
    setMounted(true);

    // Also track system preference changes while on this page
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    const onSystemChange = () => {
      const current = (localStorage.getItem("theme") as Theme | null) ?? "device";
      if (current === "device") {
        applyTheme("device");
        setIsDark(mq.matches);
      }
    };
    mq.addEventListener("change", onSystemChange);
    return () => mq.removeEventListener("change", onSystemChange);
  }, []);

  const toggleTheme = () => {
    const next: Theme = isDark ? "light" : "dark";
    localStorage.setItem("theme", next);
    applyTheme(next);
    setIsDark(!isDark);
  };

  const themeIcon = isDark ? (
                /* Sun icon */
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 3v2.25m6.364.386-1.591 1.591M21 12h-2.25m-.386 6.364-1.591-1.591M12 18.75V21m-4.773-4.227-1.591 1.591M5.25 12H3m4.227-4.773L5.636 5.636M15.75 12a3.75 3.75 0 1 1-7.5 0 3.75 3.75 0 0 1 7.5 0Z" />
                </svg>
              ) : (
                /* Moon icon */
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M21.752 15.002A9.72 9.72 0 0 1 18 15.75c-5.385 0-9.75-4.365-9.75-9.75 0-1.33.266-2.597.748-3.752A9.753 9.753 0 0 0 3 11.25C3 16.635 7.365 21 12.75 21a9.753 9.753 0 0 0 9.002-5.998Z" />
                </svg>
              );

  return (
    <div className="min-h-screen bg-background text-foreground flex flex-col">
      {/* Minimal top bar */}
      <header className="border-b border-border px-4 md:px-8 py-3 flex items-center justify-between gap-3 shrink-0">
        <Link href="/" className="flex items-center gap-2 hover:opacity-80 transition-opacity">
          <span className="text-[15px] font-semibold tracking-tight">Calibrate</span>
        </Link>
        {/* A phone's bar has room only for the wordmark and the buttons. */}
        {(title || pills) && (
          <div className="hidden md:flex items-center gap-2 min-w-0 max-w-[50%] mx-4">
            {title && (
              <span className="text-sm font-semibold text-foreground truncate">{title}</span>
            )}
            {pills && (
              <div className="flex items-center gap-1.5 shrink-0">{pills}</div>
            )}
          </div>
        )}
        {/* Right side: theme toggle + auth link — only after mount */}
        {mounted && (
          <div className="flex items-center gap-2 shrink-0">
            {/* Wide screen: the page's buttons and the theme toggle in the bar */}
            <div className="hidden md:flex items-center gap-2">
              {actions.map((action) => (
                <button
                  key={action.label}
                  type="button"
                  onClick={action.onClick}
                  className={ACTION_CLASS}
                >
                  {action.label}
                </button>
              ))}
              <button
                type="button"
                onClick={toggleTheme}
                className="w-8 h-8 flex items-center justify-center rounded-md text-muted-foreground hover:text-foreground hover:bg-muted transition-colors cursor-pointer"
                aria-label={isDark ? "Switch to light mode" : "Switch to dark mode"}
              >
                {themeIcon}
              </button>
            </div>
            {/* Auth link */}
            {!isLoading && (
              isAuthenticated ? (
                <Link
                  href="/agents"
                  className="inline-flex items-center h-8 px-4 rounded-lg text-[13px] font-medium bg-foreground text-background hover:opacity-90 transition-opacity cursor-pointer"
                >
                  Go to app
                </Link>
              ) : (
                <Link
                  href="/login"
                  className="inline-flex items-center h-8 px-4 rounded-lg text-[13px] font-medium bg-foreground text-background hover:opacity-90 transition-opacity cursor-pointer"
                >
                  Sign in
                </Link>
              )
            )}
            {/* Phone: the same, behind one ⋯ button, so the bar fits */}
            <div className="relative md:hidden" ref={menuRef}>
              <button
                type="button"
                onClick={() => setMenuOpen((o) => !o)}
                aria-label="More actions"
                aria-haspopup="menu"
                aria-expanded={menuOpen}
                className="h-8 w-8 rounded-md border border-border bg-background text-foreground hover:bg-accent transition-colors cursor-pointer flex items-center justify-center"
              >
                <DotsIcon className="w-4 h-4" />
              </button>
              {menuOpen && (
                <div
                  role="menu"
                  className="absolute right-0 top-10 min-w-44 bg-background border border-border rounded-xl shadow-lg z-50 overflow-hidden p-1"
                >
                  {actions.map((action) => (
                    <button
                      key={action.label}
                      type="button"
                      role="menuitem"
                      onClick={() => {
                        setMenuOpen(false);
                        action.onClick();
                      }}
                      className={MENU_ITEM_CLASS}
                    >
                      {action.label}
                    </button>
                  ))}
                  <button
                    type="button"
                    role="menuitem"
                    onClick={() => {
                      setMenuOpen(false);
                      toggleTheme();
                    }}
                    className={MENU_ITEM_CLASS}
                  >
                    {themeIcon}
                    {isDark ? "Light mode" : "Dark mode"}
                  </button>
                </div>
              )}
            </div>

          </div>
        )}
      </header>

      {/* Page content */}
      <main className={`flex-1 px-4 md:px-8 py-6 md:py-8 ${contentClassName} w-full mx-auto`}>
        {children}
      </main>
    </div>
  );
}

export function PublicNotFound({
  message,
  detail = "The results may have been made private, or the link may be incorrect.",
}: {
  message?: string;
  /** A second line under the message; null leaves it out. */
  detail?: string | null;
}) {
  return (
    <div className="flex flex-col items-center justify-center py-24 gap-4">
      <div className="w-12 h-12 rounded-full bg-muted flex items-center justify-center">
        <svg className="w-6 h-6 text-muted-foreground" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 10.5V6.75a4.5 4.5 0 119 0v3.75M3.75 21.75h10.5a2.25 2.25 0 002.25-2.25v-6.75a2.25 2.25 0 00-2.25-2.25H3.75a2.25 2.25 0 00-2.25 2.25v6.75a2.25 2.25 0 002.25 2.25z" />
        </svg>
      </div>
      <p className="text-[15px] font-medium text-foreground">
        {message ?? "This link is not available"}
      </p>
      {detail && (
        <p className="text-[13px] text-muted-foreground text-center max-w-sm">
          {detail}
        </p>
      )}
    </div>
  );
}

export function PublicLoading() {
  return (
    <div className="flex items-center justify-center py-24">
      <svg className="w-5 h-5 animate-spin text-muted-foreground" fill="none" viewBox="0 0 24 24">
        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
      </svg>
    </div>
  );
}
